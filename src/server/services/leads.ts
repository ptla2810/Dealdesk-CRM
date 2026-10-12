import type { LeadStage, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { scopeOwner, type Ctx } from "../context";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit, diff } from "../audit";
import { nextNumber } from "../numbers";
import { notify } from "../notifications";
import { asEnum, asUuid, contains, dateRange, paged, parseListParams, type SearchParams } from "../list";
import { assertOrgUser, resolveOwner } from "./users";
import { accountWhere, createAccountTx } from "./accounts";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { parseDateOnly } from "@/lib/dates";
import { LEAD_STAGES, LEAD_STAGE_META } from "@/lib/constants";
import { checkLeadConversion, checkLeadStageChange } from "@/lib/workflows";
import {
  discussionSchema,
  leadAssignSchema,
  leadConvertSchema,
  leadCreateSchema,
  leadStageChangeSchema,
  leadUpdateSchema,
} from "@/lib/validation/lead";
import { accountFields } from "@/lib/validation/account";

export const LEAD_SORTS = ["number", "name", "companyName", "stage", "estimatedValue", "createdAt", "updatedAt", "nextFollowUpAt"] as const;

export function leadWhere(ctx: Ctx, extra: Prisma.LeadWhereInput = {}): Prisma.LeadWhereInput {
  return { organizationId: ctx.orgId, deletedAt: null, ...scopeOwner(ctx), ...extra };
}

export function leadFilters(ctx: Ctx, sp: SearchParams) {
  const p = parseListParams(sp, LEAD_SORTS, "createdAt");
  const created = dateRange(p.get("createdFrom"), p.get("createdTo"));
  const followUp = dateRange(p.get("followUpFrom"), p.get("followUpTo"));
  const where = leadWhere(ctx, {
    ...(p.q
      ? {
          OR: [
            { name: contains(p.q) },
            { email: contains(p.q) },
            { companyName: contains(p.q) },
            { number: contains(p.q) },
            { phone: { contains: p.q.replace(/[^\d+]/g, "") || p.q } },
          ],
        }
      : {}),
    ...(asEnum(p.get("stage"), LEAD_STAGES) ? { stage: p.get("stage") as LeadStage } : {}),
    ...(asUuid(p.get("source")) ? { sourceId: p.get("source") } : {}),
    ...(asUuid(p.get("owner")) ? { ownerId: p.get("owner") } : {}),
    ...(asUuid(p.get("account")) ? { accountId: p.get("account") } : {}),
    ...(created ? { createdAt: created } : {}),
    ...(followUp ? { nextFollowUpAt: followUp } : {}),
    ...(p.get("overdue") === "1" ? { nextFollowUpAt: { lt: new Date() }, stage: { not: "CONVERTED" as const } } : {}),
  });
  return { p, where };
}

const listInclude = {
  account: { select: { id: true, name: true, number: true } },
  source: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  modifiedBy: { select: { name: true } },
} satisfies Prisma.LeadInclude;

export async function listLeads(ctx: Ctx, sp: SearchParams) {
  ctx.require("lead.view");
  const { p, where } = leadFilters(ctx, sp);
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({ where, include: listInclude, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.pageSize }),
    prisma.lead.count({ where }),
  ]);
  return paged(rows, total, p);
}

export async function exportLeads(ctx: Ctx, sp: SearchParams) {
  ctx.require("lead.export");
  const { p, where } = leadFilters(ctx, sp);
  return prisma.lead.findMany({ where, include: listInclude, orderBy: { [p.sort]: p.dir }, take: 10000 });
}

export async function getLead(ctx: Ctx, id: string) {
  ctx.require("lead.view");
  const lead = await prisma.lead.findFirst({
    where: leadWhere(ctx, { id }),
    include: {
      ...listInclude,
      convertedBy: { select: { name: true } },
      stageHistory: { orderBy: { changedAt: "desc" }, include: { changedBy: { select: { name: true } } } },
      discussions: {
        orderBy: [{ discussedAt: "desc" }, { createdAt: "desc" }],
        include: { responsible: { select: { name: true } }, createdBy: { select: { name: true } }, meeting: { select: { id: true, number: true, title: true } } },
      },
      contacts: { include: { contact: true } },
      meetings: { where: { deletedAt: null }, orderBy: { scheduledAt: "desc" }, include: { assignedTo: { select: { name: true } } } },
      orders: { where: { deletedAt: null }, orderBy: { orderDate: "desc" } },
      tickets: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) throw new NotFoundError("Lead");
  return lead;
}

async function assertSource(ctx: Ctx, sourceId: string) {
  const source = await prisma.leadSource.findFirst({ where: { id: sourceId, organizationId: ctx.orgId, isActive: true } });
  if (!source) throw new ValidationError({ sourceId: "Select an active lead source" });
}

async function assertAccount(ctx: Ctx, accountId: string | null) {
  if (!accountId) return;
  const account = await prisma.account.findFirst({ where: accountWhere(ctx, { id: accountId }), select: { id: true } });
  if (!account) throw new ValidationError({ accountId: "Select an account you have access to" });
}

export async function createLead(ctx: Ctx, input: unknown) {
  ctx.require("lead.create");
  const data = parseInput(leadCreateSchema, input);
  const ownerId = resolveOwner(ctx, data.ownerId, "lead.assign");
  await Promise.all([assertOrgUser(prisma, ctx, ownerId), assertSource(ctx, data.sourceId), assertAccount(ctx, nn(data.accountId))]);

  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        organizationId: ctx.orgId,
        number: await nextNumber(tx, ctx.orgId, "lead", "LD"),
        name: data.name,
        email: normalizeEmail(data.email),
        phone: normalizePhone(data.phone)!,
        companyName: data.companyName,
        accountId: nn(data.accountId),
        sourceId: data.sourceId,
        ownerId,
        stage: data.stage,
        estimatedValue: data.estimatedValue,
        currency: ctx.org.baseCurrency,
        description: data.description,
        nextFollowUpAt: parseDateOnly(data.nextFollowUpAt),
        createdById: ctx.userId,
        modifiedById: ctx.userId,
      },
    });
    await tx.leadStageHistory.create({ data: { leadId: lead.id, fromStage: null, toStage: lead.stage, changedById: ctx.userId, note: "Lead created" } });
    await audit(tx, ctx, { entityType: "Lead", entityId: lead.id, action: "created", summary: `Created lead ${lead.number} ${lead.name}` });
    await notify(tx, ctx, { userId: ownerId, type: "lead_assigned", title: `New lead assigned: ${lead.name}`, body: lead.companyName, link: `/leads/${lead.id}` });
    return lead;
  });
}

async function loadForWrite(ctx: Ctx, id: string, version: number) {
  const lead = await prisma.lead.findFirst({ where: leadWhere(ctx, { id }) });
  if (!lead) throw new NotFoundError("Lead");
  if (lead.version !== version) throw new ConflictError();
  return lead;
}

const AUDITED_FIELDS = ["name", "email", "phone", "companyName", "accountId", "sourceId", "ownerId", "estimatedValue", "description", "nextFollowUpAt"] as const;

export async function updateLead(ctx: Ctx, input: unknown) {
  ctx.require("lead.edit");
  const data = parseInput(leadUpdateSchema, input);
  const existing = await loadForWrite(ctx, data.id, data.version);
  const ownerId = ctx.can("lead.assign") ? data.ownerId : existing.ownerId;
  await Promise.all([assertOrgUser(prisma, ctx, ownerId), assertSource(ctx, data.sourceId), assertAccount(ctx, nn(data.accountId))]);
  if (existing.stage === "CONVERTED" && nn(data.accountId) !== existing.accountId) {
    throw new BusinessRuleError("The account of a converted lead cannot be changed.");
  }

  return prisma.$transaction(async (tx) => {
    const next = {
      name: data.name,
      email: normalizeEmail(data.email),
      phone: normalizePhone(data.phone)!,
      companyName: data.companyName,
      accountId: nn(data.accountId),
      sourceId: data.sourceId,
      ownerId,
      estimatedValue: data.estimatedValue,
      description: data.description,
      nextFollowUpAt: parseDateOnly(data.nextFollowUpAt),
      modifiedById: ctx.userId,
    };
    const res = await tx.lead.updateMany({ where: { id: existing.id, version: data.version }, data: { ...next, version: { increment: 1 } } });
    if (res.count === 0) throw new ConflictError();
    const changes = diff(existing as unknown as Record<string, unknown>, { ...next, estimatedValue: Number(next.estimatedValue).toFixed(2) }, [...AUDITED_FIELDS]);
    if (changes.estimatedValue && Number(changes.estimatedValue.from) === Number(changes.estimatedValue.to)) delete changes.estimatedValue;
    await audit(tx, ctx, { entityType: "Lead", entityId: existing.id, action: "updated", summary: `Updated lead ${existing.number}`, changes });
    if (ownerId !== existing.ownerId) {
      await notify(tx, ctx, { userId: ownerId, type: "lead_assigned", title: `Lead assigned to you: ${data.name}`, link: `/leads/${existing.id}` });
    }
    return { id: existing.id };
  });
}

export async function assignLead(ctx: Ctx, input: unknown) {
  ctx.require("lead.assign");
  const data = parseInput(leadAssignSchema, input);
  const existing = await loadForWrite(ctx, data.id, data.version);
  if (existing.ownerId === data.ownerId) return { id: existing.id };
  const owner = await assertOrgUser(prisma, ctx, data.ownerId);
  return prisma.$transaction(async (tx) => {
    const res = await tx.lead.updateMany({
      where: { id: existing.id, version: data.version },
      data: { ownerId: owner.id, modifiedById: ctx.userId, version: { increment: 1 } },
    });
    if (res.count === 0) throw new ConflictError();
    await audit(tx, ctx, {
      entityType: "Lead",
      entityId: existing.id,
      action: "assigned",
      summary: `Reassigned lead ${existing.number} to ${owner.name}`,
      changes: { ownerId: { from: existing.ownerId, to: owner.id } },
    });
    await notify(tx, ctx, { userId: owner.id, type: "lead_assigned", title: `Lead assigned to you: ${existing.name}`, link: `/leads/${existing.id}` });
    return { id: existing.id };
  });
}

export async function changeLeadStage(ctx: Ctx, input: unknown) {
  ctx.require("lead.change_stage");
  const data = parseInput(leadStageChangeSchema, input);
  const existing = await loadForWrite(ctx, data.id, data.version);
  const check = checkLeadStageChange(existing.stage, data.toStage, ctx.settings.leadWorkflow);
  if (!check.ok) throw new BusinessRuleError(check.reason);
  const reopening = existing.stage === "CONVERTED";

  return prisma.$transaction(async (tx) => {
    const res = await tx.lead.updateMany({
      where: { id: existing.id, version: data.version, stage: existing.stage },
      data: {
        stage: data.toStage,
        modifiedById: ctx.userId,
        version: { increment: 1 },
        // Reopening clears the conversion stamp (history keeps the original conversion).
        ...(reopening ? { convertedAt: null, convertedById: null } : {}),
      },
    });
    if (res.count === 0) throw new ConflictError();
    await tx.leadStageHistory.create({
      data: { leadId: existing.id, fromStage: existing.stage, toStage: data.toStage, note: nn(data.note), changedById: ctx.userId },
    });
    await audit(tx, ctx, {
      entityType: "Lead",
      entityId: existing.id,
      action: reopening ? "reopened" : "stage_changed",
      summary: `${existing.number}: ${LEAD_STAGE_META[existing.stage].label} → ${LEAD_STAGE_META[data.toStage].label}`,
      changes: { stage: { from: existing.stage, to: data.toStage } },
    });
    await notify(tx, ctx, {
      userId: existing.ownerId,
      type: "lead_stage",
      title: `${existing.name} moved to ${LEAD_STAGE_META[data.toStage].label}`,
      link: `/leads/${existing.id}`,
    });
    return { id: existing.id };
  });
}

export async function addDiscussion(ctx: Ctx, input: unknown) {
  ctx.require("lead.edit");
  const data = parseInput(discussionSchema, input);
  const lead = await prisma.lead.findFirst({ where: leadWhere(ctx, { id: data.leadId }) });
  if (!lead) throw new NotFoundError("Lead");
  // Discussion updates are captured while the deal is being worked. Updates logged from a
  // meeting are allowed at any open stage; standalone updates require "In Discussion".
  if (lead.stage === "CONVERTED") throw new BusinessRuleError("Discussion updates cannot be added to a converted lead.");
  if (!data.meetingId && lead.stage !== "IN_DISCUSSION") {
    throw new BusinessRuleError("Move the lead to “In Discussion” before adding discussion updates.");
  }
  await assertOrgUser(prisma, ctx, data.responsibleUserId, "responsibleUserId");
  if (data.meetingId) {
    const meeting = await prisma.meeting.findFirst({ where: { id: data.meetingId, organizationId: ctx.orgId, leadId: lead.id, deletedAt: null } });
    if (!meeting) throw new ValidationError({ meetingId: "The meeting is not linked to this lead" });
  }
  const followUp = parseDateOnly(data.nextFollowUpAt);

  return prisma.$transaction(async (tx) => {
    const d = await tx.leadDiscussion.create({
      data: {
        leadId: lead.id,
        meetingId: nn(data.meetingId),
        discussedAt: parseDateOnly(data.discussedAt)!,
        summary: data.summary,
        requirements: nn(data.requirements),
        objections: nn(data.objections),
        nextSteps: nn(data.nextSteps),
        nextFollowUpAt: followUp,
        responsibleUserId: data.responsibleUserId,
        createdById: ctx.userId,
      },
    });
    // The newest follow-up commitment becomes the lead's next follow-up date.
    await tx.lead.update({
      where: { id: lead.id },
      data: { modifiedById: ctx.userId, version: { increment: 1 }, ...(followUp ? { nextFollowUpAt: followUp } : {}) },
    });
    await audit(tx, ctx, { entityType: "Lead", entityId: lead.id, action: "discussion_added", summary: `Discussion update on ${lead.number}: ${data.summary.slice(0, 80)}` });
    await notify(tx, ctx, { userId: data.responsibleUserId, type: "lead_discussion", title: `Follow-up assigned on ${lead.name}`, body: data.nextSteps ?? undefined, link: `/leads/${lead.id}` });
    return d;
  });
}

/**
 * Converts a lead: links (or creates) the account, associates buyer contacts and stamps
 * the conversion — all in one transaction. A conditional update on (version, stage)
 * guarantees a lead can only be converted once even under concurrent requests.
 */
export async function convertLead(ctx: Ctx, input: unknown) {
  ctx.require("lead.convert");
  const data = parseInput(leadConvertSchema, input);
  const lead = await loadForWrite(ctx, data.id, data.version);
  const check = checkLeadConversion(lead.stage, ctx.settings.leadWorkflow);
  if (!check.ok) throw new BusinessRuleError(check.reason);

  return prisma.$transaction(async (tx) => {
    // 1. Account
    let accountId: string;
    let createdAccount = false;
    if (data.accountMode === "existing") {
      const account = await tx.account.findFirst({ where: accountWhere(ctx, { id: data.accountId! }), select: { id: true } });
      if (!account) throw new ValidationError({ accountId: "Select an account you have access to" });
      accountId = account.id;
    } else {
      const merged = accountFields.safeParse({
        name: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        ownerId: lead.ownerId,
        status: "ACTIVE",
        ...Object.fromEntries(Object.entries(data.newAccount ?? {}).filter(([, v]) => v !== undefined && v !== "")),
      });
      if (!merged.success) {
        const fe: Record<string, string> = {};
        for (const i of merged.error.issues) fe[`newAccount.${i.path.join(".")}`] ??= i.message;
        throw new ValidationError(fe);
      }
      const account = await createAccountTx(tx, ctx, merged.data, data.acknowledgeDuplicates);
      accountId = account.id;
      createdAccount = true;
    }

    // 2. Stamp conversion (guards against duplicate conversion).
    const now = new Date();
    const res = await tx.lead.updateMany({
      where: { id: lead.id, version: data.version, stage: { not: "CONVERTED" }, convertedAt: null },
      data: { stage: "CONVERTED", accountId, convertedAt: now, convertedById: ctx.userId, modifiedById: ctx.userId, version: { increment: 1 } },
    });
    if (res.count === 0) throw new ConflictError("This lead was already converted or changed by someone else. Reload the page.");

    // 3. Buyer contacts: selected contacts plus (optionally) one created from the lead.
    const contactIds = new Set<string>();
    if (data.contactIds.length) {
      const found = await tx.contact.findMany({
        where: { id: { in: data.contactIds }, organizationId: ctx.orgId, deletedAt: null },
        select: { id: true, accountId: true },
      });
      if (found.length !== new Set(data.contactIds).size) throw new ValidationError({ contactIds: "One or more contacts are invalid" });
      for (const c of found) {
        if (c.accountId && c.accountId !== accountId) throw new ValidationError({ contactIds: "Selected contacts must belong to the converted account" });
        contactIds.add(c.id);
      }
      await tx.contact.updateMany({ where: { id: { in: [...contactIds] }, accountId: null }, data: { accountId, modifiedById: ctx.userId } });
    }
    if (data.createContactFromLead) {
      const existing = await tx.contact.findFirst({ where: { organizationId: ctx.orgId, email: lead.email, deletedAt: null } });
      if (existing) {
        if (!existing.accountId) await tx.contact.update({ where: { id: existing.id }, data: { accountId, modifiedById: ctx.userId } });
        if (!existing.accountId || existing.accountId === accountId) contactIds.add(existing.id);
      } else {
        const [firstName, ...rest] = lead.name.trim().split(/\s+/);
        const contact = await tx.contact.create({
          data: {
            organizationId: ctx.orgId,
            number: await nextNumber(tx, ctx.orgId, "contact", "CON"),
            firstName: firstName || lead.name,
            lastName: rest.join(" ") || "—",
            email: lead.email,
            phone: lead.phone,
            accountId,
            ownerId: lead.ownerId,
            source: `Converted from ${lead.number}`,
            createdById: ctx.userId,
            modifiedById: ctx.userId,
          },
        });
        contactIds.add(contact.id);
        await audit(tx, ctx, { entityType: "Contact", entityId: contact.id, action: "created", summary: `Created contact ${contact.number} from lead ${lead.number}` });
      }
    }
    if (contactIds.size) {
      await tx.leadContact.createMany({
        data: [...contactIds].map((contactId, i) => ({ leadId: lead.id, contactId, isPrimary: i === 0 })),
        skipDuplicates: true,
      });
    }

    await tx.leadStageHistory.create({
      data: { leadId: lead.id, fromStage: lead.stage, toStage: "CONVERTED", note: nn(data.note) ?? "Lead converted", changedById: ctx.userId },
    });
    await audit(tx, ctx, {
      entityType: "Lead",
      entityId: lead.id,
      action: "converted",
      summary: `Converted lead ${lead.number} ${createdAccount ? "into a new account" : "to an existing account"}`,
      changes: { stage: { from: lead.stage, to: "CONVERTED" }, accountId: { from: lead.accountId, to: accountId }, contacts: [...contactIds] },
    });
    await notify(tx, ctx, { userId: lead.ownerId, type: "lead_converted", title: `Lead converted: ${lead.name}`, link: `/leads/${lead.id}` });
    return { id: lead.id, accountId };
  });
}

export async function archiveLead(ctx: Ctx, id: string) {
  ctx.require("lead.delete");
  const lead = await prisma.lead.findFirst({ where: leadWhere(ctx, { id }) });
  if (!lead) throw new NotFoundError("Lead");
  await prisma.$transaction(async (tx) => {
    await tx.lead.update({ where: { id }, data: { deletedAt: new Date(), modifiedById: ctx.userId, version: { increment: 1 } } });
    await audit(tx, ctx, { entityType: "Lead", entityId: id, action: "archived", summary: `Archived lead ${lead.number} ${lead.name}` });
  });
}

export async function leadOptions(ctx: Ctx, opts: { accountId?: string } = {}) {
  return prisma.lead.findMany({
    where: leadWhere(ctx, opts.accountId ? { accountId: opts.accountId } : {}),
    select: { id: true, number: true, name: true, companyName: true, accountId: true, stage: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export async function leadSourceOptions(ctx: Ctx, includeInactive = false) {
  return prisma.leadSource.findMany({
    where: { organizationId: ctx.orgId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}
