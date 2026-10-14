import Link from "next/link";
import type { Metadata } from "next";
import { Download, Plus, Target } from "lucide-react";
import { canFilterByOwner, pageContext, visibleUsers } from "@/server/context";
import { listLeads, leadSourceOptions } from "@/server/services/leads";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, type Column } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { EmptyState } from "@/components/data/empty-state";
import { EnumBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { LEAD_STAGES, LEAD_STAGE_META } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";
import { formatDate, formatTimestampDate, todayUtc } from "@/lib/dates";
import { withParams } from "@/components/data/url";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("lead.view");
  const sp = await searchParams;
  const [data, sources, users, accounts] = await Promise.all([listLeads(ctx, sp), leadSourceOptions(ctx, true), listAssignableUsers(ctx), accountOptions(ctx)]);
  const tz = ctx.org.timezone;
  const today = todayUtc();
  type Row = (typeof data.rows)[number];

  const columns: Column<Row>[] = [
    { key: "number", header: "Lead ID", sortKey: "number", cell: (l) => l.number, className: "whitespace-nowrap" },
    { key: "name", header: "Lead name", sortKey: "name", cell: (l) => <span className="font-medium">{l.name}</span> },
    {
      key: "company",
      header: "Company / Account",
      sortKey: "companyName",
      cell: (l) =>
        l.account ? (
          <Link href={`/accounts/${l.account.id}`} className="hover:underline">
            {l.account.name}
          </Link>
        ) : (
          l.companyName
        ),
    },
    { key: "email", header: "Email", cell: (l) => <a href={`mailto:${l.email}`} className="hover:underline">{l.email}</a> },
    { key: "phone", header: "Phone", cell: (l) => <span className="whitespace-nowrap">{formatPhone(l.phone)}</span> },
    { key: "source", header: "Source", cell: (l) => l.source.name },
    { key: "owner", header: "Owner", cell: (l) => l.owner.name },
    { key: "stage", header: "Stage", sortKey: "stage", cell: (l) => <EnumBadge value={l.stage} meta={LEAD_STAGE_META} /> },
    { key: "value", header: "Est. value", sortKey: "estimatedValue", className: "text-right tabular-nums whitespace-nowrap", cell: (l) => formatMoney(l.estimatedValue, l.currency) },
    {
      key: "followUp",
      header: "Next follow-up",
      sortKey: "nextFollowUpAt",
      className: "whitespace-nowrap",
      cell: (l) => (
        <span className={l.nextFollowUpAt && l.nextFollowUpAt < today && l.stage !== "CONVERTED" ? "font-medium text-destructive" : undefined}>{formatDate(l.nextFollowUpAt)}</span>
      ),
    },
    { key: "created", header: "Created", sortKey: "createdAt", className: "whitespace-nowrap", cell: (l) => formatTimestampDate(l.createdAt, tz) },
    { key: "modified", header: "Modified", sortKey: "updatedAt", className: "whitespace-nowrap", cell: (l) => formatTimestampDate(l.updatedAt, tz) },
    { key: "createdBy", header: "Created by", cell: (l) => l.createdBy.name },
    { key: "modifiedBy", header: "Modified by", cell: (l) => l.modifiedBy.name },
    {
      key: "actions",
      header: "Actions",
      cell: (l) => (
        <div className="flex gap-2 whitespace-nowrap">
          <Link href={`/leads/${l.id}`} className="text-primary hover:underline">
            View
          </Link>
          {ctx.can("lead.edit") && (
            <Link href={`/leads/${l.id}/edit`} className="text-primary hover:underline">
              Edit
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        description="Capture, qualify and convert inquiries into buyers."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Leads" }]}
        actions={
          <>
            {ctx.can("lead.export") && (
              <Button variant="outline" size="sm" asChild>
                <a href={withParams("/api/export/leads", sp, { page: undefined, pageSize: undefined })}>
                  <Download className="size-4" /> Export CSV
                </a>
              </Button>
            )}
            {ctx.can("lead.create") && (
              <Button size="sm" asChild>
                <Link href="/leads/new">
                  <Plus className="size-4" /> New lead
                </Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search name, email, company, ID…"
        filters={[
          { key: "stage", label: "Stages", type: "select", options: LEAD_STAGES.map((s) => ({ value: s, label: LEAD_STAGE_META[s].label })) },
          { key: "source", label: "Sources", type: "select", options: sources.map((s) => ({ value: s.id, label: s.name })) },
          ...(canFilterByOwner(ctx) ? [{ key: "owner", label: "Owners", type: "select" as const, options: visibleUsers(ctx, users).map((u) => ({ value: u.id, label: u.name })) }] : []),
          { key: "account", label: "Accounts", type: "select", options: accounts.map((a) => ({ value: a.id, label: a.name })) },
          { key: "createdFrom", label: "Created from", type: "date" },
          { key: "createdTo", label: "Created to", type: "date" },
          { key: "followUpFrom", label: "Follow-up from", type: "date" },
          { key: "followUpTo", label: "Follow-up to", type: "date" },
          { key: "overdue", label: "Overdue follow-ups", type: "checkbox" },
        ]}
      />
      <DataTable
        caption="Leads"
        columns={columns}
        data={data}
        basePath="/leads"
        searchParams={sp}
        rowHref={(l) => `/leads/${l.id}`}
        empty={
          <EmptyState
            icon={Target}
            title="No leads found"
            description="Try adjusting the filters, or create a new lead."
            action={
              ctx.can("lead.create") ? (
                <Button size="sm" asChild>
                  <Link href="/leads/new">New lead</Link>
                </Button>
              ) : undefined
            }
          />
        }
      />
    </>
  );
}
