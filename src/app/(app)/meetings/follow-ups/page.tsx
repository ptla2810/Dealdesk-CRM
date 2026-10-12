import Link from "next/link";
import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { getFollowUps } from "@/server/services/meetings";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { EnumBadge, StatusBadge } from "@/components/data/status-badge";
import { ActionItemStatusSelect } from "@/features/meetings/action-item-status";
import { LEAD_STAGE_META } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Follow-ups" };

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ scope?: string; days?: string }> }) {
  const ctx = await pageContext("meeting.view");
  const sp = await searchParams;
  const mine = sp.scope !== "team" || ctx.dataScope === "OWN";
  const days = [7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const f = await getFollowUps(ctx, { mine, days });
  const tz = ctx.org.timezone;
  const chip = (active: boolean) => cn("rounded-md px-2.5 py-1 text-sm", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted");
  const overdueCount = f.actionItems.filter((a) => a.overdue).length + f.leads.filter((l) => l.overdue).length;

  return (
    <>
      <PageHeader
        title="Follow-ups & commitments"
        description={`Overdue items plus everything due in the next ${days} days. ${overdueCount} overdue.`}
        breadcrumbs={[{ label: "Meetings & MOM", href: "/meetings" }, { label: "Follow-ups" }]}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {ctx.dataScope === "ALL" && (
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            <Link href={`?scope=mine&days=${days}`} className={chip(mine)}>Mine</Link>
            <Link href={`?scope=team&days=${days}`} className={chip(!mine)}>Whole team</Link>
          </div>
        )}
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {[7, 14, 30].map((d) => (
            <Link key={d} href={`?scope=${mine ? "mine" : "team"}&days=${d}`} className={chip(days === d)}>
              {d} days
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title={`Action items (${f.actionItems.length})`}>
          {f.actionItems.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due.</p> : (
            <ul className="divide-y">
              {f.actionItems.map((a) => (
                <li key={a.id} className="space-y-1.5 py-3">
                  <div className="text-sm font-medium">{a.description}</div>
                  <div className="text-xs text-muted-foreground">
                    <Link href={`/meetings/${a.meeting.id}`} className="hover:underline">{a.meeting.number} · {a.meeting.title}</Link> · {a.owner.name} · due {formatDate(a.dueDate)}
                  </div>
                  <div className="flex items-center gap-2">
                    {a.overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
                    <ActionItemStatusSelect id={a.id} status={a.status} disabled={!ctx.can("meeting.edit") && a.owner.id !== ctx.userId} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title={`Lead follow-ups (${f.leads.length})`}>
          {f.leads.length === 0 ? <p className="text-sm text-muted-foreground">Nothing due.</p> : (
            <ul className="divide-y">
              {f.leads.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link href={`/leads/${l.id}`} className="text-sm font-medium text-primary hover:underline">{l.name}</Link>
                    <div className="text-xs text-muted-foreground">{l.companyName} · {l.owner.name} · {formatDate(l.nextFollowUpAt)}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <EnumBadge value={l.stage} meta={LEAD_STAGE_META} />
                    {l.overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title={`Upcoming meetings (${f.meetings.length})`}>
          {f.meetings.length === 0 ? <p className="text-sm text-muted-foreground">No meetings scheduled.</p> : (
            <ul className="divide-y">
              {f.meetings.map((m) => (
                <li key={m.id} className="py-3">
                  <Link href={`/meetings/${m.id}`} className="text-sm font-medium text-primary hover:underline">{m.title}</Link>
                  <div className="text-xs text-muted-foreground">{formatDateTime(m.scheduledAt, tz)} · {m.account?.name ?? m.lead?.name} · {m.assignedTo.name}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
