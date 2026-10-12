import Link from "next/link";
import type { Metadata } from "next";
import { Package, Pencil } from "lucide-react";
import { pageContext } from "@/server/context";
import { getProduct } from "@/server/services/products";
import { entityActivity } from "@/server/services/settings";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { DetailList } from "@/components/data/detail-list";
import { AuditTimeline } from "@/components/data/audit-timeline";
import { EnumBadge } from "@/components/data/status-badge";
import { ActionButton } from "@/components/data/action-button";
import { Button } from "@/components/ui/button";
import { ORDER_STATUS_META, PRODUCT_STATUS_META } from "@/lib/constants";
import { formatMoney, formatNumber } from "@/lib/format";
import { formatDate, formatDateTime } from "@/lib/dates";
import { archiveProductAction, setProductStatusAction } from "../actions";

export const metadata: Metadata = { title: "Product" };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("product.view");
  const { id } = await params;
  const p = await orNotFound(getProduct(ctx, id));
  const activity = await entityActivity(ctx, "Product", p.id);
  const tz = ctx.org.timezone;
  return (
    <>
      <PageHeader
        title={p.name}
        badge={<EnumBadge value={p.status} meta={PRODUCT_STATUS_META} />}
        description={`${p.number} · SKU ${p.sku}`}
        breadcrumbs={[{ label: "Products", href: "/products" }, { label: p.sku }]}
        actions={
          <>
            {ctx.can("product.edit") && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/products/${p.id}/edit`}><Pencil className="size-4" /> Edit</Link>
                </Button>
                {p.status === "ACTIVE" ? (
                  <ActionButton action={setProductStatusAction.bind(null, p.id, "INACTIVE")} successMessage="Product deactivated" confirm={{ title: "Deactivate this product?", description: "It can no longer be added to new orders. Existing orders are unaffected.", confirmLabel: "Deactivate" }}>
                    Deactivate
                  </ActionButton>
                ) : (
                  <ActionButton action={setProductStatusAction.bind(null, p.id, "ACTIVE")} successMessage="Product activated">Activate</ActionButton>
                )}
              </>
            )}
            {ctx.can("product.delete") && (
              <ActionButton action={archiveProductAction.bind(null, p.id)} redirectTo="/products" successMessage="Product archived" confirm={{ title: "Archive this product?", description: "The SKU stays reserved and historic orders keep their snapshot.", confirmLabel: "Archive", destructive: true }}>
                Archive
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Product information">
            <div className="flex flex-col gap-6 sm:flex-row">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.name} className="size-40 shrink-0 rounded-lg border object-cover" />
              ) : (
                <div className="grid size-40 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground"><Package className="size-10" /></div>
              )}
              <DetailList
                className="flex-1"
                items={[
                  { label: "Category", value: p.category?.name },
                  { label: "Unit of measure", value: p.unitOfMeasure },
                  { label: "List price", value: formatMoney(p.listPrice, p.currency) },
                  { label: "Tax classification", value: p.taxRate ? `${p.taxRate.name} (${p.taxRate.ratePercent.toString()}%)` : "None" },
                  { label: "Short description", value: p.shortDescription, full: true },
                  { label: "Detailed description", value: p.description, full: true },
                ]}
              />
            </div>
          </SectionCard>
          <SectionCard title="Recent orders" description="Order lines keep the price agreed at the time of sale">
            {p.orderLines.length === 0 ? <p className="text-sm text-muted-foreground">Not ordered yet.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 font-medium">Order</th><th className="font-medium">Account</th><th className="font-medium">Date</th><th className="text-right font-medium">Qty</th><th className="text-right font-medium">Unit price</th><th className="pl-3 font-medium">Status</th></tr></thead>
                  <tbody>
                    {p.orderLines.map((l) => (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="py-2"><Link href={`/orders/${l.order.id}`} className="text-primary hover:underline">{l.order.number}</Link></td>
                        <td>{l.order.account.name}</td>
                        <td>{formatDate(l.order.orderDate)}</td>
                        <td className="text-right tabular-nums">{formatNumber(l.quantity, 3)}</td>
                        <td className="text-right tabular-nums">{formatMoney(l.unitPrice, l.order.currency)}</td>
                        <td className="pl-3"><EnumBadge value={l.order.status} meta={ORDER_STATUS_META} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Activity"><AuditTimeline entries={activity} timeZone={tz} /></SectionCard>
        </div>
        <SectionCard title="Record details">
          <DetailList columns={1} items={[{ label: "Created", value: `${formatDateTime(p.createdAt, tz)} by ${p.createdBy.name}` }, { label: "Last modified", value: `${formatDateTime(p.updatedAt, tz)} by ${p.modifiedBy.name}` }]} />
        </SectionCard>
      </div>
    </>
  );
}
