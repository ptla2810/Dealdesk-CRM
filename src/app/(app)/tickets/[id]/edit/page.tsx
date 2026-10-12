import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { getTicket } from "@/server/services/tickets";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { TicketForm } from "@/features/tickets/ticket-form";
import { ticketFormOptions } from "@/features/tickets/options";

export const metadata: Metadata = { title: "Edit ticket" };

export default async function EditTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("ticket.edit");
  const { id } = await params;
  const [t, opts] = await Promise.all([orNotFound(getTicket(ctx, id)), ticketFormOptions(ctx)]);
  return (
    <>
      <PageHeader title={`Edit ${t.number}`} breadcrumbs={[{ label: "Support Tickets", href: "/tickets" }, { label: t.number, href: `/tickets/${t.id}` }, { label: "Edit" }]} />
      <div className="max-w-4xl">
        <TicketForm
          mode="edit"
          defaults={{ id: t.id, version: t.version, subject: t.subject, description: t.description, accountId: t.accountId, contactId: t.contactId ?? "", leadId: t.leadId ?? "", orderId: t.orderId ?? "", category: t.category, priority: t.priority }}
          {...opts}
          canAssign={false}
          cancelHref={`/tickets/${t.id}`}
        />
      </div>
    </>
  );
}
