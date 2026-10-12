import type { Prisma, TicketCategory, TicketPriority, TicketStatus } from "@prisma/client";
import { prisma } from "../db";
import { scopeTicket, type Ctx } from "../context";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit } from "../audit";
import { nextNumber } from "../numbers";
import { notify } from "../notifications";
import { isEmailConfigured, sendEmail } from "../mailer";
import { asEnum, asUuid, contains, dateRange, paged, parseListParams, type SearchParams } from "../list";
import { assertOrgUser } from "./users";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, TICKET_STATUS_META } from "@/lib/constants";
import { checkTicketTransition } from "@/lib/workflows";
import {
  ticketAssignSchema,
  ticketCreateSchema,
  ticketMessageSchema,
  ticketPrioritySchema,
  ticketStatusSchema,
  ticketUpdateSchema,
} from "@/lib/validation/ticket";

export const TICKET_SORTS = ["number", "subject", "priority", "status", "createdAt", "updatedAt", "resolvedAt"] as const;

export function ticketWhere(ctx: Ctx, extra: Prisma.TicketWhereInput = {}): Prisma.TicketWhereInput {
  return { organizationId: ctx.orgId, deletedAt: null, AND: [scopeTicket(ctx), extra] };
}

export async function listTickets(ctx: Ctx, sp: SearchParams) {
  ctx.require("ticket.view");
  const p = parseListParams(sp, TICKET_SORTS, "createdAt");
  const assignee = p.get("assignee");
  const created = dateRange(p.get("createdFrom"), p.get("createdTo"));
  const open = p.get("open") === "1";
  const where = ticketWhere(ctx, {
    ...(p.q ? { OR: [{ subject: contains(p.q) }, { number: contains(p.q) }, { account: { name: contains(p.q) } }, { description: contains(p.q) }] } : {}),
    ...(asEnum(p.get("status"), TICKET_STATUSES) ? { status: p.get("status") as TicketStatus } : {}),
    ...(open ? { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"] as TicketStatus[] } } : {}),
    ...(asEnum(p.get("priority"), TICKET_PRIORITIES) ? { priority: p.get("priority") as TicketPriority } : {}),
    ...(asEnum(p.get("category"), TICKET_CATEGORIES) ? { category: p.get("category") as TicketCategory } : {}),
    ...(assignee === "unassigned" ? { assignedToId: null } : assignee === "me" ? { assignedToId: ctx.userId } : asUuid(assignee) ? { assignedToId: assignee } : {}),
    ...(asUuid(p.get("account")) ? { accountId: p.get("account") } : {}),
    ...(asUuid(p.get("order")) ? { orderId: p.get("order") } : {}),
    ...(created ? { createdAt: created } : {}),
  });
  const [rows, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, number: true } },
        order: { select: { id: true, number: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { [p.sort]: p.dir },
      skip: p.skip,
      take: p.pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);
  return paged(rows, total, p);
}

export async function getTicket(ctx: Ctx, id: string) {
  ctx.require("ticket.view");
  const ticket = await prisma.ticket.findFirst({
    where: ticketWhere(ctx, { id }),
    include: {
      account: { select: { id: true, name: true, number: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      lead: { select: { id: true, number: true, name: true } },
      order: { select: { id: true, number: true, status: true } },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!ticket) throw new NotFoundError("Ticket");
  return ticket;
}

async function validateLinks(ctx: Ctx, data: { accountId: string; contactId?: string; leadId?: string; orderId?: string }) {
  const account = await prisma.account.findFirst({ where: { id: data.accountId, organizationId: ctx.orgId, deletedAt: null }, select: { id: true } });
  if (!account) throw new ValidationError({ accountId: "Select a valid account" });
  if (data.contactId) {
    const c = await prisma.contact.findFirst({ where: { id: data.contactId, organizationId: ctx.orgId, deletedAt: null } });
    if (!c || (c.accountId && c.accountId !== data.accountId)) throw new ValidationError({ contactId: "The contact must belong to the selected account" });
  }
  if (data.leadId) {
    const l = await prisma.lead.findFirst({ where: { id: data.leadId, organizationId: ctx.orgId, deletedAt: null } });
    if (!l || (l.accountId && l.accountId !== data.accountId)) throw new ValidationError({ leadId: "The lead must belong to the selected account" });
  }
  if (data.orderId) {
    const o = await prisma.order.findFirst({ where: { id: data.orderId, organizationId: ctx.orgId, deletedAt: null } });
    if (!o || o.accountId !== data.accountId) throw new ValidationError({ orderId: "The order must belong to the selected account" });
  }
}

export async function createTicket(ctx: Ctx, input: unknown) {
  ctx.require("ticket.create");
  const data = parseInput(ticketCreateSchema, input);
  await validateLinks(ctx, data);
  const assignedToId = ctx.can("ticket.assign") ? nn(data.assignedToId) : null;
  if (assignedToId) await assertOrgUser(prisma, ctx, assignedToId, "assignedToId");

  return prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        organizationId: ctx.orgId,
        number: await nextNumber(tx, ctx.orgId, "ticket", "TKT"),
        subject: data.subject,
        description: data.description,
        category: data.category,
        priority: data.priority,
        accountId: data.accountId,
        contactId: nn(data.contactId),
        leadId: nn(data.leadId),
        orderId: nn(data.orderId),
        assignedToId,
        createdById: ctx.userId,
      },
    });
    if (data.internalNote) {
      await tx.ticketMessage.create({ data: { ticketId: ticket.id, kind: "INTERNAL_NOTE", body: data.internalNote, authorId: ctx.userId } });
    }
    if (assignedToId) await tx.ticketEvent.create({ data: { ticketId: ticket.id, field: "assignedTo", fromValue: null, toValue: assignedToId, actorId: ctx.userId } });
    await audit(tx, ctx, { entityType: "Ticket", entityId: ticket.id, action: "created", summary: `Opened ticket ${ticket.number}: ${ticket.subject}` });
    await notify(tx, ctx, { userId: assignedToId, type: "ticket_assigned", title: `Ticket assigned: ${ticket.subject}`, body: ticket.number, link: `/tickets/${ticket.id}` });
    return ticket;
  });
}

async function loadForWrite(ctx: Ctx, id: string, version: number) {
  const t = await prisma.ticket.findFirst({ where: ticketWhere(ctx, { id }) });
  if (!t) throw new NotFoundError("Ticket");
  if (t.version !== version) throw new ConflictError();
  return t;
}

async function bump(id: string, version: number, data: Prisma.TicketUncheckedUpdateManyInput, tx: Prisma.TransactionClient) {
  const res = await tx.ticket.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
  if (res.count === 0) throw new ConflictError();
}

export async function updateTicket(ctx: Ctx, input: unknown) {
  ctx.require("ticket.edit");
  const data = parseInput(ticketUpdateSchema, input);
  const t = await loadForWrite(ctx, data.id, data.version);
  await validateLinks(ctx, data);
  return prisma.$transaction(async (tx) => {
    await bump(t.id, data.version, {
      subject: data.subject,
      description: data.description,
      category: data.category,
      accountId: data.accountId,
      contactId: nn(data.contactId),
      leadId: nn(data.leadId),
      orderId: nn(data.orderId),
    }, tx);
    await audit(tx, ctx, { entityType: "Ticket", entityId: t.id, action: "updated", summary: `Updated ticket ${t.number}` });
    return { id: t.id };
  });
}

export async function changeTicketStatus(ctx: Ctx, input: unknown) {
  ctx.require("ticket.edit");
  const data = parseInput(ticketStatusSchema, input);
  const t = await loadForWrite(ctx, data.id, data.version);
  const check = checkTicketTransition(t.status, data.status);
  if (!check.ok) throw new BusinessRuleError(check.reason);
  const resolving = data.status === "RESOLVED";
  if (resolving && ctx.settings.tickets.requireResolutionNote && !data.resolutionNote?.trim()) {
    throw new ValidationError({ resolutionNote: "Add a resolution note before resolving the ticket" });
  }
  const now = new Date();
  const reopening = data.status === "OPEN" || data.status === "IN_PROGRESS";
  return prisma.$transaction(async (tx) => {
    await bump(t.id, data.version, {
      status: data.status,
      ...(resolving ? { resolvedAt: now, resolutionNote: data.resolutionNote } : {}),
      ...(data.status === "CLOSED" ? { closedAt: now, resolvedAt: t.resolvedAt ?? now } : {}),
      ...(reopening && (t.status === "RESOLVED" || t.status === "CLOSED") ? { resolvedAt: null, closedAt: null } : {}),
    }, tx);
    await tx.ticketEvent.create({ data: { ticketId: t.id, field: "status", fromValue: t.status, toValue: data.status, actorId: ctx.userId } });
    await audit(tx, ctx, {
      entityType: "Ticket",
      entityId: t.id,
      action: "status_changed",
      summary: `${t.number}: ${TICKET_STATUS_META[t.status].label} → ${TICKET_STATUS_META[data.status].label}`,
      changes: { status: { from: t.status, to: data.status } },
    });
    await notify(tx, ctx, { userId: t.assignedToId, type: "ticket_status", title: `${t.number} is now ${TICKET_STATUS_META[data.status].label}`, link: `/tickets/${t.id}` });
    await notify(tx, ctx, { userId: t.createdById, type: "ticket_status", title: `${t.number} is now ${TICKET_STATUS_META[data.status].label}`, link: `/tickets/${t.id}` });
    return { id: t.id };
  });
}

export async function changeTicketPriority(ctx: Ctx, input: unknown) {
  ctx.require("ticket.edit");
  const data = parseInput(ticketPrioritySchema, input);
  const t = await loadForWrite(ctx, data.id, data.version);
  if (t.priority === data.priority) return { id: t.id };
  return prisma.$transaction(async (tx) => {
    await bump(t.id, data.version, { priority: data.priority }, tx);
    await tx.ticketEvent.create({ data: { ticketId: t.id, field: "priority", fromValue: t.priority, toValue: data.priority, actorId: ctx.userId } });
    await audit(tx, ctx, { entityType: "Ticket", entityId: t.id, action: "priority_changed", summary: `${t.number} priority ${t.priority} → ${data.priority}`, changes: { priority: { from: t.priority, to: data.priority } } });
    return { id: t.id };
  });
}

export async function assignTicket(ctx: Ctx, input: unknown) {
  ctx.require("ticket.assign");
  const data = parseInput(ticketAssignSchema, input);
  const t = await loadForWrite(ctx, data.id, data.version);
  const to = nn(data.assignedToId);
  if (to === t.assignedToId) return { id: t.id };
  const agent = to ? await assertOrgUser(prisma, ctx, to, "assignedToId") : null;
  return prisma.$transaction(async (tx) => {
    await bump(t.id, data.version, { assignedToId: to }, tx);
    await tx.ticketEvent.create({ data: { ticketId: t.id, field: "assignedTo", fromValue: t.assignedToId, toValue: to, actorId: ctx.userId } });
    await audit(tx, ctx, {
      entityType: "Ticket",
      entityId: t.id,
      action: "assigned",
      summary: agent ? `Assigned ${t.number} to ${agent.name}` : `Unassigned ${t.number}`,
      changes: { assignedToId: { from: t.assignedToId, to } },
    });
    await notify(tx, ctx, { userId: to, type: "ticket_assigned", title: `Ticket assigned: ${t.subject}`, body: t.number, link: `/tickets/${t.id}` });
    return { id: t.id };
  });
}

/**
 * Adds an internal note or a customer-visible reply. Customer replies require their own
 * permission and are only emailed when an email provider is configured; otherwise they are
 * recorded with delivery status RECORDED_ONLY so nobody assumes the customer received them.
 */
export async function addTicketMessage(ctx: Ctx, input: unknown) {
  const data = parseInput(ticketMessageSchema, input);
  ctx.require("ticket.edit");
  if (data.kind === "CUSTOMER_REPLY" && !ctx.can("ticket.reply_customer")) throw new ForbiddenError("You are not allowed to send customer-visible replies.");
  const t = await prisma.ticket.findFirst({ where: ticketWhere(ctx, { id: data.ticketId }), include: { contact: { select: { email: true } } } });
  if (!t) throw new NotFoundError("Ticket");
  if (t.status === "CLOSED") throw new BusinessRuleError("Reopen the ticket before adding messages.");

  let delivery: "NOT_APPLICABLE" | "RECORDED_ONLY" | "SENT" | "FAILED" = "NOT_APPLICABLE";
  if (data.kind === "CUSTOMER_REPLY") {
    if (!isEmailConfigured() || !t.contact?.email) delivery = "RECORDED_ONLY";
    else delivery = (await sendEmail({ to: t.contact.email, subject: `[${t.number}] ${t.subject}`, text: data.body })) ? "SENT" : "FAILED";
  }
  return prisma.$transaction(async (tx) => {
    const msg = await tx.ticketMessage.create({ data: { ticketId: t.id, kind: data.kind, body: data.body, delivery, authorId: ctx.userId } });
    await tx.ticket.update({ where: { id: t.id }, data: { updatedAt: new Date() } });
    await audit(tx, ctx, {
      entityType: "Ticket",
      entityId: t.id,
      action: data.kind === "CUSTOMER_REPLY" ? "customer_reply" : "internal_note",
      summary: `${data.kind === "CUSTOMER_REPLY" ? "Customer reply" : "Internal note"} on ${t.number}`,
    });
    return msg;
  });
}

export async function archiveTicket(ctx: Ctx, id: string) {
  ctx.require("ticket.delete");
  const t = await prisma.ticket.findFirst({ where: ticketWhere(ctx, { id }) });
  if (!t) throw new NotFoundError("Ticket");
  await prisma.$transaction(async (tx) => {
    await tx.ticket.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(tx, ctx, { entityType: "Ticket", entityId: id, action: "archived", summary: `Archived ticket ${t.number}` });
  });
}
