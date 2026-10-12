import Link from "next/link";
import type { Metadata } from "next";
import { CalendarPlus, LifeBuoy, Pencil, Plus, ShoppingCart, UserPlus } from "lucide-react";
import { pageContext } from "@/server/context";
import { getAccount } from "@/server/services/accounts";
import { entityActivity } from "@/server/services/settings";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { DetailList } from "@/components/data/detail-list";
import { AuditTimeline } from "@/components/data/audit-timeline";
import { EnumBadge, StatusBadge } from "@/components/data/status-badge";
import { ActionButton } from "@/components/data/action-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ACCOUNT_STATUS_META, CONTACT_STATUS_META, LEAD_STAGE_META, MEETING_STATUS_META, ORDER_STATUS_META, TICKET_STATUS_META, TICKET_PRIORITY_META } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";
import { formatDate, formatDateTime } from "@/lib/dates";
import { archiveAccountAction } from "../actions";

export const metadata: Metadata = { title: "Account" };

function RelatedList({ empty, children }: { empty: string; children: React.ReactNode[] }) {
  return children.length ? <ul className="divide-y">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>;
}

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("account.view");
  const { id } = await params;
  const a = await orNotFound(getAccount(ctx, id));
  const activity = await entityActivity(ctx, "Account", a.id);
  const tz = ctx.org.timezone;
  const address = [a.addressLine, a.city, a.state, a.postalCode, a.country].filter(Boolean).join(", ");
  const revenue = a.orders.filter((o) => ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"].includes(o.status) && o.currency === ctx.org.baseCurrency).reduce((s, o) => s + Number(o.total), 0);
  const row = "flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm";

  return (
    <>
      <PageHeader
        title={a.name}
        badge={<EnumBadge value={a.status} meta={ACCOUNT_STATUS_META} />}
        description={`${a.number}${a.industry ? ` · ${a.industry}` : ""}`}
        breadcrumbs={[{ label: "Accounts & Buyers", href: "/accounts" }, { label: a.number }]}
        actions={
          <>
            {ctx.can("account.edit") && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/accounts/${a.id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            )}
            {ctx.can("order.create") && (
              <Button size="sm" asChild>
                <Link href={`/orders/new?accountId=${a.id}`}>
                  <ShoppingCart className="size-4" /> New order
                </Link>
              </Button>
            )}
            {ctx.can("account.delete") && (
              <ActionButton
                action={archiveAccountAction.bind(null, a.id)}
                redirectTo="/accounts"
                successMessage="Account archived"
                confirm={{ title: "Archive this account?", description: "It will be hidden from lists. Linked leads, contacts, orders and tickets are kept unchanged.", confirmLabel: "Archive", destructive: true }}
              >
                Archive
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Company information">
            <DetailList
              items={[
                { label: "Business email", value: a.email ? <a className="text-primary hover:underline" href={`mailto:${a.email}`}>{a.email}</a> : null },
                { label: "Business phone", value: formatPhone(a.phone) },
                { label: "Website", value: a.website ? <a className="text-primary hover:underline" href={a.website} target="_blank" rel="noreferrer noopener">{a.website}</a> : null },
                { label: "Account owner", value: a.owner.name },
                { label: "Address", value: address, full: true },
                { label: "Description", value: a.description, full: true },
              ]}
            />
            {a.duplicateOverride && (
              <p className="mt-4 text-xs text-amber-700">This account was created after a duplicate warning was reviewed and overridden.</p>
            )}
          </SectionCard>
          <Tabs defaultValue="contacts">
            <TabsList className="flex-wrap">
              <TabsTrigger value="contacts">Contacts ({a.contacts.length})</TabsTrigger>
              <TabsTrigger value="leads">Leads ({a.leads.length})</TabsTrigger>
              <TabsTrigger value="meetings">Meetings ({a.meetings.length})</TabsTrigger>
              <TabsTrigger value="tickets">Tickets ({a.tickets.length})</TabsTrigger>
              <TabsTrigger value="orders">Orders ({a.orders.length})</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="contacts">
              <SectionCard
                title="Buyer contacts"
                actions={ctx.can("contact.create") ? <Button size="sm" variant="outline" asChild><Link href={`/contacts/new?accountId=${a.id}`}><UserPlus className="size-4" /> Add contact</Link></Button> : undefined}
              >
                <RelatedList empty="No contacts yet.">
                  {a.contacts.map((c) => (
                    <li key={c.id} className={row}>
                      <div className="min-w-0">
                        <Link href={`/contacts/${c.id}`} className="font-medium text-primary hover:underline">{c.firstName} {c.lastName}</Link>
                        <div className="text-xs text-muted-foreground">{[c.designation, c.email, formatPhone(c.phone)].filter(Boolean).join(" · ")}</div>
                      </div>
                      <EnumBadge value={c.status} meta={CONTACT_STATUS_META} />
                    </li>
                  ))}
                </RelatedList>
              </SectionCard>
            </TabsContent>
            <TabsContent value="leads">
              <SectionCard title="Leads" actions={ctx.can("lead.create") ? <Button size="sm" variant="outline" asChild><Link href={`/leads/new?accountId=${a.id}`}><Plus className="size-4" /> New lead</Link></Button> : undefined}>
                <RelatedList empty="No leads linked to this account.">
                  {a.leads.map((l) => (
                    <li key={l.id} className={row}>
                      <div>
                        <Link href={`/leads/${l.id}`} className="font-medium text-primary hover:underline">{l.number} · {l.name}</Link>
                        <div className="text-xs text-muted-foreground">{l.owner.name} · {formatMoney(l.estimatedValue, l.currency)}</div>
                      </div>
                      <EnumBadge value={l.stage} meta={LEAD_STAGE_META} />
                    </li>
                  ))}
                </RelatedList>
              </SectionCard>
            </TabsContent>
            <TabsContent value="meetings">
              <SectionCard title="Meetings" actions={ctx.can("meeting.create") ? <Button size="sm" variant="outline" asChild><Link href={`/meetings/new?accountId=${a.id}`}><CalendarPlus className="size-4" /> Schedule</Link></Button> : undefined}>
                <RelatedList empty="No meetings.">
                  {a.meetings.map((m) => (
                    <li key={m.id} className={row}>
                      <div>
                        <Link href={`/meetings/${m.id}`} className="font-medium text-primary hover:underline">{m.title}</Link>
                        <div className="text-xs text-muted-foreground">{formatDateTime(m.scheduledAt, tz)} · {m.assignedTo.name}</div>
                      </div>
                      <EnumBadge value={m.status} meta={MEETING_STATUS_META} />
                    </li>
                  ))}
                </RelatedList>
              </SectionCard>
            </TabsContent>
            <TabsContent value="tickets">
              <SectionCard title="Support tickets" actions={ctx.can("ticket.create") ? <Button size="sm" variant="outline" asChild><Link href={`/tickets/new?accountId=${a.id}`}><LifeBuoy className="size-4" /> New ticket</Link></Button> : undefined}>
                <RelatedList empty="No tickets.">
                  {a.tickets.map((t) => (
                    <li key={t.id} className={row}>
                      <div>
                        <Link href={`/tickets/${t.id}`} className="font-medium text-primary hover:underline">{t.number} · {t.subject}</Link>
                        <div className="text-xs text-muted-foreground">{t.assignedTo?.name ?? "Unassigned"} · {formatDate(t.createdAt)}</div>
                      </div>
                      <div className="flex gap-1.5">
                        <EnumBadge value={t.priority} meta={TICKET_PRIORITY_META} />
                        <EnumBadge value={t.status} meta={TICKET_STATUS_META} />
                      </div>
                    </li>
                  ))}
                </RelatedList>
              </SectionCard>
            </TabsContent>
            <TabsContent value="orders">
              <SectionCard title="Orders">
                <RelatedList empty="No orders yet.">
                  {a.orders.map((o) => (
                    <li key={o.id} className={row}>
                      <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link>
                      <span className="text-muted-foreground">{formatDate(o.orderDate)}</span>
                      <span className="tabular-nums">{formatMoney(o.total, o.currency)}</span>
                      <EnumBadge value={o.status} meta={ORDER_STATUS_META} />
                    </li>
                  ))}
                </RelatedList>
              </SectionCard>
            </TabsContent>
            <TabsContent value="activity">
              <SectionCard title="Activity">
                <AuditTimeline entries={activity} timeZone={tz} />
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>
        <div className="space-y-4">
          <SectionCard title="Summary">
            <DetailList
              columns={1}
              items={[
                { label: `Order value (${ctx.org.baseCurrency}, confirmed → delivered)`, value: formatMoney(revenue, ctx.org.baseCurrency) },
                { label: "Open leads", value: a.leads.filter((l) => l.stage !== "CONVERTED").length },
                { label: "Open tickets", value: a.tickets.filter((t) => !["RESOLVED", "CLOSED"].includes(t.status)).length },
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">Order value reflects order totals, not payments received.</p>
          </SectionCard>
          <SectionCard title="Record details">
            <DetailList
              columns={1}
              items={[
                { label: "Created", value: `${formatDateTime(a.createdAt, tz)} by ${a.createdBy.name}` },
                { label: "Last modified", value: `${formatDateTime(a.updatedAt, tz)} by ${a.modifiedBy.name}` },
              ]}
            />
            {a.status === "ON_HOLD" && <StatusBadge tone="warning" className="mt-3">On hold</StatusBadge>}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
