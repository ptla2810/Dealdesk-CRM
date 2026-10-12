import Link from "next/link";
import type { Metadata } from "next";
import { Lock, Pencil, Send } from "lucide-react";
import { pageContext } from "@/server/context";
import { getTicket } from "@/server/services/tickets";
import { listAssignableUsers } from "@/server/services/users";
import { orNotFound } from "@/server/page-helpers";
import { isEmailConfigured } from "@/server/mailer";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { DetailList } from "@/components/data/detail-list";
import { Timeline } from "@/components/data/timeline";
import { EnumBadge, StatusBadge } from "@/components/data/status-badge";
import { ActionButton } from "@/components/data/action-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageComposer, TicketControls } from "@/features/tickets/ticket-controls";
import { userOptions } from "@/features/leads/options";
import { ORDER_STATUS_META, TICKET_CATEGORY_LABEL, TICKET_PRIORITY_META, TICKET_STATUS_META } from "@/lib/constants";
import { allowedTicketTargets } from "@/lib/workflows";
import { formatDateTime } from "@/lib/dates";
import { formatPhone } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { archiveTicketAction } from "../actions";
import type { TicketPriority, TicketStatus } from "@prisma/client";

export const metadata: Metadata = { title: "Ticket" };

const DELIVERY_LABEL = { NOT_APPLICABLE: "", RECORDED_ONLY: "Recorded only — not sent (no email provider)", QUEUED: "Queued", SENT: "Emailed to customer", FAILED: "Email delivery failed" } as const;

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("ticket.view");
  const { id } = await params;
  const t = await orNotFound(getTicket(ctx, id));
  const users = await listAssignableUsers(ctx);
  const tz = ctx.org.timezone;
  const userName = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? (uid ? "Former user" : "Unassigned");
  const fmtValue = (field: string, v: string | null) =>
    field === "status" ? (v ? TICKET_STATUS_META[v as TicketStatus]?.label : "—") : field === "priority" ? (v ? TICKET_PRIORITY_META[v as TicketPriority]?.label : "—") : userName(v);
  const internal = t.messages.filter((m) => m.kind === "INTERNAL_NOTE");
  const replies = t.messages.filter((m) => m.kind === "CUSTOMER_REPLY");

  const messageList = (msgs: typeof t.messages) =>
    msgs.length === 0 ? (
      <p className="text-sm text-muted-foreground">No messages yet.</p>
    ) : (
      <ul className="space-y-3">
        {msgs.map((m) => (
          <li key={m.id} className={cn("rounded-lg border p-3", m.kind === "INTERNAL_NOTE" ? "border-amber-200 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5" : "bg-card")}>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {m.kind === "INTERNAL_NOTE" ? <Lock className="size-3.5" /> : <Send className="size-3.5" />}
              <span className="font-medium text-foreground">{m.author.name}</span>
              <span>{formatDateTime(m.createdAt, tz)}</span>
              {m.kind === "INTERNAL_NOTE" ? <StatusBadge tone="warning">Internal</StatusBadge> : <StatusBadge tone={m.delivery === "SENT" ? "success" : m.delivery === "FAILED" ? "danger" : "neutral"}>{DELIVERY_LABEL[m.delivery]}</StatusBadge>}
            </div>
            <p className="text-sm whitespace-pre-line">{m.body}</p>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <PageHeader
        title={t.subject}
        badge={<><EnumBadge value={t.status} meta={TICKET_STATUS_META} /><EnumBadge value={t.priority} meta={TICKET_PRIORITY_META} /></>}
        description={`${t.number} · ${TICKET_CATEGORY_LABEL[t.category]} · opened ${formatDateTime(t.createdAt, tz)} by ${t.createdBy.name}`}
        breadcrumbs={[{ label: "Support Tickets", href: "/tickets" }, { label: t.number }]}
        actions={
          <>
            {ctx.can("ticket.edit") && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/tickets/${t.id}/edit`}><Pencil className="size-4" /> Edit</Link>
              </Button>
            )}
            {ctx.can("ticket.delete") && (
              <ActionButton action={archiveTicketAction.bind(null, t.id)} redirectTo="/tickets" successMessage="Ticket archived" confirm={{ title: "Archive this ticket?", description: "It will be hidden from lists; its history is retained.", confirmLabel: "Archive", destructive: true }}>
                Archive
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Description">
            <p className="text-sm whitespace-pre-line">{t.description}</p>
            {t.resolutionNote && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <div className="mb-1 font-medium">Resolution{t.resolvedAt ? ` · ${formatDateTime(t.resolvedAt, tz)}` : ""}</div>
                <p className="whitespace-pre-line">{t.resolutionNote}</p>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Conversation">
            <div className="space-y-4">
              {ctx.can("ticket.edit") && <MessageComposer ticketId={t.id} canReplyCustomer={ctx.can("ticket.reply_customer")} emailConfigured={isEmailConfigured()} disabled={t.status === "CLOSED"} />}
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">All ({t.messages.length})</TabsTrigger>
                  <TabsTrigger value="internal">Internal notes ({internal.length})</TabsTrigger>
                  <TabsTrigger value="customer">Customer-visible ({replies.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="all">{messageList(t.messages)}</TabsContent>
                <TabsContent value="internal">{messageList(internal)}</TabsContent>
                <TabsContent value="customer">{messageList(replies)}</TabsContent>
              </Tabs>
            </div>
          </SectionCard>
          <SectionCard title="Change history">
            <Timeline
              items={t.events.map((e) => ({
                id: e.id,
                title: `${e.field === "assignedTo" ? "Assignment" : e.field === "status" ? "Status" : "Priority"}: ${fmtValue(e.field, e.fromValue)} → ${fmtValue(e.field, e.toValue)}`,
                meta: `${e.actor.name} · ${formatDateTime(e.createdAt, tz)}`,
              }))}
              empty="No changes yet."
            />
          </SectionCard>
        </div>
        <div className="space-y-4">
          <SectionCard title="Handling">
            <TicketControls
              id={t.id}
              version={t.version}
              priority={t.priority}
              assignedToId={t.assignedToId}
              statusTargets={allowedTicketTargets(t.status)}
              agents={userOptions(users)}
              canEdit={ctx.can("ticket.edit")}
              canAssign={ctx.can("ticket.assign")}
              requireResolutionNote={ctx.settings.tickets.requireResolutionNote}
            />
          </SectionCard>
          <SectionCard title="Customer & context">
            <DetailList
              columns={1}
              items={[
                { label: "Account", value: <Link href={`/accounts/${t.account.id}`} className="text-primary hover:underline">{t.account.name}</Link> },
                { label: "Contact", value: t.contact ? <span><Link href={`/contacts/${t.contact.id}`} className="text-primary hover:underline">{t.contact.firstName} {t.contact.lastName}</Link><span className="block text-xs text-muted-foreground">{[t.contact.email, formatPhone(t.contact.phone)].filter(Boolean).join(" · ")}</span></span> : null },
                { label: "Related order", value: t.order ? <span className="inline-flex items-center gap-2"><Link href={`/orders/${t.order.id}`} className="text-primary hover:underline">{t.order.number}</Link><EnumBadge value={t.order.status} meta={ORDER_STATUS_META} /></span> : null },
                { label: "Related lead", value: t.lead ? <Link href={`/leads/${t.lead.id}`} className="text-primary hover:underline">{t.lead.number} · {t.lead.name}</Link> : null },
                { label: "Last updated", value: formatDateTime(t.updatedAt, tz) },
                { label: "Resolved", value: t.resolvedAt ? formatDateTime(t.resolvedAt, tz) : null },
                { label: "Closed", value: t.closedAt ? formatDateTime(t.closedAt, tz) : null },
              ]}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
