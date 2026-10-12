import Link from "next/link";
import type { Metadata } from "next";
import { Building2, CalendarPlus, Pencil, ShoppingCart } from "lucide-react";
import { pageContext } from "@/server/context";
import { getLead } from "@/server/services/leads";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { contactOptions } from "@/server/services/contacts";
import { entityActivity } from "@/server/services/settings";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { DetailList } from "@/components/data/detail-list";
import { Timeline } from "@/components/data/timeline";
import { AuditTimeline } from "@/components/data/audit-timeline";
import { EnumBadge, StatusBadge } from "@/components/data/status-badge";
import { ActionButton } from "@/components/data/action-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignDialog, ConvertDialog, DiscussionDialog, StageChangeDialog } from "@/features/leads/lead-dialogs";
import { accountOptionsOf, userOptions } from "@/features/leads/options";
import { LEAD_STAGES, LEAD_STAGE_META, MEETING_STATUS_META, ORDER_STATUS_META, TICKET_STATUS_META } from "@/lib/constants";
import { allowedLeadStageTargets, checkLeadConversion } from "@/lib/workflows";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/normalize";
import { formatDate, formatDateTime, toDateInput, todayUtc } from "@/lib/dates";
import { archiveLeadAction } from "../actions";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("lead.view");
  const { id } = await params;
  const lead = await orNotFound(getLead(ctx, id));
  const [users, accounts, contacts, activity] = await Promise.all([
    listAssignableUsers(ctx),
    ctx.can("lead.convert") ? accountOptions(ctx) : [],
    ctx.can("lead.convert") ? contactOptions(ctx) : [],
    entityActivity(ctx, "Lead", lead.id),
  ]);
  const tz = ctx.org.timezone;
  const wf = ctx.settings.leadWorkflow;
  const stageTargets = ctx.can("lead.change_stage") ? allowedLeadStageTargets(lead.stage, wf) : [];
  const canConvert = ctx.can("lead.convert") && checkLeadConversion(lead.stage, wf).ok;
  const converted = lead.stage === "CONVERTED";
  const overdue = !converted && lead.nextFollowUpAt && lead.nextFollowUpAt < todayUtc();
  const stageIdx = LEAD_STAGES.indexOf(lead.stage);
  const today = toDateInput(todayUtc());
  const users_ = userOptions(users);

  return (
    <>
      <PageHeader
        title={lead.name}
        badge={<EnumBadge value={lead.stage} meta={LEAD_STAGE_META} />}
        description={`${lead.number} · ${lead.companyName}`}
        breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: lead.number }]}
        actions={
          <>
            {ctx.can("lead.edit") && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/leads/${lead.id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            )}
            {ctx.can("lead.assign") && <AssignDialog leadId={lead.id} version={lead.version} ownerId={lead.ownerId} users={users_} />}
            <StageChangeDialog leadId={lead.id} version={lead.version} current={lead.stage} targets={stageTargets} />
            {lead.stage === "IN_DISCUSSION" && ctx.can("lead.edit") && <DiscussionDialog leadId={lead.id} users={users_} defaultResponsible={lead.ownerId} today={today} />}
            {canConvert && (
              <ConvertDialog
                lead={{ id: lead.id, version: lead.version, companyName: lead.companyName, email: lead.email, phone: lead.phone, ownerId: lead.ownerId, accountId: lead.accountId }}
                accounts={accountOptionsOf(accounts)}
                contacts={contacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}`, hint: c.email ?? undefined, accountId: c.accountId }))}
                owners={users_}
                canCreateAccount={ctx.can("account.create")}
              />
            )}
            {ctx.can("lead.delete") && (
              <ActionButton
                action={archiveLeadAction.bind(null, lead.id)}
                redirectTo="/leads"
                successMessage="Lead archived"
                confirm={{ title: "Archive this lead?", description: "The lead is hidden from lists and reports. Its history is kept in the audit log.", confirmLabel: "Archive", destructive: true }}
              >
                Archive
              </ActionButton>
            )}
          </>
        }
      />

      {/* Stage progress */}
      <ol className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Lead stage progress">
        {LEAD_STAGES.map((s, i) => (
          <li
            key={s}
            aria-current={s === lead.stage ? "step" : undefined}
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              i < stageIdx && "border-primary/30 bg-primary/5 text-primary",
              i === stageIdx && "border-primary bg-primary text-primary-foreground",
              i > stageIdx && "text-muted-foreground",
            )}
          >
            <span className="text-xs opacity-80">Step {i + 1}</span>
            <div className="font-medium">{LEAD_STAGE_META[s].label}</div>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Lead information">
            <DetailList
              items={[
                { label: "Email", value: <a href={`mailto:${lead.email}`} className="text-primary hover:underline">{lead.email}</a> },
                { label: "Phone", value: <a href={`tel:${lead.phone}`} className="hover:underline">{formatPhone(lead.phone)}</a> },
                { label: "Company", value: lead.companyName },
                { label: "Account", value: lead.account ? <Link href={`/accounts/${lead.account.id}`} className="text-primary hover:underline">{lead.account.number} · {lead.account.name}</Link> : null },
                { label: "Lead source", value: lead.source.name },
                { label: "Lead owner", value: lead.owner.name },
                { label: "Estimated deal value", value: formatMoney(lead.estimatedValue, lead.currency) },
                {
                  label: "Next follow-up",
                  value: lead.nextFollowUpAt ? (
                    <span className={overdue ? "font-medium text-destructive" : undefined}>
                      {formatDate(lead.nextFollowUpAt)} {overdue && "(overdue)"}
                    </span>
                  ) : null,
                },
                { label: "Description and sales insights", value: lead.description, full: true },
              ]}
            />
          </SectionCard>

          <Tabs defaultValue="discussions">
            <TabsList className="flex-wrap">
              <TabsTrigger value="discussions">Discussions ({lead.discussions.length})</TabsTrigger>
              <TabsTrigger value="meetings">Meetings ({lead.meetings.length})</TabsTrigger>
              <TabsTrigger value="orders">Orders ({lead.orders.length})</TabsTrigger>
              <TabsTrigger value="tickets">Tickets ({lead.tickets.length})</TabsTrigger>
              <TabsTrigger value="stages">Stage history</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="discussions">
              <SectionCard title="Discussion updates" description="Chronological record of conversations with the buyer">
                <Timeline
                  empty={lead.stage === "IN_DISCUSSION" ? "No discussion updates yet. Add the first one above." : "Discussion updates can be added while the lead is “In Discussion”."}
                  items={lead.discussions.map((d) => ({
                    id: d.id,
                    title: `${formatDate(d.discussedAt)} — ${d.summary}`,
                    meta: `Responsible: ${d.responsible.name} · logged by ${d.createdBy.name}${d.meeting ? ` · from meeting ${d.meeting.number}` : ""}`,
                    body: (
                      <dl className="grid gap-1 text-xs sm:grid-cols-2">
                        {d.requirements && (<div><dt className="font-medium text-foreground">Requirements</dt><dd>{d.requirements}</dd></div>)}
                        {d.objections && (<div><dt className="font-medium text-foreground">Objections</dt><dd>{d.objections}</dd></div>)}
                        {d.nextSteps && (<div><dt className="font-medium text-foreground">Next steps</dt><dd>{d.nextSteps}</dd></div>)}
                        {d.nextFollowUpAt && (<div><dt className="font-medium text-foreground">Next follow-up</dt><dd>{formatDate(d.nextFollowUpAt)}</dd></div>)}
                      </dl>
                    ),
                  }))}
                />
              </SectionCard>
            </TabsContent>
            <TabsContent value="meetings">
              <SectionCard
                title="Meeting history"
                actions={
                  ctx.can("meeting.create") ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/meetings/new?leadId=${lead.id}`}>
                        <CalendarPlus className="size-4" /> Schedule meeting
                      </Link>
                    </Button>
                  ) : undefined
                }
              >
                {lead.meetings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No meetings yet.</p>
                ) : (
                  <ul className="divide-y">
                    {lead.meetings.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <Link href={`/meetings/${m.id}`} className="font-medium text-primary hover:underline">{m.title}</Link>
                          <div className="text-xs text-muted-foreground">{m.number} · {formatDateTime(m.scheduledAt, tz)} · {m.assignedTo.name}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <EnumBadge value={m.status} meta={MEETING_STATUS_META} />
                          {!converted && ctx.can("lead.edit") && (
                            <DiscussionDialog
                              leadId={lead.id}
                              meetingId={m.id}
                              users={users_}
                              defaultResponsible={lead.ownerId}
                              today={today}
                              trigger={<Button size="xs" variant="outline">Add progress update</Button>}
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </TabsContent>
            <TabsContent value="orders">
              <SectionCard
                title="Orders"
                actions={
                  converted && lead.accountId && ctx.can("order.create") ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/orders/new?accountId=${lead.accountId}&leadId=${lead.id}`}>
                        <ShoppingCart className="size-4" /> New order
                      </Link>
                    </Button>
                  ) : undefined
                }
              >
                {lead.orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{converted ? "No orders yet." : "Orders can be created once the lead is converted."}</p>
                ) : (
                  <ul className="divide-y">
                    {lead.orders.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                        <Link href={`/orders/${o.id}`} className="font-medium text-primary hover:underline">{o.number}</Link>
                        <span className="text-muted-foreground">{formatDate(o.orderDate)}</span>
                        <span className="tabular-nums">{formatMoney(o.total, o.currency)}</span>
                        <EnumBadge value={o.status} meta={ORDER_STATUS_META} />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </TabsContent>
            <TabsContent value="tickets">
              <SectionCard title="Support tickets">
                {lead.tickets.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tickets.</p>
                ) : (
                  <ul className="divide-y">
                    {lead.tickets.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                        <Link href={`/tickets/${t.id}`} className="font-medium text-primary hover:underline">{t.number} · {t.subject}</Link>
                        <EnumBadge value={t.status} meta={TICKET_STATUS_META} />
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </TabsContent>
            <TabsContent value="stages">
              <SectionCard title="Stage history">
                <Timeline
                  items={lead.stageHistory.map((h) => ({
                    id: h.id,
                    title: h.fromStage ? `${LEAD_STAGE_META[h.fromStage].label} → ${LEAD_STAGE_META[h.toStage].label}` : `Created as ${LEAD_STAGE_META[h.toStage].label}`,
                    meta: `${h.changedBy.name} · ${formatDateTime(h.changedAt, tz)}`,
                    body: h.note ?? undefined,
                    tone: h.toStage === "CONVERTED" ? "success" : "default",
                  }))}
                />
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
          {converted && (
            <SectionCard title="Conversion" description="This lead has been converted into a buyer">
              <DetailList
                columns={1}
                items={[
                  { label: "Converted on", value: lead.convertedAt ? formatDateTime(lead.convertedAt, tz) : null },
                  { label: "Converted by", value: lead.convertedBy?.name },
                  {
                    label: "Account",
                    value: lead.account ? (
                      <Link href={`/accounts/${lead.account.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                        <Building2 className="size-3.5" /> {lead.account.name}
                      </Link>
                    ) : null,
                  },
                ]}
              />
            </SectionCard>
          )}
          <SectionCard title="Buyer contacts">
            {lead.contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contacts linked{converted ? "." : " yet — they are associated on conversion."}</p>
            ) : (
              <ul className="space-y-2">
                {lead.contacts.map(({ contact, isPrimary }) => (
                  <li key={contact.id} className="text-sm">
                    <Link href={`/contacts/${contact.id}`} className="font-medium text-primary hover:underline">
                      {contact.firstName} {contact.lastName}
                    </Link>
                    {isPrimary && <StatusBadge tone="info" className="ml-2">Primary</StatusBadge>}
                    <div className="text-xs text-muted-foreground">{[contact.designation, contact.email].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Record details">
            <DetailList
              columns={1}
              items={[
                { label: "Created", value: `${formatDateTime(lead.createdAt, tz)} by ${lead.createdBy.name}` },
                { label: "Last modified", value: `${formatDateTime(lead.updatedAt, tz)} by ${lead.modifiedBy.name}` },
              ]}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
