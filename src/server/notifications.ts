import { prisma, type Tx } from "./db";
import type { Ctx } from "./context";
import { todayUtc } from "@/lib/dates";

type NotifyInput = {
  userId: string | null | undefined;
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
};

/** Creates an in-app notification for another user (never notifies the actor about their own action). */
export async function notify(tx: Tx, ctx: Pick<Ctx, "orgId" | "userId">, n: NotifyInput) {
  if (!n.userId || n.userId === ctx.userId) return;
  if (n.dedupeKey) {
    await tx.notification.upsert({
      where: { userId_dedupeKey: { userId: n.userId, dedupeKey: n.dedupeKey } },
      create: { organizationId: ctx.orgId, userId: n.userId, type: n.type, title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey },
      update: {},
    });
    return;
  }
  await tx.notification.create({
    data: { organizationId: ctx.orgId, userId: n.userId, type: n.type, title: n.title, body: n.body, link: n.link },
  });
}

/**
 * Generates time-based reminders for the current user: meetings in the next 24 hours,
 * overdue action items and overdue lead follow-ups. Idempotent thanks to dedupe keys,
 * so it is safe to call whenever notifications are fetched.
 */
export async function syncDueNotifications(ctx: Ctx) {
  const now = new Date();
  const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const today = todayUtc(now);

  const [meetings, actions, leads] = await Promise.all([
    prisma.meeting.findMany({
      where: { organizationId: ctx.orgId, assignedToId: ctx.userId, deletedAt: null, status: "SCHEDULED", scheduledAt: { gte: now, lte: soon } },
      select: { id: true, title: true, number: true },
      take: 20,
    }),
    prisma.actionItem.findMany({
      where: { ownerId: ctx.userId, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: today }, meeting: { organizationId: ctx.orgId, deletedAt: null } },
      select: { id: true, description: true, meetingId: true },
      take: 20,
    }),
    prisma.lead.findMany({
      where: { organizationId: ctx.orgId, ownerId: ctx.userId, deletedAt: null, stage: { not: "CONVERTED" }, nextFollowUpAt: { lt: today } },
      select: { id: true, name: true, number: true, nextFollowUpAt: true },
      take: 20,
    }),
  ]);

  const rows = [
    ...meetings.map((m) => ({
      type: "meeting_upcoming",
      title: `Upcoming meeting: ${m.title}`,
      body: `${m.number} is scheduled within the next 24 hours.`,
      link: `/meetings/${m.id}`,
      dedupeKey: `meeting-upcoming:${m.id}`,
    })),
    ...actions.map((a) => ({
      type: "action_overdue",
      title: "Action item overdue",
      body: a.description.slice(0, 140),
      link: `/meetings/${a.meetingId}`,
      dedupeKey: `action-overdue:${a.id}`,
    })),
    ...leads.map((l) => ({
      type: "followup_overdue",
      title: `Follow-up overdue: ${l.name}`,
      body: `${l.number} follow-up was due ${l.nextFollowUpAt?.toISOString().slice(0, 10)}.`,
      link: `/leads/${l.id}`,
      dedupeKey: `lead-followup:${l.id}:${l.nextFollowUpAt?.toISOString().slice(0, 10)}`,
    })),
  ];
  if (!rows.length) return;
  await prisma.notification.createMany({
    data: rows.map((r) => ({ ...r, organizationId: ctx.orgId, userId: ctx.userId })),
    skipDuplicates: true,
  });
}
