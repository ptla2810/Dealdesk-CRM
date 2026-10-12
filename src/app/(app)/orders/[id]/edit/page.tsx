import Link from "next/link";
import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { getOrder } from "@/server/services/orders";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { OrderForm } from "@/features/orders/order-form";
import { orderFormOptions } from "@/features/orders/options";
import { toDateInput } from "@/lib/dates";

export const metadata: Metadata = { title: "Edit order" };

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("order.edit");
  const { id } = await params;
  const o = await orNotFound(getOrder(ctx, id));
  const crumbs = [{ label: "Orders & Delivery", href: "/orders" }, { label: o.number, href: `/orders/${o.id}` }, { label: "Edit" }];
  if (o.status !== "DRAFT") {
    return (
      <>
        <PageHeader title={`Edit ${o.number}`} breadcrumbs={crumbs} />
        <p className="text-sm text-muted-foreground">
          Only draft orders can be edited — confirmed orders keep their agreed lines and prices. <Link href={`/orders/${o.id}`} className="text-primary hover:underline">Back to order</Link>
        </p>
      </>
    );
  }
  const opts = await orderFormOptions(ctx, o.lineItems.map((l) => l.productId));
  return (
    <>
      <PageHeader title={`Edit draft ${o.number}`} breadcrumbs={crumbs} />
      <OrderForm
        mode="edit"
        defaults={{
          id: o.id,
          version: o.version,
          accountId: o.accountId,
          leadId: o.leadId ?? "",
          ownerId: o.ownerId,
          orderDate: toDateInput(o.orderDate),
          expectedDeliveryDate: toDateInput(o.expectedDeliveryDate),
          billingAddress: o.billingAddress,
          shippingAddress: o.shippingAddress,
          currency: o.currency,
          notes: o.notes ?? "",
          lines: o.lineItems.map((l) => ({ productId: l.productId, quantity: Number(l.quantity).toString(), unitPrice: l.unitPrice.toFixed(2), discountPercent: Number(l.discountPercent).toString() })),
        }}
        {...opts}
        canChooseOwner={ctx.dataScope === "ALL"}
        canOverridePrice={ctx.can("order.override_price")}
        pricing={ctx.settings.pricing}
        cancelHref={`/orders/${o.id}`}
      />
    </>
  );
}
