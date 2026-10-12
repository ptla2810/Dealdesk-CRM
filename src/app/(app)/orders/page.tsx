import Link from "next/link";
import type { Metadata } from "next";
import { Download, Plus, Truck } from "lucide-react";
import { pageContext } from "@/server/context";
import { listOrders } from "@/server/services/orders";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, type Column } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { EmptyState } from "@/components/data/empty-state";
import { EnumBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { DELIVERY_STATUSES, DELIVERY_STATUS_META, ORDER_STATUSES, ORDER_STATUS_META } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { formatDate, todayUtc } from "@/lib/dates";
import { withParams } from "@/components/data/url";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Orders & Delivery" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("order.view");
  const sp = await searchParams;
  const [data, users, accounts] = await Promise.all([listOrders(ctx, sp), listAssignableUsers(ctx), accountOptions(ctx)]);
  const today = todayUtc();
  type Row = (typeof data.rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "Order number", sortKey: "number", cell: (o) => o.number },
    { key: "account", header: "Account", cell: (o) => <Link href={`/accounts/${o.account.id}`} className="hover:underline">{o.account.name}</Link> },
    { key: "lead", header: "Related lead", cell: (o) => (o.lead ? <Link href={`/leads/${o.lead.id}`} className="hover:underline">{o.lead.number}</Link> : "—") },
    { key: "date", header: "Order date", sortKey: "orderDate", cell: (o) => formatDate(o.orderDate) },
    { key: "owner", header: "Owner", cell: (o) => o.owner.name },
    { key: "total", header: "Order value", sortKey: "total", className: "text-right tabular-nums", cell: (o) => formatMoney(o.total, o.currency) },
    { key: "currency", header: "Currency", cell: (o) => o.currency },
    { key: "status", header: "Status", sortKey: "status", cell: (o) => <EnumBadge value={o.status} meta={ORDER_STATUS_META} /> },
    {
      key: "expected",
      header: "Expected delivery",
      sortKey: "expectedDeliveryDate",
      cell: (o) => {
        const late = o.expectedDeliveryDate && o.expectedDeliveryDate < today && !["DELIVERED", "CANCELLED"].includes(o.status);
        return <span className={late ? "font-medium text-destructive" : undefined}>{formatDate(o.expectedDeliveryDate)}{late ? " (late)" : ""}</span>;
      },
    },
    { key: "actual", header: "Actual delivery", cell: (o) => formatDate(o.actualDeliveryDate) },
    { key: "delivery", header: "Delivery status", sortKey: "deliveryStatus", cell: (o) => <EnumBadge value={o.deliveryStatus} meta={DELIVERY_STATUS_META} /> },
  ];
  return (
    <>
      <PageHeader
        title="Orders & Delivery"
        description="Orders from draft to delivery. Payment collection is not tracked yet."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Orders & Delivery" }]}
        actions={
          <>
            {ctx.can("order.export") && (
              <Button variant="outline" size="sm" asChild>
                <a href={withParams("/api/export/orders", sp, { page: undefined, pageSize: undefined })}><Download className="size-4" /> Export CSV</a>
              </Button>
            )}
            {ctx.can("order.create") && (
              <Button size="sm" asChild>
                <Link href="/orders/new"><Plus className="size-4" /> New order</Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search order number, account, tracking…"
        filters={[
          { key: "status", label: "Statuses", type: "select", options: ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_META[s].label })) },
          { key: "delivery", label: "Delivery statuses", type: "select", options: DELIVERY_STATUSES.map((s) => ({ value: s, label: DELIVERY_STATUS_META[s].label })) },
          { key: "account", label: "Accounts", type: "select", options: accounts.map((a) => ({ value: a.id, label: a.name })) },
          ...(ctx.dataScope === "ALL" ? [{ key: "owner", label: "Owners", type: "select" as const, options: users.map((u) => ({ value: u.id, label: u.name })) }] : []),
          { key: "from", label: "Order date from", type: "date" },
          { key: "to", label: "Order date to", type: "date" },
          { key: "active", label: "In progress only", type: "checkbox" },
        ]}
      />
      <DataTable caption="Orders" columns={columns} data={data} basePath="/orders" searchParams={sp} rowHref={(o) => `/orders/${o.id}`} empty={<EmptyState icon={Truck} title="No orders found" description="Adjust the filters or create an order." />} />
    </>
  );
}
