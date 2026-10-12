import Link from "next/link";
import type { Metadata } from "next";
import { LifeBuoy, Plus } from "lucide-react";
import { pageContext } from "@/server/context";
import { listTickets } from "@/server/services/tickets";
import { listAssignableUsers } from "@/server/services/users";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, type Column } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { EmptyState } from "@/components/data/empty-state";
import { EnumBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { TICKET_CATEGORIES, TICKET_CATEGORY_LABEL, TICKET_PRIORITIES, TICKET_PRIORITY_META, TICKET_STATUSES, TICKET_STATUS_META } from "@/lib/constants";
import { formatTimestampDate } from "@/lib/dates";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Support Tickets" };

export default async function TicketsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("ticket.view");
  const sp = await searchParams;
  const [data, users] = await Promise.all([listTickets(ctx, sp), listAssignableUsers(ctx)]);
  const tz = ctx.org.timezone;
  type Row = (typeof data.rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "Ticket ID", sortKey: "number", cell: (t) => t.number },
    { key: "subject", header: "Subject", sortKey: "subject", className: "max-w-xs truncate", cell: (t) => <span className="font-medium">{t.subject}</span> },
    { key: "account", header: "Account", cell: (t) => <Link href={`/accounts/${t.account.id}`} className="hover:underline">{t.account.name}</Link> },
    { key: "contact", header: "Contact", cell: (t) => (t.contact ? `${t.contact.firstName} ${t.contact.lastName}` : "—") },
    { key: "lead", header: "Lead", cell: (t) => (t.lead ? <Link href={`/leads/${t.lead.id}`} className="hover:underline">{t.lead.number}</Link> : "—") },
    { key: "order", header: "Order", cell: (t) => (t.order ? <Link href={`/orders/${t.order.id}`} className="hover:underline">{t.order.number}</Link> : "—") },
    { key: "category", header: "Category", cell: (t) => TICKET_CATEGORY_LABEL[t.category] },
    { key: "priority", header: "Priority", sortKey: "priority", cell: (t) => <EnumBadge value={t.priority} meta={TICKET_PRIORITY_META} /> },
    { key: "status", header: "Status", sortKey: "status", cell: (t) => <EnumBadge value={t.status} meta={TICKET_STATUS_META} /> },
    { key: "agent", header: "Agent", cell: (t) => t.assignedTo?.name ?? <span className="text-muted-foreground">Unassigned</span> },
    { key: "created", header: "Created", sortKey: "createdAt", cell: (t) => formatTimestampDate(t.createdAt, tz) },
    { key: "updated", header: "Last updated", sortKey: "updatedAt", cell: (t) => formatTimestampDate(t.updatedAt, tz) },
    { key: "resolved", header: "Resolved", sortKey: "resolvedAt", cell: (t) => (t.resolvedAt ? formatTimestampDate(t.resolvedAt, tz) : "—") },
  ];
  return (
    <>
      <PageHeader
        title="Support Tickets"
        description="Buyer queries and complaints, with internal notes kept separate from customer replies."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Support Tickets" }]}
        actions={ctx.can("ticket.create") ? <Button size="sm" asChild><Link href="/tickets/new"><Plus className="size-4" /> New ticket</Link></Button> : undefined}
      />
      <FilterBar
        searchPlaceholder="Search subject, ID, account…"
        filters={[
          { key: "status", label: "Statuses", type: "select", options: TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_META[s].label })) },
          { key: "priority", label: "Priorities", type: "select", options: TICKET_PRIORITIES.map((p) => ({ value: p, label: TICKET_PRIORITY_META[p].label })) },
          { key: "category", label: "Categories", type: "select", options: TICKET_CATEGORIES.map((c) => ({ value: c, label: TICKET_CATEGORY_LABEL[c] })) },
          { key: "assignee", label: "Agents", type: "select", options: [{ value: "me", label: "Assigned to me" }, { value: "unassigned", label: "Unassigned" }, ...users.map((u) => ({ value: u.id, label: u.name }))] },
          { key: "open", label: "Open tickets only", type: "checkbox" },
        ]}
      />
      <DataTable caption="Tickets" columns={columns} data={data} basePath="/tickets" searchParams={sp} rowHref={(t) => `/tickets/${t.id}`} empty={<EmptyState icon={LifeBuoy} title="No tickets found" description="Adjust the filters or open a ticket." />} />
    </>
  );
}
