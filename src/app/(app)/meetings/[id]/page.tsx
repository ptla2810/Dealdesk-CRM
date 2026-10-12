import Link from "next/link";
import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import { pageContext } from "@/server/context";
import { getMeeting } from "@/server/services/meetings";
import { listAssignableUsers } from "@/server/services/users";
import { entityActivity } from "@/server/services/settings";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { DetailList } from "@/components/data/detail-list";
import { Timeline } from "@/components/data/timeline";
import { AuditTimeline } from "@/components/data/audit-timeline";
import { EnumBadge, StatusBadge } from "@/components/data/status-badge";
import { ActionButton } from "@/components/data/action-button";
import { Button } from "@/components/ui/button";
import { MinutesDialog } from "@/features/meetings/minutes-dialog";
import { ActionItemStatusSelect } from "@/features/meetings/action-item-status";
import { DiscussionDialog } from "@/features/leads/lead-dialogs";
import { userOptions } from "@/features/leads/options";
import { LEAD_STAGE_META, MEETING_STATUS_META, MEETING_TYPE_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime, toDateInput, todayUtc } from "@/lib/dates";
import { archiveMeetingAction } from "../actions";

export const metadata: Metadata = { title: "Meeting" };

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("meeting.view");
  const { id } = await params;
  const m = await orNotFound(getMeeting(ctx, id));
  const [users, activity] = await Promise.all([listAssignableUsers(ctx), entityActivity(ctx, "Meeting", m.id)]);
  const tz = ctx.org.timezone;
  const today = todayUtc();
  const opts = userOptions(users);
  const canEdit = ctx.can("meeting.edit");

  return (
    <>
      <PageHeader
        title={m.title}
        badge={<EnumBadge value={m.status} meta={MEETING_STATUS_META} />}
        description={`${m.number} · ${formatDateTime(m.scheduledAt, tz)} · ${MEETING_TYPE_LABEL[m.type]}`}
        breadcrumbs={[{ label: "Meetings & MOM", href: "/meetings" }, { label: m.number }]}
        actions={
          <>
            {canEdit && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/meetings/${m.id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            )}
            {canEdit && m.status !== "CANCELLED" && <MinutesDialog meetingId={m.id} users={opts} defaultOwner={m.assignedToId} isCompleted={m.status === "COMPLETED"} />}
            {m.lead && m.lead.stage !== "CONVERTED" && ctx.can("lead.edit") && (
              <DiscussionDialog leadId={m.lead.id} meetingId={m.id} users={opts} defaultResponsible={m.assignedToId} today={toDateInput(today)} trigger={<Button size="sm" variant="outline">Add lead progress update</Button>} />
            )}
            {ctx.can("meeting.delete") && (
              <ActionButton action={archiveMeetingAction.bind(null, m.id)} redirectTo="/meetings" successMessage="Meeting archived" confirm={{ title: "Archive this meeting?", description: "Minutes and action items are kept in history.", confirmLabel: "Archive", destructive: true }}>
                Archive
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Minutes of meeting" description="Most recent first">
            <Timeline
              empty="No minutes recorded yet."
              items={m.minutes.map((mm) => ({
                id: mm.id,
                title: mm.summary,
                meta: `${mm.author.name} · ${formatDateTime(mm.createdAt, tz)}`,
                body: (
                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    {mm.requirements && (<div><dt className="font-medium text-foreground">Customer requirements</dt><dd className="whitespace-pre-line">{mm.requirements}</dd></div>)}
                    {mm.decisions && (<div><dt className="font-medium text-foreground">Decisions taken</dt><dd className="whitespace-pre-line">{mm.decisions}</dd></div>)}
                    {mm.notes && (<div className="sm:col-span-2"><dt className="font-medium text-foreground">Notes</dt><dd className="whitespace-pre-line">{mm.notes}</dd></div>)}
                  </dl>
                ),
              }))}
            />
          </SectionCard>
          <SectionCard title="Action items" description="Owners can update their own items">
            {m.actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No action items.</p>
            ) : (
              <ul className="divide-y">
                {m.actionItems.map((a) => {
                  const overdue = a.dueDate && a.dueDate < today && (a.status === "OPEN" || a.status === "IN_PROGRESS");
                  return (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className={`text-sm font-medium ${a.status === "DONE" ? "text-muted-foreground line-through" : ""}`}>{a.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.owner.name} · due {formatDate(a.dueDate)} {overdue && <StatusBadge tone="danger" className="ml-1">Overdue</StatusBadge>}
                        </div>
                      </div>
                      <ActionItemStatusSelect id={a.id} status={a.status} disabled={!canEdit && a.owner.id !== ctx.userId} />
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
          {m.discussions.length > 0 && (
            <SectionCard title="Lead progress updates from this meeting">
              <Timeline items={m.discussions.map((d) => ({ id: d.id, title: d.summary, meta: `${d.createdBy.name} · ${formatDate(d.discussedAt)}`, body: d.nextSteps ?? undefined }))} />
            </SectionCard>
          )}
          <SectionCard title="Activity">
            <AuditTimeline entries={activity} timeZone={tz} />
          </SectionCard>
        </div>
        <div className="space-y-4">
          <SectionCard title="Details">
            <DetailList
              columns={1}
              items={[
                { label: "Account", value: m.account ? <Link href={`/accounts/${m.account.id}`} className="text-primary hover:underline">{m.account.name}</Link> : null },
                { label: "Related lead", value: m.lead ? <span className="inline-flex flex-wrap items-center gap-2"><Link href={`/leads/${m.lead.id}`} className="text-primary hover:underline">{m.lead.number} · {m.lead.name}</Link><EnumBadge value={m.lead.stage} meta={LEAD_STAGE_META} /></span> : null },
                { label: "Assigned salesperson", value: m.assignedTo.name },
                { label: "Duration", value: `${m.durationMins} minutes` },
                { label: "Location", value: m.location },
                { label: "Next follow-up", value: formatDate(m.nextFollowUpAt) },
                { label: "Meeting notes", value: m.agenda },
              ]}
            />
          </SectionCard>
          <SectionCard title="Customer contacts">
            {m.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts linked.</p>
            ) : (
              <ul className="space-y-2">
                {m.contacts.map(({ contact: c }) => (
                  <li key={c.id} className="text-sm">
                    <Link href={`/contacts/${c.id}`} className="font-medium text-primary hover:underline">{c.firstName} {c.lastName}</Link>
                    <div className="text-xs text-muted-foreground">{[c.designation, c.email].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Record details">
            <DetailList columns={1} items={[{ label: "Created", value: `${formatDateTime(m.createdAt, tz)} by ${m.createdBy.name}` }, { label: "Last modified", value: `${formatDateTime(m.updatedAt, tz)} by ${m.modifiedBy.name}` }]} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
