import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, ListChecks, Plus } from "lucide-react";
import { pageContext } from "@/server/context";
import { listMeetings } from "@/server/services/meetings";
import { listAssignableUsers } from "@/server/services/users";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, type Column } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { EmptyState } from "@/components/data/empty-state";
import { EnumBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { MEETING_STATUSES, MEETING_STATUS_META, MEETING_TYPES, MEETING_TYPE_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Meetings & MOM" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("meeting.view");
  const sp = await searchParams;
  const [data, users] = await Promise.all([listMeetings(ctx, sp), listAssignableUsers(ctx)]);
  type Row = (typeof data.rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "ID", sortKey: "number", cell: (m) => m.number },
    { key: "title", header: "Title", sortKey: "title", cell: (m) => <span className="font-medium">{m.title}</span> },
    { key: "when", header: "Date & time", sortKey: "scheduledAt", cell: (m) => formatDateTime(m.scheduledAt, ctx.org.timezone) },
    { key: "type", header: "Type", sortKey: "type", cell: (m) => MEETING_TYPE_LABEL[m.type] },
    { key: "account", header: "Account", cell: (m) => (m.account ? <Link className="hover:underline" href={`/accounts/${m.account.id}`}>{m.account.name}</Link> : "—") },
    { key: "lead", header: "Lead", cell: (m) => (m.lead ? <Link className="hover:underline" href={`/leads/${m.lead.id}`}>{m.lead.number}</Link> : "—") },
    { key: "assignee", header: "Salesperson", cell: (m) => m.assignedTo.name },
    { key: "mom", header: "MOM / actions", className: "text-right tabular-nums", cell: (m) => `${m._count.minutes} / ${m._count.actionItems}` },
    { key: "followUp", header: "Next follow-up", cell: (m) => formatDate(m.nextFollowUpAt) },
    { key: "status", header: "Status", sortKey: "status", cell: (m) => <EnumBadge value={m.status} meta={MEETING_STATUS_META} /> },
  ];
  return (
    <>
      <PageHeader
        title="Meetings & MOM"
        description="Customer meetings, minutes, action items and follow-ups."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Meetings & MOM" }]}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/meetings/follow-ups">
                <ListChecks className="size-4" /> Follow-ups
              </Link>
            </Button>
            {ctx.can("meeting.create") && (
              <Button size="sm" asChild>
                <Link href="/meetings/new">
                  <Plus className="size-4" /> New meeting
                </Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search title, account, lead…"
        filters={[
          { key: "when", label: "Timeframe", type: "select", options: [{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }] },
          { key: "status", label: "Statuses", type: "select", options: MEETING_STATUSES.map((s) => ({ value: s, label: MEETING_STATUS_META[s].label })) },
          { key: "type", label: "Types", type: "select", options: MEETING_TYPES.map((t) => ({ value: t, label: MEETING_TYPE_LABEL[t] })) },
          ...(ctx.dataScope === "ALL" ? [{ key: "assignee", label: "Salespeople", type: "select" as const, options: users.map((u) => ({ value: u.id, label: u.name })) }] : []),
          { key: "from", label: "From", type: "date" },
          { key: "to", label: "To", type: "date" },
        ]}
      />
      <DataTable caption="Meetings" columns={columns} data={data} basePath="/meetings" searchParams={sp} rowHref={(m) => `/meetings/${m.id}`} empty={<EmptyState icon={CalendarClock} title="No meetings found" description="Schedule a meeting or adjust the filters." />} />
    </>
  );
}
