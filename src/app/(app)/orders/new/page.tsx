import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { PageHeader } from "@/components/data/page-header";
import { OrderForm } from "@/features/orders/order-form";
import { orderFormOptions } from "@/features/orders/options";
import { toDateInput, todayUtc } from "@/lib/dates";

export const metadata: Metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ accountId?: string; leadId?: string }> }) {
  const ctx = await pageContext("order.create");
  const sp = await searchParams;
  const opts = await orderFormOptions(ctx);
  const account = opts.accounts.find((a) => a.value === sp.accountId);
  const lead = opts.leads.find((l) => l.value === sp.leadId && l.accountId === account?.value);
  return (
    <>
      <PageHeader title="New order" description="Orders are created as drafts. Confirm the order once the customer has agreed." breadcrumbs={[{ label: "Orders & Delivery", href: "/orders" }, { label: "New" }]} />
      <OrderForm
        mode="create"
        defaults={{
          accountId: account?.value ?? "",
          leadId: lead?.value ?? "",
          billingAddress: account?.address ?? "",
          shippingAddress: account?.address ?? "",
          ownerId: ctx.userId,
          orderDate: toDateInput(todayUtc()),
          currency: ctx.org.baseCurrency,
        }}
        {...opts}
        canChooseOwner={ctx.dataScope === "ALL"}
        canOverridePrice={ctx.can("order.override_price")}
        pricing={ctx.settings.pricing}
        cancelHref={account ? `/accounts/${account.value}` : "/orders"}
      />
    </>
  );
}
