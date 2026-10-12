import Link from "next/link";
import type { Metadata } from "next";
import { Building2, Download, Plus } from "lucide-react";
import { pageContext } from "@/server/context";
import { listAccounts } from "@/server/services/accounts";
import { listAssignableUsers } from "@/server/services/users";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, type Column } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { EmptyState } from "@/components/data/empty-state";
import { EnumBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_META, INDUSTRIES } from "@/lib/constants";
import { formatPhone } from "@/lib/normalize";
import { formatTimestampDate } from "@/lib/dates";
import { withParams } from "@/components/data/url";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Accounts & Buyers" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("account.view");
  const sp = await searchParams;
  const [data, users] = await Promise.all([listAccounts(ctx, sp), listAssignableUsers(ctx)]);
  type Row = (typeof data.rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "Account ID", sortKey: "number", cell: (a) => a.number },
    { key: "name", header: "Company", sortKey: "name", cell: (a) => <span className="font-medium">{a.name}</span> },
    { key: "email", header: "Primary email", sortKey: "email", cell: (a) => a.email },
    { key: "phone", header: "Primary phone", cell: (a) => formatPhone(a.phone) },
    { key: "industry", header: "Industry", sortKey: "industry", cell: (a) => a.industry ?? "—" },
    { key: "owner", header: "Owner", cell: (a) => a.owner.name },
    { key: "leads", header: "Leads", className: "text-right tabular-nums", cell: (a) => <Link className="hover:underline" href={`/leads?account=${a.id}`}>{a._count.leads}</Link> },
    { key: "contacts", header: "Contacts", className: "text-right tabular-nums", cell: (a) => <Link className="hover:underline" href={`/contacts?account=${a.id}`}>{a._count.contacts}</Link> },
    { key: "orders", header: "Orders", className: "text-right tabular-nums", cell: (a) => <Link className="hover:underline" href={`/orders?account=${a.id}`}>{a._count.orders}</Link> },
    { key: "created", header: "Created", sortKey: "createdAt", cell: (a) => formatTimestampDate(a.createdAt, ctx.org.timezone) },
    { key: "status", header: "Status", sortKey: "status", cell: (a) => <EnumBadge value={a.status} meta={ACCOUNT_STATUS_META} /> },
  ];
  return (
    <>
      <PageHeader
        title="Accounts & Buyers"
        description="Customer companies, their buyers and commercial history."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Accounts & Buyers" }]}
        actions={
          <>
            {ctx.can("account.export") && (
              <Button variant="outline" size="sm" asChild>
                <a href={withParams("/api/export/accounts", sp, { page: undefined, pageSize: undefined })}>
                  <Download className="size-4" /> Export CSV
                </a>
              </Button>
            )}
            {ctx.can("account.create") && (
              <Button size="sm" asChild>
                <Link href="/accounts/new">
                  <Plus className="size-4" /> New account
                </Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search company, email, phone, city…"
        filters={[
          { key: "status", label: "Statuses", type: "select", options: ACCOUNT_STATUSES.map((s) => ({ value: s, label: ACCOUNT_STATUS_META[s].label })) },
          { key: "industry", label: "Industries", type: "select", options: INDUSTRIES.map((i) => ({ value: i, label: i })) },
          ...(ctx.dataScope === "ALL" ? [{ key: "owner", label: "Owners", type: "select" as const, options: users.map((u) => ({ value: u.id, label: u.name })) }] : []),
          { key: "createdFrom", label: "Created from", type: "date" },
          { key: "createdTo", label: "Created to", type: "date" },
        ]}
      />
      <DataTable
        caption="Accounts"
        columns={columns}
        data={data}
        basePath="/accounts"
        searchParams={sp}
        rowHref={(a) => `/accounts/${a.id}`}
        empty={<EmptyState icon={Building2} title="No accounts found" description="Adjust the filters or create an account. Converting a lead also creates one." />}
      />
    </>
  );
}
