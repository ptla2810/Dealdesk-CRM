import { prisma } from "../db";
import type { Ctx } from "../context";
import { syncDueNotifications } from "../notifications";

export async function listNotifications(ctx: Ctx, opts: { take?: number; unreadOnly?: boolean } = {}) {
  await syncDueNotifications(ctx);
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: ctx.userId, organizationId: ctx.orgId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: opts.take ?? 20,
    }),
    prisma.notification.count({ where: { userId: ctx.userId, organizationId: ctx.orgId, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationsRead(ctx: Ctx, ids?: string[]) {
  await prisma.notification.updateMany({
    where: { userId: ctx.userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}
