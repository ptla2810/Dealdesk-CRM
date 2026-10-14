import bcrypt from "bcryptjs";
import { prisma, type Tx } from "../db";
import { reportingTree, type Ctx } from "../context";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit } from "../audit";
import { normalizeEmail } from "@/lib/normalize";
import { adminSetPasswordSchema, userCreateSchema, userUpdateSchema, profileSchema, changePasswordSchema } from "@/lib/validation/settings";

export const BCRYPT_COST = 12;
export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_COST);

/** Prevents privilege escalation: only administrators may grant the Administrator role. */
function assertCanGrantRole(ctx: Ctx, roleKey: string) {
  if (roleKey === "ADMIN" && ctx.user.roleKey !== "ADMIN") throw new ForbiddenError("Only administrators can assign the Administrator role.");
}

/** Active users of the caller's organization, for owner/assignee pickers. */
export async function listAssignableUsers(ctx: Ctx, opts: { roleKeys?: string[] } = {}) {
  return prisma.user.findMany({
    where: { organizationId: ctx.orgId, isActive: true, ...(opts.roleKeys ? { role: { key: { in: opts.roleKeys } } } : {}) },
    select: { id: true, name: true, email: true, role: { select: { key: true, name: true } } },
    orderBy: { name: "asc" },
  });
}

/**
 * Verifies that a client-supplied user id is an active member of the caller's organization.
 * Never trust user ids from the client without this check.
 */
export async function assertOrgUser(db: Tx | typeof prisma, ctx: Ctx, userId: string, field = "ownerId") {
  const user = await db.user.findFirst({ where: { id: userId, organizationId: ctx.orgId, isActive: true }, select: { id: true, name: true } });
  if (!user) throw new ValidationError({ [field]: "Select an active user from your organization" });
  return user;
}

/** Resolves who may own a record: users without the assign permission always own what they create. */
export function resolveOwner(ctx: Ctx, requested: string | undefined, assignPermission: Parameters<Ctx["can"]>[0]) {
  if (!requested || !ctx.can(assignPermission)) return ctx.userId;
  return requested;
}

/**
 * Validates a reporting manager: an active user of the same organization, not the user themself
 * and not one of their own (direct or indirect) reports, which would create a cycle.
 * An unchanged manager is accepted even if that manager has since been deactivated.
 */
async function resolveManager(ctx: Ctx, managerId: string | null, user?: { id: string; managerId: string | null }) {
  if (!managerId) return null;
  if (user && managerId === user.managerId) return managerId;
  const manager = await prisma.user.findFirst({ where: { id: managerId, organizationId: ctx.orgId, isActive: true }, select: { id: true, name: true } });
  if (!manager) throw new ValidationError({ managerId: "Select an active user from your organization" });
  if (user) {
    if (managerId === user.id) throw new ValidationError({ managerId: "A user cannot report to themselves" });
    const reports = await reportingTree(user.id, ctx.orgId);
    if (reports.includes(managerId)) throw new ValidationError({ managerId: `${manager.name} reports to this user, so they cannot be their manager` });
  }
  return managerId;
}

export async function listUsers(ctx: Ctx) {
  ctx.require("settings.manage_users");
  return prisma.user.findMany({
    where: { organizationId: ctx.orgId },
    include: { role: { select: { id: true, name: true, key: true } }, manager: { select: { id: true, name: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

/** Everyone who reports to the caller, directly or indirectly, for the "My team" view. */
export async function listMyTeam(ctx: Ctx) {
  const ids = ctx.teamUserIds.filter((id) => id !== ctx.userId);
  if (!ids.length) return [];
  return prisma.user.findMany({
    where: { id: { in: ids }, organizationId: ctx.orgId },
    select: { id: true, name: true, email: true, phone: true, jobTitle: true, isActive: true, role: { select: { name: true } }, manager: { select: { id: true, name: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
}

export async function createUser(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_users");
  const data = parseInput(userCreateSchema, input);
  const email = normalizeEmail(data.email);
  const username = data.username ? data.username.toLowerCase() : null;
  const role = await prisma.role.findFirst({ where: { id: data.roleId, organizationId: ctx.orgId } });
  if (!role) throw new ValidationError({ roleId: "Select a valid role" });
  assertCanGrantRole(ctx, role.key);
  const clash = await prisma.user.findFirst({ where: { OR: [{ email }, ...(username ? [{ username }] : [])] }, select: { email: true } });
  if (clash) {
    throw new ConflictError("A user with this email or username already exists.", clash.email === email ? { email: "Email already in use" } : { username: "Username already in use" });
  }
  const managerId = await resolveManager(ctx, nn(data.managerId));
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { organizationId: ctx.orgId, roleId: role.id, name: data.name, email, username, jobTitle: nn(data.jobTitle), managerId, passwordHash },
    });
    await audit(tx, ctx, { entityType: "User", entityId: user.id, action: "created", summary: `Created user ${user.name} (${role.name})` });
    return { id: user.id };
  });
}

export async function updateUser(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_users");
  const data = parseInput(userUpdateSchema, input);
  const user = await prisma.user.findFirst({ where: { id: data.id, organizationId: ctx.orgId }, include: { role: true, manager: { select: { name: true } } } });
  if (!user) throw new NotFoundError("User");
  const role = await prisma.role.findFirst({ where: { id: data.roleId, organizationId: ctx.orgId } });
  if (!role) throw new ValidationError({ roleId: "Select a valid role" });
  if (role.id !== user.roleId) assertCanGrantRole(ctx, role.key);
  if (user.role.key === "ADMIN" && ctx.user.roleKey !== "ADMIN") throw new ForbiddenError("Only administrators can edit administrators.");
  if (user.id === ctx.userId && (!data.isActive || role.key !== user.role.key)) {
    throw new BusinessRuleError("You cannot deactivate yourself or change your own role.");
  }
  if (user.role.key === "ADMIN" && (role.key !== "ADMIN" || !data.isActive)) {
    const admins = await prisma.user.count({ where: { organizationId: ctx.orgId, isActive: true, role: { key: "ADMIN" } } });
    if (admins <= 1) throw new BusinessRuleError("The organization must keep at least one active administrator.");
  }
  const managerId = await resolveManager(ctx, nn(data.managerId), user);
  const newManager = managerId && managerId !== user.managerId ? await prisma.user.findUnique({ where: { id: managerId }, select: { name: true } }) : null;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: data.name,
        roleId: role.id,
        jobTitle: nn(data.jobTitle),
        managerId,
        isActive: data.isActive,
        // Deactivation or a role change signs the user out everywhere.
        ...(user.isActive !== data.isActive || user.roleId !== role.id ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    await audit(tx, ctx, {
      entityType: "User",
      entityId: user.id,
      action: "updated",
      summary: `Updated user ${data.name}`,
      changes: {
        ...(user.roleId !== role.id ? { role: { from: user.role.name, to: role.name } } : {}),
        ...(user.isActive !== data.isActive ? { isActive: { from: user.isActive, to: data.isActive } } : {}),
        ...(user.managerId !== managerId ? { reportsTo: { from: user.manager?.name ?? null, to: newManager?.name ?? null } } : {}),
      },
    });
  });
}

/**
 * An administrator sets a new password for another user, e.g. when they are locked out.
 * Restricted to the Administrator role (not just the manage-users permission). Signs the user out
 * everywhere and voids any outstanding reset links. The password itself is never logged.
 */
export async function adminSetPassword(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_users");
  if (ctx.user.roleKey !== "ADMIN") throw new ForbiddenError("Only administrators can set passwords for other users.");
  const data = parseInput(adminSetPasswordSchema, input);
  const user = await prisma.user.findFirst({ where: { id: data.id, organizationId: ctx.orgId }, select: { id: true, name: true } });
  if (!user) throw new NotFoundError("User");
  if (user.id === ctx.userId) throw new BusinessRuleError("Change your own password under Settings → Profile.");
  const passwordHash = await hashPassword(data.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await audit(tx, ctx, { entityType: "User", entityId: user.id, action: "password_set", summary: `Set a new password for ${user.name}` });
  });
}

export async function updateProfile(ctx: Ctx, input: unknown) {
  const data = parseInput(profileSchema, input);
  await prisma.user.update({ where: { id: ctx.userId }, data: { name: data.name, jobTitle: nn(data.jobTitle), phone: nn(data.phone) } });
}

export async function changePassword(ctx: Ctx, input: unknown) {
  const data = parseInput(changePasswordSchema, input);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!user.passwordHash || !(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
    throw new ValidationError({ currentPassword: "Current password is incorrect" });
  }
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { passwordHash: await hashPassword(data.newPassword), sessionVersion: { increment: 1 } },
  });
}
