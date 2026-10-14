import Link from "next/link";
import type { Metadata } from "next";
import { Pencil } from "lucide-react";
import { pageContext } from "@/server/context";
import { campaignEligibility, getContact } from "@/server/services/contacts";
import { entityActivity } from "@/server/services/settings";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { DetailList } from "@/components/data/detail-list";
import { AuditTimeline } from "@/components/data/audit-timeline";
import { EnumBadge, StatusBadge } from "@/components/data/status-badge";
import { ActionButton } from "@/components/data/action-button";
import { Button } from "@/components/ui/button";
import { CHANNEL_LABEL, CONTACT_STATUS_META, LEAD_STAGE_META, MEETING_STATUS_META, SUBSCRIPTION_META, TICKET_STATUS_META } from "@/lib/constants";
import { formatPhone } from "@/lib/normalize";
import { formatDateTime } from "@/lib/dates";
import { archiveContactAction } from "../actions";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("contact.view");
  const { id } = await params;
  const c = await orNotFound(getContact(ctx, id));
  const activity = await entityActivity(ctx, "Contact", c.id);
  const tz = ctx.org.timezone;
  const eligibility = campaignEligibility(c);
  const leads = c.leadLinks.filter((l) => !l.lead.deletedAt);
  const meetings = c.meetingLinks.filter((m) => !m.meeting.deletedAt);
  return (
    <>
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        badge={<EnumBadge value={c.status} meta={CONTACT_STATUS_META} />}
        description={[c.number, c.designation, c.account?.name].filter(Boolean).join(" · ")}
        breadcrumbs={[{ label: "Contacts", href: "/contacts" }, { label: c.number }]}
        actions={
          <>
            {ctx.can("contact.edit") && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/contacts/${c.id}/edit`}>
                  <Pencil className="size-4" /> Edit
                </Link>
              </Button>
            )}
            {ctx.can("contact.delete") && (
              <ActionButton
                action={archiveContactAction.bind(null, c.id)}
                redirectTo="/contacts"
                successMessage="Contact archived"
                confirm={{ title: "Archive this contact?", description: "The contact is hidden from lists; meetings and tickets keep their history.", confirmLabel: "Archive", destructive: true }}
              >
                Archive
              </ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Contact details">
            <DetailList
              items={[
                { label: "Email", value: c.email ? <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a> : null },
                { label: "Phone", value: formatPhone(c.phone) },
                { label: "Designation", value: c.designation },
                { label: "Department", value: c.department },
                { label: "Account", value: c.account ? <Link href={`/accounts/${c.account.id}`} className="text-primary hover:underline">{c.account.name}</Link> : null },
                { label: "Contact owner", value: c.owner.name },
                { label: "Preferred channel", value: CHANNEL_LABEL[c.preferredChannel] },
                { label: "Source", value: c.source },
                { label: "Notes", value: c.notes, full: true },
              ]}
            />
          </SectionCard>
          <SectionCard title="Related leads & meetings">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium">Leads</h3>
                {leads.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
                  <ul className="space-y-2">
                    {leads.map(({ lead }) => (
                      <li key={lead.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/leads/${lead.id}`} className="text-primary hover:underline">{lead.number} · {lead.name}</Link>
                        <EnumBadge value={lead.stage} meta={LEAD_STAGE_META} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Meetings</h3>
                {meetings.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
                  <ul className="space-y-2">
                    {meetings.map(({ meeting }) => (
                      <li key={meeting.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/meetings/${meeting.id}`} className="text-primary hover:underline">{meeting.title}</Link>
                        <EnumBadge value={meeting.status} meta={MEETING_STATUS_META} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="sm:col-span-2">
                <h3 className="mb-2 text-sm font-medium">Tickets</h3>
                {c.tickets.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
                  <ul className="space-y-2">
                    {c.tickets.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                        <Link href={`/tickets/${t.id}`} className="text-primary hover:underline">{t.number} · {t.subject}</Link>
                        <EnumBadge value={t.status} meta={TICKET_STATUS_META} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Activity">
            <AuditTimeline entries={activity} timeZone={tz} />
          </SectionCard>
        </div>
        <div className="space-y-4">
          <SectionCard title="Campaign readiness" description={`Email marketing is not sent from ${APP_NAME}; these fields prepare for a future integration.`}>
            <DetailList
              columns={1}
              items={[
                { label: "Campaign eligibility", value: <StatusBadge tone={eligibility.eligible ? "success" : "neutral"}>{eligibility.eligible ? "Eligible" : `Not eligible — ${eligibility.reason}`}</StatusBadge> },
                { label: "Marketing consent", value: c.marketingConsent ? "Given" : "Not given" },
                { label: "Consent timestamp", value: c.consentAt ? formatDateTime(c.consentAt, tz) : null },
                { label: "Consent source", value: c.consentSource },
                { label: "Subscription", value: <EnumBadge value={c.subscriptionStatus} meta={SUBSCRIPTION_META} /> },
                { label: "Unsubscribed at", value: c.unsubscribedAt ? formatDateTime(c.unsubscribedAt, tz) : null },
              ]}
            />
          </SectionCard>
          <SectionCard title="Record details">
            <DetailList
              columns={1}
              items={[
                { label: "Created", value: `${formatDateTime(c.createdAt, tz)} by ${c.createdBy.name}` },
                { label: "Last modified", value: `${formatDateTime(c.updatedAt, tz)} by ${c.modifiedBy.name}` },
              ]}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
