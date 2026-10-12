import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { PageHeader } from "@/components/data/page-header";
import { TicketForm } from "@/features/tickets/ticket-form";
import { ticketFormOptions } from "@/features/tickets/options";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ accountId?: string; orderId?: string }> }) {
  const ctx = await pageContext("ticket.create");
  const sp = await searchParams;
  const opts = await ticketFormOptions(ctx);
  const order = opts.orders.find((o) => o.value === sp.orderId);
  const accountId = order?.accountId ?? (opts.accounts.some((a) => a.value === sp.accountId) ? sp.accountId! : "");
  return (
    <>
      <PageHeader title="New support ticket" breadcrumbs={[{ label: "Support Tickets", href: "/tickets" }, { label: "New" }]} />
      <div className="max-w-4xl">
        <TicketForm mode="create" defaults={{ accountId, orderId: order?.value ?? "", category: order ? "ORDER_ISSUE" : "GENERAL_INQUIRY" }} {...opts} canAssign={ctx.can("ticket.assign")} cancelHref="/tickets" />
      </div>
    </>
  );
}
