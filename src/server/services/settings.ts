import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { Ctx } from "../context";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit } from "../audit";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { orgSettingsSchema } from "@/lib/settings";
import { ORDER_STATUSES } from "@/lib/constants";
import {
  categorySchema,
  leadSourceSchema,
  organizationSchema,
  roleCreateSchema,
  rolePermissionsSchema,
  taxRateSchema,
  workflowSchema,
} from "@/lib/validation/settings";
import { asUuid, contains, paged, parseListParams, type SearchParams } from "../list";

// ─── Roles & permissions ──────────────────────────────────────────────────

export async function listRoles(ctx: Ctx) {
  ctx.require("settings.manage_roles");
  return prisma.role.findMany({
    where: { organizationId: ctx.orgId },
    include: { permissions: true, _count: { select: { users: true } } },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
}

export async function createRole(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_roles");
  const data = parseInput(roleCreateSchema, input);
  const key = data.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "ROLE";
  const clash = await prisma.role.findFirst({ where: { organizationId: ctx.orgId, OR: [{ key }, { name: { equals: data.name, mode: "insensitive" } }] } });
  if (clash) throw new ConflictError("A role with this name already exists.", { name: "Name already in use" });
  return prisma.$transaction(async (tx) => {
    const role = await tx.role.create({ data: { organizationId: ctx.orgId, key, name: data.name, description: nn(data.description), dataScope: data.dataScope } });
    await audit(tx, ctx, { entityType: "Role", entityId: role.id, action: "created", summary: `Created role ${role.name}` });
    return role;
  });
}

export async function updateRolePermissions(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_roles");
  const data = parseInput(rolePermissionsSchema, input);
  const role = await prisma.role.findFirst({ where: { id: data.roleId, organizationId: ctx.orgId }, include: { permissions: true } });
  if (!role) throw new NotFoundError("Role");
  if (role.key === "ADMIN") throw new BusinessRuleError("The Administrator role always has every permission.");
  // Prevents privilege escalation by editing the permissions of one's own role.
  if (role.key === ctx.user.roleKey && ctx.user.roleKey !== "ADMIN") throw new ForbiddenError("You cannot change the permissions of your own role.");
  const valid = new Set<string>(ALL_PERMISSIONS);
  const wanted = [...new Set(data.permissions)].filter((p) => valid.has(p));
  const before = role.permissions.map((p) => p.permissionKey).sort();
  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (wanted.length) await tx.rolePermission.createMany({ data: wanted.map((permissionKey) => ({ roleId: role.id, permissionKey })) });
    await tx.role.update({ where: { id: role.id }, data: { dataScope: data.dataScope } });
    const added = wanted.filter((p) => !before.includes(p));
    const removed = before.filter((p) => !wanted.includes(p));
    await audit(tx, ctx, {
      entityType: "Role",
      entityId: role.id,
      action: "permissions_updated",
      summary: `Updated permissions for ${role.name} (+${added.length} / −${removed.length})`,
      changes: { added, removed, ...(role.dataScope !== data.dataScope ? { dataScope: { from: role.dataScope, to: data.dataScope } } : {}) },
    });
  });
}

// ─── Lead sources, categories, tax rates ────────────────────────────────────

export async function addLeadSource(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_config");
  const data = parseInput(leadSourceSchema, input);
  const exists = await prisma.leadSource.findFirst({ where: { organizationId: ctx.orgId, name: { equals: data.name, mode: "insensitive" } } });
  if (exists) throw new ValidationError({ name: "This lead source already exists" });
  const max = await prisma.leadSource.aggregate({ where: { organizationId: ctx.orgId }, _max: { sortOrder: true } });
  const source = await prisma.leadSource.create({ data: { organizationId: ctx.orgId, name: data.name, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  await audit(prisma, ctx, { entityType: "LeadSource", entityId: source.id, action: "created", summary: `Added lead source ${source.name}` });
  return source;
}

export async function toggleLeadSource(ctx: Ctx, id: string, isActive: boolean) {
  ctx.require("settings.manage_config");
  const source = await prisma.leadSource.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!source) throw new NotFoundError("Lead source");
  await prisma.leadSource.update({ where: { id }, data: { isActive } });
  await audit(prisma, ctx, { entityType: "LeadSource", entityId: id, action: isActive ? "activated" : "deactivated", summary: `${isActive ? "Activated" : "Deactivated"} lead source ${source.name}` });
}

export async function addCategory(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_config");
  const data = parseInput(categorySchema, input);
  const exists = await prisma.productCategory.findFirst({ where: { organizationId: ctx.orgId, name: { equals: data.name, mode: "insensitive" } } });
  if (exists) throw new ValidationError({ name: "This category already exists" });
  const c = await prisma.productCategory.create({ data: { organizationId: ctx.orgId, name: data.name, description: nn(data.description) } });
  await audit(prisma, ctx, { entityType: "ProductCategory", entityId: c.id, action: "created", summary: `Added product category ${c.name}` });
  return c;
}

export async function addTaxRate(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_config");
  const data = parseInput(taxRateSchema, input);
  const exists = await prisma.taxRate.findFirst({ where: { organizationId: ctx.orgId, name: { equals: data.name, mode: "insensitive" } } });
  if (exists) throw new ValidationError({ name: "A tax classification with this name already exists" });
  const t = await prisma.taxRate.create({ data: { organizationId: ctx.orgId, name: data.name, ratePercent: data.ratePercent } });
  await audit(prisma, ctx, { entityType: "TaxRate", entityId: t.id, action: "created", summary: `Added tax rate ${t.name} (${data.ratePercent}%)` });
  return t;
}

export async function toggleTaxRate(ctx: Ctx, id: string, isActive: boolean) {
  ctx.require("settings.manage_config");
  const t = await prisma.taxRate.findFirst({ where: { id, organizationId: ctx.orgId } });
  if (!t) throw new NotFoundError("Tax rate");
  await prisma.taxRate.update({ where: { id }, data: { isActive } });
  await audit(prisma, ctx, { entityType: "TaxRate", entityId: id, action: isActive ? "activated" : "deactivated", summary: `${isActive ? "Activated" : "Deactivated"} tax rate ${t.name}` });
}

// ─── Organization & workflow ───────────────────────────────────────────────

export async function updateOrganization(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_config");
  const data = parseInput(organizationSchema, input);
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: ctx.orgId }, data: { name: data.name, baseCurrency: data.baseCurrency, timezone: data.timezone } });
    await audit(tx, ctx, {
      entityType: "Organization",
      entityId: ctx.orgId,
      action: "updated",
      summary: "Updated organization profile",
      changes: {
        ...(ctx.org.baseCurrency !== data.baseCurrency ? { baseCurrency: { from: ctx.org.baseCurrency, to: data.baseCurrency } } : {}),
        ...(ctx.org.timezone !== data.timezone ? { timezone: { from: ctx.org.timezone, to: data.timezone } } : {}),
      },
    });
  });
}

export async function updateWorkflow(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_config");
  const data = parseInput(workflowSchema, input);
  const transitions: Record<string, string[]> = {};
  for (const from of ORDER_STATUSES) {
    transitions[from] = (data.orderTransitions[from] ?? []).filter((to) => (ORDER_STATUSES as string[]).includes(to) && to !== from && to !== "DRAFT");
  }
  if (transitions.DELIVERED.length || transitions.CANCELLED.length) {
    // Delivered and cancelled are terminal so delivered orders cannot silently revert.
    throw new ValidationError({ orderTransitions: "Delivered and Cancelled must remain final statuses" });
  }
  const settings = orgSettingsSchema.parse({
    leadWorkflow: { allowSkipStages: data.allowSkipStages, allowBackward: data.allowBackward, allowReopenConverted: data.allowReopenConverted },
    orderWorkflow: { transitions },
    pricing: { discountsEnabled: data.discountsEnabled, maxDiscountPercent: data.maxDiscountPercent, taxEnabled: data.taxEnabled },
    tickets: { requireResolutionNote: data.requireResolutionNote },
  });
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: ctx.orgId }, data: { settings: settings as unknown as Prisma.InputJsonValue } });
    await audit(tx, ctx, { entityType: "Organization", entityId: ctx.orgId, action: "workflow_updated", summary: "Updated workflow & pricing settings", changes: { before: ctx.settings, after: settings } });
  });
}

// ─── Audit log ───────────────────────────────────────────────────────────

export async function listAuditLogs(ctx: Ctx, sp: SearchParams) {
  ctx.require("audit.view");
  const p = parseListParams(sp, ["createdAt"], "createdAt");
  const where: Prisma.AuditLogWhereInput = {
    organizationId: ctx.orgId,
    ...(p.q ? { OR: [{ summary: contains(p.q) }, { action: contains(p.q) }] } : {}),
    ...(p.get("entity") ? { entityType: p.get("entity") } : {}),
    ...(asUuid(p.get("actor")) ? { actorId: p.get("actor") } : {}),
    ...(asUuid(p.get("entityId")) ? { entityId: p.get("entityId") } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, include: { actor: { select: { name: true } } }, orderBy: { createdAt: p.dir }, skip: p.skip, take: p.pageSize }),
    prisma.auditLog.count({ where }),
  ]);
  return paged(rows, total, p);
}

/** Activity timeline for one record. */
export async function entityActivity(ctx: Ctx, entityType: string, entityId: string, take = 50) {
  return prisma.auditLog.findMany({
    where: { organizationId: ctx.orgId, entityType, entityId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}
