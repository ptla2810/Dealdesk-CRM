/**
 * Request context: the authenticated user, their organization (tenant), role,
 * effective permissions and data scope. Every service function receives a Ctx
 * and uses it for authorization and tenant scoping — never client-supplied IDs.
 */
import { cache } from "react";
import { redirect } from "next/navigation";
import type { DataScope } from "@prisma/client";
import { prisma } from "./db";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { PermissionKey } from "@/lib/permissions";
import { parseOrgSettings, type OrgSettings } from "@/lib/settings";

export type Ctx = {
  userId: string;
  orgId: string;
  user: { id: string; name: string; email: string; jobTitle: string | null; roleKey: string; roleName: string };
  org: { id: string; name: string; baseCurrency: string; timezone: string };
  permissions: ReadonlySet<string>;
  dataScope: DataScope;
  /** The user plus everyone who reports to them, directly or indirectly (reporting-manager chain). */
  teamUserIds: readonly string[];
  settings: OrgSettings;
  can(permission: PermissionKey): boolean;
  require(permission: PermissionKey): void;
};

export async function buildContext(userId: string, sessionVersion?: number): Promise<Ctx | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true, role: { include: { permissions: true } } },
  });
  if (!user || !user.isActive) return null;
  if (sessionVersion !== undefined && sessionVersion !== user.sessionVersion) return null;

  const permissions = new Set(user.role.permissions.map((p) => p.permissionKey));
  const teamUserIds = await reportingTree(user.id, user.organizationId);
  const ctx: Ctx = {
    userId: user.id,
    orgId: user.organizationId,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      jobTitle: user.jobTitle,
      roleKey: user.role.key,
      roleName: user.role.name,
    },
    org: {
      id: user.organization.id,
      name: user.organization.name,
      baseCurrency: user.organization.baseCurrency,
      timezone: user.organization.timezone,
    },
    permissions,
    dataScope: user.role.dataScope,
    teamUserIds,
    settings: parseOrgSettings(user.organization.settings),
    can: (p) => permissions.has(p),
    require: (p) => {
      if (!permissions.has(p)) throw new ForbiddenError();
    },
  };
  return ctx;
}

/**
 * The user and all their direct and indirect reports in the same organization. UNION (not UNION ALL)
 * stops the recursion even if bad data ever formed a cycle.
 */
export async function reportingTree(userId: string, orgId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE team AS (
      SELECT u.id FROM "User" u WHERE u.id = ${userId}::uuid
      UNION
      SELECT u.id FROM "User" u JOIN team t ON u."managerId" = t.id WHERE u."organizationId" = ${orgId}::uuid
    )
    SELECT id::text AS id FROM team`;
  return [userId, ...rows.map((r) => r.id).filter((id) => id !== userId)];
}

/** Context for server actions and route handlers. Throws if not signed in. */
export const getContext = cache(async (): Promise<Ctx> => {
  const { auth } = await import("./auth");
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) throw new UnauthenticatedError();
  const ctx = await buildContext(uid, session.sessionVersion);
  if (!ctx) throw new UnauthenticatedError();
  return ctx;
});

/** Context for pages: redirects to /login when signed out, /forbidden when lacking `permission`. */
export async function pageContext(permission?: PermissionKey): Promise<Ctx> {
  let ctx: Ctx;
  try {
    ctx = await getContext();
  } catch {
    redirect("/login");
  }
  if (permission && !ctx.can(permission)) redirect(`/forbidden?need=${permission}`);
  return ctx;
}

// ─── Data scope helpers ────────────────────────────────────────────────────
// Roles with OWN scope see records they own / are assigned to, plus those of everyone
// who reports to them (teamUserIds). Combine with other filters through AND, never by
// object spread, so a client-supplied filter can't replace the scope.

const team = (ctx: Ctx) => ({ in: [...ctx.teamUserIds] });

export const scopeOwner = (ctx: Ctx) => (ctx.dataScope === "ALL" ? {} : { ownerId: team(ctx) });

export const scopeMeeting = (ctx: Ctx) =>
  ctx.dataScope === "ALL" ? {} : { OR: [{ assignedToId: team(ctx) }, { createdById: team(ctx) }] };

export const scopeTicket = (ctx: Ctx) =>
  ctx.dataScope === "ALL" ? {} : { OR: [{ assignedToId: team(ctx) }, { createdById: team(ctx) }] };

/** Whether owner/salesperson filters make sense: everyone (ALL scope) or a manager with reports. */
export const canFilterByOwner = (ctx: Ctx) => ctx.dataScope === "ALL" || ctx.teamUserIds.length > 1;

/** Narrows a user list to the people whose records the caller can see. */
export function visibleUsers<T extends { id: string }>(ctx: Ctx, users: T[]): T[] {
  if (ctx.dataScope === "ALL") return users;
  const ids = new Set(ctx.teamUserIds);
  return users.filter((u) => ids.has(u.id));
}
