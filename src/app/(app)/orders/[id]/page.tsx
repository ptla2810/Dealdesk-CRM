import Link from "next/link";
import type { Metadata } from "next";
import { Check, Circle, LifeBuoy, Pencil, XCircle } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { pageContext } from "@/server/context";
import { getOrder } from "@/server/services/orders";
import { entityActivity } from "@/server/services/settings";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { DetailList } from "@/components/data/detail-list";
import { Timeline } from "@/components/data/timeline";
import { AuditTimeline } from "@/components/data/audit-timeline";
import { EnumBadge } from "@/components/data/status-badge";
import { ActionButton } from "@/components/data/action-button";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DeliveryEventDialog, OrderStatusButton } from "@/features/orders/order-controls";
import { DELIVERY_STATUS_META, ORDER_STATUS_META, TICKET_STATUS_META } from "@/lib/constants";
import { allowedOrderTargets } from "@/lib/workflows";
import { formatMoney, formatNumber } from "@/lib/format";
import { formatDate, formatDateTime, toDateInput, toDateTimeInput, todayUtc } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { archiveOrderAction } from "../actions";

export const metadata: Metadata = { title: "Order" };

const MILESTONES: { status: OrderStatus; label: string }[] = [
  { status: "DRAFT", label: "Order created" },
  { status: "CONFIRMED", label: "Order confirmed" },
  { status: "PROCESSING", label: "Processing started" },
  { status: "SHIPPED", label: "Shipped" },
  { status: "DELIVERED", label: "Delivered" },
];

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("order.view");
  const { id } = await params;
  const o = await orNotFound(getOrder(ctx, id));
  const activity = await entityActivity(ctx, "Order", o.id);
  const tz = ctx.org.timezone;
  const targets = ctx.can("order.change_status") ? allowedOrderTargets(o.status, ctx.settings.orderWorkflow) : [];
  const reachedAt = (s: OrderStatus) => (s === "DRAFT" ? o.createdAt : o.statusHistory.find((h) => h.toStatus === s)?.changedAt);
  const cancelled = o.status === "CANCELLED";
  const cur = o.currency;

  return (
    <>
      <PageHeader
        title={`Order ${o.number}`}
        badge={<><EnumBadge value={o.status} meta={ORDER_STATUS_META} /><EnumBadge value={o.deliveryStatus} meta={DELIVERY_STATUS_META} /></>}
        description={`${o.account.name} · ${formatDate(o.orderDate)} · ${formatMoney(o.total, cur)}`}
        breadcrumbs={[{ label: "Orders & Delivery", href: "/orders" }, { label: o.number }]}
        actions={
          <>
            {o.status === "DRAFT" && ctx.can("order.edit") && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/orders/${o.id}/edit`}><Pencil className="size-4" /> Edit draft</Link>
              </Button>
            )}
            {targets.map((t) => (
              <OrderStatusButton key={t} orderId={o.id} version={o.version} to={t} carrier={o.carrier} trackingNumber={o.trackingNumber} today={toDateInput(todayUtc())} />
            ))}
            {o.status === "SHIPPED" && ctx.can("order.change_status") && (
              <DeliveryEventDialog orderId={o.id} version={o.version} carrier={o.carrier} trackingNumber={o.trackingNumber} now={toDateTimeInput(new Date(), tz)} />
            )}
            {ctx.can("ticket.create") && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/tickets/new?orderId=${o.id}`}><LifeBuoy className="size-4" /> Raise ticket</Link>
              </Button>
            )}
            {ctx.can("order.delete") && (o.status === "DRAFT" || cancelled) && (
              <ActionButton action={archiveOrderAction.bind(null, o.id)} redirectTo="/orders" successMessage="Order archived" confirm={{ title: "Archive this order?", description: "Only draft or cancelled orders can be archived.", confirmLabel: "Archive", destructive: true }}>
                Archive
              </ActionButton>
            )}
          </>
        }
      />

      <SectionCard title="Delivery timeline" className="mb-4">
        <ol className="grid gap-3 sm:grid-cols-5" aria-label="Order progress">
          {MILESTONES.map((m) => {
            const at = reachedAt(m.status);
            return (
              <li key={m.status} className={cn("flex items-start gap-2 rounded-md border p-3", at ? "border-primary/30 bg-primary/5" : "opacity-60")}>
                {at ? <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                <div>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{at ? formatDateTime(at, tz) : "Pending"}</div>
                </div>
              </li>
            );
          })}
        </ol>
        {cancelled && (
          <p className="mt-3 flex items-center gap-2 text-sm text-destructive">
            <XCircle className="size-4" /> Cancelled {formatDateTime(reachedAt("CANCELLED"), tz)}
          </p>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Line items" description="Prices and descriptions are snapshots taken when the order was priced">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 font-medium">Product</th>
                    <th className="text-right font-medium">Qty</th>
                    <th className="text-right font-medium">Unit price</th>
                    <th className="text-right font-medium">Discount</th>
                    <th className="text-right font-medium">Tax</th>
                    <th className="text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {o.lineItems.map((l) => (
                    <tr key={l.id} className="border-b align-top last:border-0">
                      <td className="py-2">
                        <Link href={`/products/${l.product.id}`} className="font-medium text-primary hover:underline">{l.productName}</Link>
                        <div className="text-xs text-muted-foreground">{l.productSku}{l.description ? ` · ${l.description}` : ""}</div>
                        {!l.unitPrice.equals(l.listPriceAtSale) && <div className="text-xs text-amber-700">Negotiated (list {formatMoney(l.listPriceAtSale, cur)})</div>}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatNumber(l.quantity, 3)} {l.unitOfMeasure}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(l.unitPrice, cur)}</td>
                      <td className="py-2 text-right tabular-nums">{Number(l.discountPercent) ? `${Number(l.discountPercent)}% (−${formatMoney(l.discountAmount, cur)})` : "—"}</td>
                      <td className="py-2 text-right tabular-nums">{Number(l.taxRatePercent) ? `${Number(l.taxRatePercent)}% (${formatMoney(l.taxAmount, cur)})` : "—"}</td>
                      <td className="py-2 text-right font-medium tabular-nums">{formatMoney(l.lineTotal, cur)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Subtotal</dt><dd className="text-right tabular-nums">{formatMoney(o.subtotal, cur)}</dd>
              <dt className="text-muted-foreground">Discount</dt><dd className="text-right tabular-nums">−{formatMoney(o.discountTotal, cur)}</dd>
              <dt className="text-muted-foreground">Tax</dt><dd className="text-right tabular-nums">{formatMoney(o.taxTotal, cur)}</dd>
              <dt className="border-t pt-1 font-semibold">Order total</dt><dd className="border-t pt-1 text-right font-semibold tabular-nums">{formatMoney(o.total, cur)}</dd>
            </dl>
          </SectionCard>
          <SectionCard title="Delivery events">
            <Timeline
              empty="No delivery events yet."
              items={[...o.deliveryEvents].reverse().map((e) => ({
                id: e.id,
                title: DELIVERY_STATUS_META[e.status].label + (e.location ? ` · ${e.location}` : ""),
                meta: `${formatDateTime(e.occurredAt, tz)} · ${[e.carrier, e.trackingNumber].filter(Boolean).join(" ") || "no carrier details"} · recorded by ${e.recordedBy.name}`,
                body: e.note ?? undefined,
                tone: e.status === "DELIVERED" ? "success" : e.status === "EXCEPTION" ? "danger" : "default",
              }))}
            />
          </SectionCard>
          <SectionCard title="Status history">
            <Timeline
              items={[...o.statusHistory].reverse().map((h) => ({
                id: h.id,
                title: h.fromStatus ? `${ORDER_STATUS_META[h.fromStatus].label} → ${ORDER_STATUS_META[h.toStatus].label}` : `Created as ${ORDER_STATUS_META[h.toStatus].label}`,
                meta: `${h.changedBy.name} · ${formatDateTime(h.changedAt, tz)}`,
                body: h.note ?? undefined,
                tone: h.toStatus === "CANCELLED" ? "danger" : h.toStatus === "DELIVERED" ? "success" : "default",
              }))}
            />
          </SectionCard>
          <SectionCard title="Related tickets">
            {o.tickets.length === 0 ? <p className="text-sm text-muted-foreground">No tickets for this order.</p> : (
              <ul className="divide-y">
                {o.tickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <Link href={`/tickets/${t.id}`} className="font-medium text-primary hover:underline">{t.number} · {t.subject}</Link>
                    <EnumBadge value={t.status} meta={TICKET_STATUS_META} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Activity"><AuditTimeline entries={activity} timeZone={tz} /></SectionCard>
        </div>
        <div className="space-y-4">
          <SectionCard title="Order details">
            <DetailList
              columns={1}
              items={[
                { label: "Account", value: <Link href={`/accounts/${o.account.id}`} className="text-primary hover:underline">{o.account.name}</Link> },
                { label: "Related lead", value: o.lead ? <Link href={`/leads/${o.lead.id}`} className="text-primary hover:underline">{o.lead.number} · {o.lead.name}</Link> : null },
                { label: "Order owner", value: o.owner.name },
                { label: "Expected delivery", value: formatDate(o.expectedDeliveryDate) },
                { label: "Actual delivery", value: formatDate(o.actualDeliveryDate) },
                { label: "Carrier / tracking", value: [o.carrier, o.trackingNumber].filter(Boolean).join(" · ") },
                { label: "Billing address", value: o.billingAddress },
                { label: "Shipping address", value: o.shippingAddress },
                { label: "Notes", value: o.notes },
              ]}
            />
          </SectionCard>
          <Alert>
            <AlertDescription className="text-xs">
              Payment status is not tracked yet. A delivered order is <strong>not</strong> considered paid — invoicing and collections are on the roadmap.
            </AlertDescription>
          </Alert>
          <SectionCard title="Record details">
            <DetailList columns={1} items={[{ label: "Created", value: `${formatDateTime(o.createdAt, tz)} by ${o.createdBy.name}` }, { label: "Last modified", value: `${formatDateTime(o.updatedAt, tz)} by ${o.modifiedBy.name}` }]} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
