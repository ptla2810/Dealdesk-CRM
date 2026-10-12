import bcrypt from "bcryptjs";
import { prisma, type Tx } from "../db";
import type { Ctx } from "../context";
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit } from "../audit";
import { normalizeEmail } from "@/lib/normalize";
import { userCreateSchema, userUpdateSchema, profileSchema, changePasswordSchema } from "@/lib/validation/settings";

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

export async function listUsers(ctx: Ctx) {
  ctx.require("settings.manage_users");
  return prisma.user.findMany({
    where: { organizationId: ctx.orgId },
    include: { role: { select: { id: true, name: true, key: true } } },
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
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { organizationId: ctx.orgId, roleId: role.id, name: data.name, email, username, jobTitle: nn(data.jobTitle), passwordHash },
    });
    await audit(tx, ctx, { entityType: "User", entityId: user.id, action: "created", summary: `Created user ${user.name} (${role.name})` });
    return { id: user.id };
  });
}

export async function updateUser(ctx: Ctx, input: unknown) {
  ctx.require("settings.manage_users");
  const data = parseInput(userUpdateSchema, input);
  const user = await prisma.user.findFirst({ where: { id: data.id, organizationId: ctx.orgId }, include: { role: true } });
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
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        name: data.name,
        roleId: role.id,
        jobTitle: nn(data.jobTitle),
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
      },
    });
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
