import type { AccountStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { scopeOwner, type Ctx } from "../context";
import { DuplicateWarning, NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit, diff } from "../audit";
import { nextNumber } from "../numbers";
import { notify } from "../notifications";
import { asEnum, asUuid, contains, dateRange, paged, parseListParams, type SearchParams } from "../list";
import { assertOrgUser, resolveOwner } from "./users";
import { normalizeCompanyName, normalizeEmail, normalizePhone, normalizeWebsite } from "@/lib/normalize";
import { accountCreateSchema, accountUpdateSchema, accountFields } from "@/lib/validation/account";
import { ACCOUNT_STATUSES } from "@/lib/constants";
import type { z } from "zod";

export const ACCOUNT_SORTS = ["number", "name", "email", "industry", "status", "createdAt"] as const;

export function accountWhere(ctx: Ctx, extra: Prisma.AccountWhereInput = {}): Prisma.AccountWhereInput {
  return { organizationId: ctx.orgId, deletedAt: null, ...scopeOwner(ctx), ...extra };
}

export async function listAccounts(ctx: Ctx, sp: SearchParams) {
  ctx.require("account.view");
  const p = parseListParams(sp, ACCOUNT_SORTS, "createdAt");
  const where = accountWhere(ctx, {
    ...(p.q
      ? {
          OR: [
            { name: contains(p.q) },
            { email: contains(p.q) },
            { number: contains(p.q) },
            { phone: { contains: p.q.replace(/[^\d+]/g, "") || p.q } },
            { city: contains(p.q) },
          ],
        }
      : {}),
    ...(asEnum(p.get("status"), ACCOUNT_STATUSES) ? { status: p.get("status") as AccountStatus } : {}),
    ...(asUuid(p.get("owner")) ? { ownerId: p.get("owner") } : {}),
    ...(p.get("industry") ? { industry: p.get("industry") } : {}),
    ...(dateRange(p.get("createdFrom"), p.get("createdTo")) ? { createdAt: dateRange(p.get("createdFrom"), p.get("createdTo")) } : {}),
  });
  const [rows, total] = await Promise.all([
    prisma.account.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true } },
        _count: {
          select: {
            leads: { where: { deletedAt: null } },
            contacts: { where: { deletedAt: null } },
            orders: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { [p.sort]: p.dir },
      skip: p.skip,
      take: p.pageSize,
    }),
    prisma.account.count({ where }),
  ]);
  return paged(rows, total, p);
}

export async function getAccount(ctx: Ctx, id: string) {
  ctx.require("account.view");
  const account = await prisma.account.findFirst({
    where: accountWhere(ctx, { id }),
    include: {
      owner: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      modifiedBy: { select: { name: true } },
      leads: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, include: { owner: { select: { name: true } } } },
      contacts: { where: { deletedAt: null }, orderBy: { firstName: "asc" }, take: 100 },
      meetings: { where: { deletedAt: null }, orderBy: { scheduledAt: "desc" }, take: 50, include: { assignedTo: { select: { name: true } } } },
      tickets: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, include: { assignedTo: { select: { name: true } } } },
      orders: { where: { deletedAt: null }, orderBy: { orderDate: "desc" }, take: 50 },
    },
  });
  if (!account) throw new NotFoundError("Account");
  return account;
}

type AccountData = z.output<typeof accountFields>;

/** Finds possible duplicates by normalized company name, email or phone (case-insensitive). */
export async function findAccountDuplicates(
  db: Tx | typeof prisma,
  ctx: Ctx,
  input: { name: string; email?: string | null; phone?: string | null; country?: string | null },
  excludeId?: string,
) {
  const nameKey = normalizeCompanyName(input.name);
  const email = input.email ? normalizeEmail(input.email) : null;
  const phone = input.phone ? normalizePhone(input.phone, input.country ?? undefined) : null;
  const or: Prisma.AccountWhereInput[] = [];
  if (nameKey) or.push({ nameNormalized: nameKey });
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  if (!or.length) return [];
  // Duplicate checks deliberately ignore the caller's data scope: a rep must be warned
  // about an account owned by someone else, but only sees its name and number.
  const rows = await db.account.findMany({
    where: { organizationId: ctx.orgId, deletedAt: null, OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, number: true, name: true, nameNormalized: true, email: true, phone: true },
    take: 10,
  });
  return rows.map((r) => {
    const reasons = [
      r.nameNormalized === nameKey ? "same company name" : null,
      email && r.email === email ? "same email" : null,
      phone && r.phone === phone ? "same phone" : null,
    ].filter(Boolean);
    return { id: r.id, label: `${r.number} · ${r.name}`, reason: reasons.join(", "), href: `/accounts/${r.id}` };
  });
}

function toColumns(data: AccountData) {
  const phone = normalizePhone(data.phone, data.country || undefined);
  if (!phone) throw new ValidationError({ phone: "Enter a valid phone number" });
  return {
    name: data.name,
    nameNormalized: normalizeCompanyName(data.name),
    email: normalizeEmail(data.email),
    phone,
    website: normalizeWebsite(data.website),
    industry: nn(data.industry),
    addressLine: nn(data.addressLine),
    country: data.country ? data.country.toUpperCase() : null,
    state: nn(data.state),
    city: nn(data.city),
    postalCode: nn(data.postalCode),
    description: nn(data.description),
    status: data.status,
  };
}

/** Creates an account inside an existing transaction (used directly and by lead conversion). */
export async function createAccountTx(tx: Tx, ctx: Ctx, data: AccountData, acknowledgeDuplicates?: boolean) {
  ctx.require("account.create");
  const ownerId = resolveOwner(ctx, data.ownerId, "account.assign");
  await assertOrgUser(tx, ctx, ownerId);
  const columns = toColumns(data);
  const duplicates = await findAccountDuplicates(tx, ctx, { name: data.name, email: columns.email, phone: columns.phone });
  const canOverride = ctx.can("account.override_duplicate");
  if (duplicates.length && !(acknowledgeDuplicates && canOverride)) throw new DuplicateWarning(duplicates, canOverride);

  const account = await tx.account.create({
    data: {
      ...columns,
      organizationId: ctx.orgId,
      number: await nextNumber(tx, ctx.orgId, "account", "ACC"),
      ownerId,
      createdById: ctx.userId,
      modifiedById: ctx.userId,
      duplicateOverride: duplicates.length > 0,
    },
  });
  await audit(tx, ctx, {
    entityType: "Account",
    entityId: account.id,
    action: "created",
    summary: `Created account ${account.number} ${account.name}${duplicates.length ? " (duplicate warning overridden)" : ""}`,
    changes: duplicates.length ? { duplicateOf: duplicates.map((d) => d.label) } : undefined,
  });
  await notify(tx, ctx, { userId: ownerId, type: "account_assigned", title: `Account assigned: ${account.name}`, link: `/accounts/${account.id}` });
  return account;
}

export async function createAccount(ctx: Ctx, input: unknown) {
  const data = parseInput(accountCreateSchema, input);
  return prisma.$transaction((tx) => createAccountTx(tx, ctx, data, data.acknowledgeDuplicates));
}

export async function updateAccount(ctx: Ctx, input: unknown) {
  ctx.require("account.edit");
  const data = parseInput(accountUpdateSchema, input);
  const existing = await prisma.account.findFirst({ where: accountWhere(ctx, { id: data.id }) });
  if (!existing) throw new NotFoundError("Account");
  const ownerId = ctx.can("account.assign") ? data.ownerId : existing.ownerId;
  await assertOrgUser(prisma, ctx, ownerId);
  const columns = toColumns(data);

  const identityChanged =
    columns.nameNormalized !== existing.nameNormalized || columns.email !== existing.email || columns.phone !== existing.phone;
  if (identityChanged) {
    const duplicates = await findAccountDuplicates(prisma, ctx, { name: data.name, email: columns.email, phone: columns.phone }, existing.id);
    const canOverride = ctx.can("account.override_duplicate");
    if (duplicates.length && !(data.acknowledgeDuplicates && canOverride)) throw new DuplicateWarning(duplicates, canOverride);
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.account.update({ where: { id: existing.id }, data: { ...columns, ownerId, modifiedById: ctx.userId } });
    const changes = diff(existing, updated, ["name", "email", "phone", "website", "industry", "country", "state", "city", "status", "ownerId"]);
    await audit(tx, ctx, { entityType: "Account", entityId: existing.id, action: "updated", summary: `Updated account ${existing.number}`, changes });
    if (ownerId !== existing.ownerId) {
      await notify(tx, ctx, { userId: ownerId, type: "account_assigned", title: `Account assigned: ${updated.name}`, link: `/accounts/${updated.id}` });
    }
    return updated;
  });
}

export async function archiveAccount(ctx: Ctx, id: string) {
  ctx.require("account.delete");
  const existing = await prisma.account.findFirst({ where: accountWhere(ctx, { id }) });
  if (!existing) throw new NotFoundError("Account");
  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id }, data: { deletedAt: new Date(), modifiedById: ctx.userId } });
    await audit(tx, ctx, { entityType: "Account", entityId: id, action: "archived", summary: `Archived account ${existing.number} ${existing.name}` });
  });
}

/** Lightweight options for account pickers. */
export async function accountOptions(ctx: Ctx, q = "") {
  return prisma.account.findMany({
    where: accountWhere(ctx, q ? { OR: [{ name: contains(q) }, { number: contains(q) }] } : {}),
    select: { id: true, number: true, name: true, addressLine: true, city: true, state: true, postalCode: true, country: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

/** Pre-check used by the form to show duplicate warnings before submit. */
export async function checkAccountDuplicates(ctx: Ctx, input: { name: string; email?: string; phone?: string; country?: string }, excludeId?: string) {
  ctx.require("account.view");
  if (!input.name?.trim()) return [];
  return findAccountDuplicates(prisma, ctx, input, excludeId);
}
