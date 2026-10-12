import type { MeetingStatus, MeetingType, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { scopeMeeting, type Ctx } from "../context";
import { BusinessRuleError, NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit, diff } from "../audit";
import { nextNumber } from "../numbers";
import { notify } from "../notifications";
import { asEnum, asUuid, contains, dateRange, paged, parseListParams, type SearchParams } from "../list";
import { assertOrgUser, resolveOwner } from "./users";
import { accountWhere } from "./accounts";
import { leadWhere } from "./leads";
import { parseDateOnly, parseLocalDateTime, todayUtc } from "@/lib/dates";
import { MEETING_STATUSES, MEETING_TYPES } from "@/lib/constants";
import { actionItemStatusSchema, meetingCreateSchema, meetingUpdateSchema, minuteCreateSchema } from "@/lib/validation/meeting";

export const MEETING_SORTS = ["number", "title", "scheduledAt", "status", "type", "createdAt"] as const;

export function meetingWhere(ctx: Ctx, extra: Prisma.MeetingWhereInput = {}): Prisma.MeetingWhereInput {
  return { organizationId: ctx.orgId, deletedAt: null, AND: [scopeMeeting(ctx), extra] };
}

export async function listMeetings(ctx: Ctx, sp: SearchParams) {
  ctx.require("meeting.view");
  const p = parseListParams(sp, MEETING_SORTS, "scheduledAt");
  const when = p.get("when");
  const now = new Date();
  const range = dateRange(p.get("from"), p.get("to"));
  const where = meetingWhere(ctx, {
    ...(p.q ? { OR: [{ title: contains(p.q) }, { number: contains(p.q) }, { account: { name: contains(p.q) } }, { lead: { name: contains(p.q) } }] } : {}),
    ...(asEnum(p.get("status"), MEETING_STATUSES) ? { status: p.get("status") as MeetingStatus } : {}),
    ...(asEnum(p.get("type"), MEETING_TYPES) ? { type: p.get("type") as MeetingType } : {}),
    ...(asUuid(p.get("assignee")) ? { assignedToId: p.get("assignee") } : {}),
    ...(asUuid(p.get("account")) ? { accountId: p.get("account") } : {}),
    ...(asUuid(p.get("lead")) ? { leadId: p.get("lead") } : {}),
    ...(when === "upcoming" ? { scheduledAt: { gte: now }, status: { in: ["SCHEDULED", "RESCHEDULED"] as MeetingStatus[] } } : {}),
    ...(when === "past" ? { scheduledAt: { lt: now } } : {}),
    ...(range ? { scheduledAt: range } : {}),
  });
  const [rows, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      include: {
        account: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, number: true } },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { minutes: true, actionItems: true } },
      },
      orderBy: { [p.sort]: p.dir },
      skip: p.skip,
      take: p.pageSize,
    }),
    prisma.meeting.count({ where }),
  ]);
  return paged(rows, total, p);
}

export async function getMeeting(ctx: Ctx, id: string) {
  ctx.require("meeting.view");
  const meeting = await prisma.meeting.findFirst({
    where: meetingWhere(ctx, { id }),
    include: {
      account: { select: { id: true, name: true, number: true } },
      lead: { select: { id: true, name: true, number: true, stage: true } },
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      modifiedBy: { select: { name: true } },
      contacts: { include: { contact: { select: { id: true, firstName: true, lastName: true, email: true, designation: true } } } },
      minutes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      actionItems: { orderBy: [{ status: "asc" }, { dueDate: "asc" }], include: { owner: { select: { id: true, name: true } } } },
      discussions: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } },
    },
  });
  if (!meeting) throw new NotFoundError("Meeting");
  return meeting;
}

/** Meeting history for a lead or account (chronological, newest first). */
export async function meetingHistory(ctx: Ctx, by: { leadId?: string; accountId?: string }) {
  return prisma.meeting.findMany({
    where: meetingWhere(ctx, by),
    include: { minutes: { orderBy: { createdAt: "desc" }, take: 1 }, assignedTo: { select: { name: true } } },
    orderBy: { scheduledAt: "desc" },
    take: 100,
  });
}

async function resolveLinks(ctx: Ctx, accountId: string | null, leadId: string | null, contactIds: string[]) {
  let finalAccountId = accountId;
  if (leadId) {
    const lead = await prisma.lead.findFirst({ where: leadWhere(ctx, { id: leadId }), select: { id: true, accountId: true } });
    if (!lead) throw new ValidationError({ leadId: "Select a lead you have access to" });
    if (!finalAccountId && lead.accountId) finalAccountId = lead.accountId;
    if (finalAccountId && lead.accountId && lead.accountId !== finalAccountId) {
      throw new ValidationError({ leadId: "The lead belongs to a different account" });
    }
  }
  if (finalAccountId) {
    const account = await prisma.account.findFirst({ where: accountWhere(ctx, { id: finalAccountId }), select: { id: true } });
    if (!account) throw new ValidationError({ accountId: "Select an account you have access to" });
  }
  if (contactIds.length) {
    const contacts = await prisma.contact.findMany({ where: { id: { in: contactIds }, organizationId: ctx.orgId, deletedAt: null }, select: { id: true, accountId: true } });
    if (contacts.length !== new Set(contactIds).size) throw new ValidationError({ contactIds: "One or more contacts are invalid" });
    if (finalAccountId && contacts.some((c) => c.accountId && c.accountId !== finalAccountId)) {
      throw new ValidationError({ contactIds: "Customer contacts must belong to the meeting's account" });
    }
  }
  return finalAccountId;
}

async function createActionItems(tx: Tx, ctx: Ctx, meetingId: string, items: { description: string; ownerId: string; dueDate?: string }[], meetingTitle: string) {
  for (const item of items) {
    await assertOrgUser(tx, ctx, item.ownerId, "actionItems");
    const created = await tx.actionItem.create({
      data: { meetingId, description: item.description, ownerId: item.ownerId, dueDate: parseDateOnly(item.dueDate) },
    });
    await notify(tx, ctx, {
      userId: item.ownerId,
      type: "action_assigned",
      title: `Action item from “${meetingTitle}”`,
      body: item.description.slice(0, 140),
      link: `/meetings/${meetingId}`,
      dedupeKey: `action-assigned:${created.id}`,
    });
  }
}

export async function createMeeting(ctx: Ctx, input: unknown) {
  ctx.require("meeting.create");
  const data = parseInput(meetingCreateSchema, input);
  const assignedToId = resolveOwner(ctx, data.assignedToId, "meeting.assign");
  await assertOrgUser(prisma, ctx, assignedToId, "assignedToId");
  const scheduledAt = parseLocalDateTime(data.scheduledAt, ctx.org.timezone);
  if (!scheduledAt) throw new ValidationError({ scheduledAt: "Enter a valid date and time" });
  const accountId = await resolveLinks(ctx, nn(data.accountId), nn(data.leadId), data.contactIds);
  const minutes = data.minutes;
  const hasMinutes = Boolean(minutes?.summary?.trim());
  if (!hasMinutes && minutes?.actionItems?.length) throw new ValidationError({ "minutes.summary": "Add a discussion summary to record action items" });

  return prisma.$transaction(async (tx) => {
    const meeting = await tx.meeting.create({
      data: {
        organizationId: ctx.orgId,
        number: await nextNumber(tx, ctx.orgId, "meeting", "MTG"),
        title: data.title,
        scheduledAt,
        durationMins: Number(data.durationMins),
        type: data.type,
        status: data.status,
        location: nn(data.location),
        agenda: nn(data.agenda),
        accountId,
        leadId: nn(data.leadId),
        assignedToId,
        nextFollowUpAt: parseDateOnly(data.nextFollowUpAt),
        createdById: ctx.userId,
        modifiedById: ctx.userId,
        contacts: { create: [...new Set(data.contactIds)].map((contactId) => ({ contactId })) },
      },
    });
    if (hasMinutes && minutes) {
      await tx.meetingMinute.create({
        data: {
          meetingId: meeting.id,
          summary: minutes.summary!,
          requirements: nn(minutes.requirements),
          decisions: nn(minutes.decisions),
          notes: nn(minutes.notes),
          authorId: ctx.userId,
        },
      });
      await createActionItems(tx, ctx, meeting.id, minutes.actionItems ?? [], meeting.title);
    }
    await audit(tx, ctx, { entityType: "Meeting", entityId: meeting.id, action: "created", summary: `Scheduled meeting ${meeting.number} ${meeting.title}` });
    await notify(tx, ctx, { userId: assignedToId, type: "meeting_assigned", title: `Meeting assigned: ${meeting.title}`, link: `/meetings/${meeting.id}` });
    return meeting;
  });
}

export async function updateMeeting(ctx: Ctx, input: unknown) {
  ctx.require("meeting.edit");
  const data = parseInput(meetingUpdateSchema, input);
  const existing = await prisma.meeting.findFirst({ where: meetingWhere(ctx, { id: data.id }), include: { contacts: true } });
  if (!existing) throw new NotFoundError("Meeting");
  const assignedToId = ctx.can("meeting.assign") ? data.assignedToId : existing.assignedToId;
  await assertOrgUser(prisma, ctx, assignedToId, "assignedToId");
  const scheduledAt = parseLocalDateTime(data.scheduledAt, ctx.org.timezone);
  if (!scheduledAt) throw new ValidationError({ scheduledAt: "Enter a valid date and time" });
  const accountId = await resolveLinks(ctx, nn(data.accountId), nn(data.leadId), data.contactIds);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.meeting.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        scheduledAt,
        durationMins: Number(data.durationMins),
        type: data.type,
        status: data.status,
        location: nn(data.location),
        agenda: nn(data.agenda),
        accountId,
        leadId: nn(data.leadId),
        assignedToId,
        nextFollowUpAt: parseDateOnly(data.nextFollowUpAt),
        modifiedById: ctx.userId,
      },
    });
    await tx.meetingContact.deleteMany({ where: { meetingId: existing.id } });
    if (data.contactIds.length) {
      await tx.meetingContact.createMany({ data: [...new Set(data.contactIds)].map((contactId) => ({ meetingId: existing.id, contactId })) });
    }
    const changes = diff(existing, updated, ["title", "scheduledAt", "type", "status", "accountId", "leadId", "assignedToId", "nextFollowUpAt"]);
    await audit(tx, ctx, { entityType: "Meeting", entityId: existing.id, action: "updated", summary: `Updated meeting ${existing.number}`, changes });
    if (assignedToId !== existing.assignedToId) {
      await notify(tx, ctx, { userId: assignedToId, type: "meeting_assigned", title: `Meeting assigned: ${updated.title}`, link: `/meetings/${existing.id}` });
    }
    return updated;
  });
}

export async function addMinutes(ctx: Ctx, input: unknown) {
  ctx.require("meeting.edit");
  const data = parseInput(minuteCreateSchema, input);
  const meeting = await prisma.meeting.findFirst({ where: meetingWhere(ctx, { id: data.meetingId }) });
  if (!meeting) throw new NotFoundError("Meeting");
  if (meeting.status === "CANCELLED") throw new BusinessRuleError("Minutes cannot be recorded for a cancelled meeting.");
  return prisma.$transaction(async (tx) => {
    const minute = await tx.meetingMinute.create({
      data: {
        meetingId: meeting.id,
        summary: data.summary,
        requirements: nn(data.requirements),
        decisions: nn(data.decisions),
        notes: nn(data.notes),
        authorId: ctx.userId,
      },
    });
    await createActionItems(tx, ctx, meeting.id, data.actionItems, meeting.title);
    if (data.markCompleted && meeting.status !== "COMPLETED") {
      await tx.meeting.update({ where: { id: meeting.id }, data: { status: "COMPLETED", modifiedById: ctx.userId } });
    }
    await audit(tx, ctx, {
      entityType: "Meeting",
      entityId: meeting.id,
      action: "minutes_added",
      summary: `Recorded MOM for ${meeting.number} with ${data.actionItems.length} action item(s)`,
    });
    return minute;
  });
}

export async function updateActionItemStatus(ctx: Ctx, input: unknown) {
  const data = parseInput(actionItemStatusSchema, input);
  const item = await prisma.actionItem.findFirst({ where: { id: data.id, meeting: { organizationId: ctx.orgId, deletedAt: null } }, include: { meeting: true } });
  if (!item) throw new NotFoundError("Action item");
  // Action-item owners may always update their own items; otherwise meeting edit rights are required.
  if (item.ownerId !== ctx.userId) {
    ctx.require("meeting.edit");
    const visible = await prisma.meeting.findFirst({ where: meetingWhere(ctx, { id: item.meetingId }), select: { id: true } });
    if (!visible) throw new NotFoundError("Action item");
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.actionItem.update({
      where: { id: item.id },
      data: { status: data.status, completedAt: data.status === "DONE" ? new Date() : null },
    });
    await audit(tx, ctx, {
      entityType: "Meeting",
      entityId: item.meetingId,
      action: "action_item_updated",
      summary: `Action item “${item.description.slice(0, 60)}” → ${data.status}`,
      changes: { status: { from: item.status, to: data.status } },
    });
    return updated;
  });
}

export async function archiveMeeting(ctx: Ctx, id: string) {
  ctx.require("meeting.delete");
  const existing = await prisma.meeting.findFirst({ where: meetingWhere(ctx, { id }) });
  if (!existing) throw new NotFoundError("Meeting");
  await prisma.$transaction(async (tx) => {
    await tx.meeting.update({ where: { id }, data: { deletedAt: new Date(), modifiedById: ctx.userId } });
    await audit(tx, ctx, { entityType: "Meeting", entityId: id, action: "archived", summary: `Archived meeting ${existing.number}` });
  });
}

/**
 * Follow-up commitments for the follow-up view and dashboard: open action items,
 * lead follow-up dates and upcoming meetings — for the current user or (with ALL scope) everyone.
 */
export async function getFollowUps(ctx: Ctx, opts: { mine?: boolean; days?: number } = {}) {
  ctx.require("meeting.view");
  const today = todayUtc();
  const horizon = new Date(today.getTime() + (opts.days ?? 14) * 24 * 60 * 60 * 1000);
  const mineOnly = opts.mine || ctx.dataScope === "OWN";
  const now = new Date();

  const [actionItems, leads, meetings] = await Promise.all([
    prisma.actionItem.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        meeting: { organizationId: ctx.orgId, deletedAt: null },
        ...(mineOnly ? { ownerId: ctx.userId } : {}),
        OR: [{ dueDate: { lte: horizon } }, { dueDate: null }],
      },
      include: { owner: { select: { id: true, name: true } }, meeting: { select: { id: true, number: true, title: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      take: 100,
    }),
    prisma.lead.findMany({
      where: {
        organizationId: ctx.orgId,
        deletedAt: null,
        stage: { not: "CONVERTED" },
        nextFollowUpAt: { lte: horizon },
        ...(mineOnly ? { ownerId: ctx.userId } : {}),
      },
      select: { id: true, number: true, name: true, companyName: true, stage: true, nextFollowUpAt: true, owner: { select: { name: true } } },
      orderBy: { nextFollowUpAt: "asc" },
      take: 100,
    }),
    prisma.meeting.findMany({
      where: meetingWhere(ctx, {
        status: { in: ["SCHEDULED", "RESCHEDULED"] },
        scheduledAt: { gte: now, lte: horizon },
        ...(mineOnly ? { assignedToId: ctx.userId } : {}),
      }),
      include: { account: { select: { name: true } }, lead: { select: { name: true } }, assignedTo: { select: { name: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 100,
    }),
  ]);
  const isOverdue = (d: Date | null) => Boolean(d && d < today);
  return {
    today,
    actionItems: actionItems.map((a) => ({ ...a, overdue: isOverdue(a.dueDate) })),
    leads: leads.map((l) => ({ ...l, overdue: isOverdue(l.nextFollowUpAt) })),
    meetings,
  };
}
