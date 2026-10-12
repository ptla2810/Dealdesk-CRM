import Link from "next/link";
import type { Metadata } from "next";
import { Package, Plus } from "lucide-react";
import { pageContext } from "@/server/context";
import { catalogOptions, listProducts } from "@/server/services/products";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, type Column } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { EmptyState } from "@/components/data/empty-state";
import { EnumBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { PRODUCT_STATUSES, PRODUCT_STATUS_META } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { formatTimestampDate } from "@/lib/dates";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("product.view");
  const sp = await searchParams;
  const [data, { categories }] = await Promise.all([listProducts(ctx, sp), catalogOptions(ctx)]);
  type Row = (typeof data.rows)[number];
  const tz = ctx.org.timezone;
  const columns: Column<Row>[] = [
    { key: "number", header: "Product ID", sortKey: "number", cell: (p) => p.number },
    {
      key: "name",
      header: "Product",
      sortKey: "name",
      cell: (p) => (
        <span className="flex items-center gap-2">
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt="" className="size-7 rounded object-cover" />
          ) : (
            <span className="grid size-7 place-items-center rounded bg-muted text-muted-foreground"><Package className="size-3.5" /></span>
          )}
          <span className="font-medium">{p.name}</span>
        </span>
      ),
    },
    { key: "sku", header: "SKU", sortKey: "sku", cell: (p) => <code className="text-xs">{p.sku}</code> },
    { key: "category", header: "Category", cell: (p) => p.category?.name ?? "—" },
    { key: "short", header: "Short description", className: "max-w-xs truncate", cell: (p) => p.shortDescription ?? "—" },
    { key: "uom", header: "Unit", cell: (p) => p.unitOfMeasure },
    { key: "price", header: "List price", sortKey: "listPrice", className: "text-right tabular-nums", cell: (p) => formatMoney(p.listPrice, p.currency) },
    { key: "tax", header: "Tax", cell: (p) => p.taxRate?.name ?? "—" },
    { key: "status", header: "Status", sortKey: "status", cell: (p) => <EnumBadge value={p.status} meta={PRODUCT_STATUS_META} /> },
    { key: "created", header: "Created", sortKey: "createdAt", cell: (p) => formatTimestampDate(p.createdAt, tz) },
    { key: "modified", header: "Modified", sortKey: "updatedAt", cell: (p) => formatTimestampDate(p.updatedAt, tz) },
  ];
  return (
    <>
      <PageHeader
        title="Products"
        description="Central catalogue of products and services offered to buyers."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Products" }]}
        actions={
          ctx.can("product.create") ? (
            <Button size="sm" asChild>
              <Link href="/products/new"><Plus className="size-4" /> New product</Link>
            </Button>
          ) : undefined
        }
      />
      <FilterBar
        searchPlaceholder="Search name, SKU, description…"
        filters={[
          { key: "category", label: "Categories", type: "select", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { key: "status", label: "Statuses", type: "select", options: PRODUCT_STATUSES.map((s) => ({ value: s, label: PRODUCT_STATUS_META[s].label })) },
        ]}
      />
      <DataTable caption="Products" columns={columns} data={data} basePath="/products" searchParams={sp} rowHref={(p) => `/products/${p.id}`} empty={<EmptyState icon={Package} title="No products found" description="Adjust the filters or add a product." />} />
    </>
  );
}
