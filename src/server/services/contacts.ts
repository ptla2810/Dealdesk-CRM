import type { ContactStatus, Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "../db";
import { scopeOwner, type Ctx } from "../context";
import { NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit, diff } from "../audit";
import { nextNumber } from "../numbers";
import { asEnum, asUuid, contains, paged, parseListParams, type SearchParams } from "../list";
import { assertOrgUser } from "./users";
import { accountWhere } from "./accounts";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { contactCreateSchema, contactUpdateSchema } from "@/lib/validation/contact";
import { CONTACT_STATUSES, SUBSCRIPTION_STATUSES } from "@/lib/constants";

export const CONTACT_SORTS = ["number", "firstName", "lastName", "email", "designation", "status", "createdAt", "updatedAt"] as const;

export function contactWhere(ctx: Ctx, extra: Prisma.ContactWhereInput = {}): Prisma.ContactWhereInput {
  return { organizationId: ctx.orgId, deletedAt: null, ...scopeOwner(ctx), ...extra };
}

/**
 * Campaign eligibility is derived, never stored: a contact can receive marketing email only
 * with recorded consent, an active subscription, an email address and an active status.
 */
export function campaignEligibility(c: { marketingConsent: boolean; subscriptionStatus: SubscriptionStatus; email: string | null; status: ContactStatus }) {
  if (!c.email) return { eligible: false, reason: "No email address" };
  if (c.status !== "ACTIVE") return { eligible: false, reason: "Contact is not active" };
  if (!c.marketingConsent) return { eligible: false, reason: "No marketing consent" };
  if (c.subscriptionStatus === "UNSUBSCRIBED") return { eligible: false, reason: "Unsubscribed" };
  if (c.subscriptionStatus !== "SUBSCRIBED") return { eligible: false, reason: "Not subscribed" };
  return { eligible: true, reason: "Eligible" };
}

export function contactFilters(ctx: Ctx, sp: SearchParams) {
  const p = parseListParams(sp, CONTACT_SORTS, "createdAt");
  const eligible = p.get("eligible");
  const where = contactWhere(ctx, {
    ...(p.q
      ? {
          OR: [
            { firstName: contains(p.q) },
            { lastName: contains(p.q) },
            { email: contains(p.q) },
            { number: contains(p.q) },
            { designation: contains(p.q) },
            { account: { name: contains(p.q) } },
          ],
        }
      : {}),
    ...(asEnum(p.get("status"), CONTACT_STATUSES) ? { status: p.get("status") as ContactStatus } : {}),
    ...(asEnum(p.get("subscription"), SUBSCRIPTION_STATUSES) ? { subscriptionStatus: p.get("subscription") as SubscriptionStatus } : {}),
    ...(asUuid(p.get("account")) ? { accountId: p.get("account") } : {}),
    ...(asUuid(p.get("owner")) ? { ownerId: p.get("owner") } : {}),
    ...(eligible === "1"
      ? { marketingConsent: true, subscriptionStatus: "SUBSCRIBED" as const, status: "ACTIVE" as const, email: { not: null } }
      : {}),
  });
  return { p, where };
}

const include = {
  account: { select: { id: true, name: true, number: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.ContactInclude;

export async function listContacts(ctx: Ctx, sp: SearchParams) {
  ctx.require("contact.view");
  const { p, where } = contactFilters(ctx, sp);
  const [rows, total] = await Promise.all([
    prisma.contact.findMany({ where, include, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.pageSize }),
    prisma.contact.count({ where }),
  ]);
  return paged(rows, total, p);
}

export async function exportContacts(ctx: Ctx, sp: SearchParams) {
  ctx.require("contact.export");
  const { p, where } = contactFilters(ctx, sp);
  return prisma.contact.findMany({ where, include, orderBy: { [p.sort]: p.dir }, take: 10000 });
}

export async function getContact(ctx: Ctx, id: string) {
  ctx.require("contact.view");
  const contact = await prisma.contact.findFirst({
    where: contactWhere(ctx, { id }),
    include: {
      ...include,
      createdBy: { select: { name: true } },
      modifiedBy: { select: { name: true } },
      leadLinks: { include: { lead: { select: { id: true, number: true, name: true, stage: true, deletedAt: true } } } },
      meetingLinks: { include: { meeting: { select: { id: true, number: true, title: true, scheduledAt: true, status: true, deletedAt: true } } } },
      tickets: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!contact) throw new NotFoundError("Contact");
  return contact;
}

async function columns(ctx: Ctx, data: ReturnType<typeof contactCreateSchema.parse>, previous?: { marketingConsent: boolean; consentAt: Date | null; subscriptionStatus: SubscriptionStatus; unsubscribedAt: Date | null }) {
  const accountId = nn(data.accountId);
  if (accountId) {
    const account = await prisma.account.findFirst({ where: accountWhere(ctx, { id: accountId }), select: { id: true, country: true } });
    if (!account) throw new ValidationError({ accountId: "Select an account you have access to" });
  }
  const phone = data.phone ? normalizePhone(data.phone) : null;
  if (data.phone && !phone) throw new ValidationError({ phone: "Enter a valid phone number including country code" });
  const now = new Date();
  // Consent timestamp is set when consent is first given and cleared when withdrawn.
  const consentAt = data.marketingConsent ? (previous?.marketingConsent ? previous.consentAt : now) : null;
  // Withdrawing consent always unsubscribes.
  const subscriptionStatus: SubscriptionStatus = !data.marketingConsent && data.subscriptionStatus === "SUBSCRIBED" ? "UNSUBSCRIBED" : data.subscriptionStatus;
  const unsubscribedAt =
    subscriptionStatus === "UNSUBSCRIBED" ? (previous?.subscriptionStatus === "UNSUBSCRIBED" ? previous.unsubscribedAt : now) : null;
  return {
    firstName: data.firstName,
    lastName: data.lastName,
    email: normalizeEmail(data.email),
    phone,
    designation: nn(data.designation),
    department: nn(data.department),
    accountId,
    preferredChannel: data.preferredChannel,
    status: data.status,
    source: nn(data.source),
    notes: nn(data.notes),
    marketingConsent: data.marketingConsent,
    consentAt,
    consentSource: data.marketingConsent ? nn(data.consentSource) : null,
    subscriptionStatus,
    unsubscribedAt,
  };
}

export async function createContact(ctx: Ctx, input: unknown) {
  ctx.require("contact.create");
  const data = parseInput(contactCreateSchema, input);
  const ownerId = ctx.dataScope === "OWN" ? ctx.userId : data.ownerId || ctx.userId;
  await assertOrgUser(prisma, ctx, ownerId);
  const cols = await columns(ctx, data);
  const dup = await prisma.contact.findFirst({ where: { organizationId: ctx.orgId, deletedAt: null, email: cols.email }, select: { number: true } });
  if (dup) throw new ValidationError({ email: `A contact with this email already exists (${dup.number})` });
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: { ...cols, organizationId: ctx.orgId, number: await nextNumber(tx, ctx.orgId, "contact", "CON"), ownerId, createdById: ctx.userId, modifiedById: ctx.userId },
    });
    await audit(tx, ctx, { entityType: "Contact", entityId: contact.id, action: "created", summary: `Created contact ${contact.number} ${contact.firstName} ${contact.lastName}` });
    return contact;
  });
}

export async function updateContact(ctx: Ctx, input: unknown) {
  ctx.require("contact.edit");
  const data = parseInput(contactUpdateSchema, input);
  const existing = await prisma.contact.findFirst({ where: contactWhere(ctx, { id: data.id }) });
  if (!existing) throw new NotFoundError("Contact");
  const ownerId = ctx.dataScope === "OWN" ? existing.ownerId : data.ownerId;
  await assertOrgUser(prisma, ctx, ownerId);
  const cols = await columns(ctx, data, existing);
  if (cols.email !== existing.email) {
    const dup = await prisma.contact.findFirst({ where: { organizationId: ctx.orgId, deletedAt: null, email: cols.email, id: { not: existing.id } }, select: { number: true } });
    if (dup) throw new ValidationError({ email: `A contact with this email already exists (${dup.number})` });
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.contact.update({ where: { id: existing.id }, data: { ...cols, ownerId, modifiedById: ctx.userId } });
    const changes = diff(existing, updated, ["firstName", "lastName", "email", "phone", "designation", "department", "accountId", "ownerId", "status", "marketingConsent", "subscriptionStatus"]);
    await audit(tx, ctx, {
      entityType: "Contact",
      entityId: existing.id,
      action: changes.marketingConsent || changes.subscriptionStatus ? "consent_updated" : "updated",
      summary: `Updated contact ${existing.number}`,
      changes,
    });
    return updated;
  });
}

export async function archiveContact(ctx: Ctx, id: string) {
  ctx.require("contact.delete");
  const existing = await prisma.contact.findFirst({ where: contactWhere(ctx, { id }) });
  if (!existing) throw new NotFoundError("Contact");
  await prisma.$transaction(async (tx) => {
    await tx.contact.update({ where: { id }, data: { deletedAt: new Date(), modifiedById: ctx.userId } });
    await audit(tx, ctx, { entityType: "Contact", entityId: id, action: "archived", summary: `Archived contact ${existing.number}` });
  });
}

export async function contactOptions(ctx: Ctx, opts: { accountId?: string } = {}) {
  return prisma.contact.findMany({
    where: { organizationId: ctx.orgId, deletedAt: null, ...(opts.accountId ? { accountId: opts.accountId } : {}) },
    select: { id: true, number: true, firstName: true, lastName: true, email: true, accountId: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 1000,
  });
}
