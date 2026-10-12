import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { pageContext } from "@/server/context";
import { listAuditLogs } from "@/server/services/settings";
import { listAssignableUsers } from "@/server/services/users";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, type Column } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { EmptyState } from "@/components/data/empty-state";
import { formatDateTime } from "@/lib/dates";
import type { SearchParams } from "@/server/list";
import Link from "next/link";

export const metadata: Metadata = { title: "Audit log" };

const ENTITY_PATH: Record<string, string> = { Lead: "leads", Account: "accounts", Contact: "contacts", Meeting: "meetings", Product: "products", Ticket: "tickets", Order: "orders" };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("audit.view");
  const sp = await searchParams;
  const [data, users] = await Promise.all([listAuditLogs(ctx, sp), listAssignableUsers(ctx)]);
  type Row = (typeof data.rows)[number];
  const columns: Column<Row>[] = [
    { key: "when", header: "When", sortKey: "createdAt", cell: (r) => formatDateTime(r.createdAt, ctx.org.timezone) },
    { key: "actor", header: "Actor", cell: (r) => r.actor?.name ?? "System" },
    { key: "entity", header: "Entity", cell: (r) => (ENTITY_PATH[r.entityType] ? <Link className="text-primary hover:underline" href={`/${ENTITY_PATH[r.entityType]}/${r.entityId}`}>{r.entityType}</Link> : r.entityType) },
    { key: "action", header: "Action", cell: (r) => <code className="text-xs">{r.action}</code> },
    { key: "summary", header: "Summary", className: "max-w-xl truncate", cell: (r) => <span title={r.changes ? JSON.stringify(r.changes) : undefined}>{r.summary}</span> },
  ];
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of important business events." breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Audit log" }]} />
      <FilterBar
        searchPlaceholder="Search summary or action…"
        filters={[
          { key: "entity", label: "Entities", type: "select", options: ["Lead", "Account", "Contact", "Meeting", "Product", "Ticket", "Order", "User", "Role", "Organization", "LeadSource", "TaxRate", "ProductCategory"].map((e) => ({ value: e, label: e })) },
          { key: "actor", label: "Actors", type: "select", options: users.map((u) => ({ value: u.id, label: u.name })) },
        ]}
      />
      <DataTable caption="Audit log" columns={columns} data={data} basePath="/settings/audit-log" searchParams={sp} empty={<EmptyState icon={ScrollText} title="No audit entries" />} />
    </>
  );
}
