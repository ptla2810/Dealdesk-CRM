import Link from "next/link";
import type { Metadata } from "next";
import { Download, Plus, Users } from "lucide-react";
import { pageContext } from "@/server/context";
import { campaignEligibility, listContacts } from "@/server/services/contacts";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { PageHeader } from "@/components/data/page-header";
import { DataTable, type Column } from "@/components/data/data-table";
import { FilterBar } from "@/components/data/filter-bar";
import { EmptyState } from "@/components/data/empty-state";
import { EnumBadge, StatusBadge } from "@/components/data/status-badge";
import { Button } from "@/components/ui/button";
import { CHANNEL_LABEL, CONTACT_STATUSES, CONTACT_STATUS_META, SUBSCRIPTION_META, SUBSCRIPTION_STATUSES } from "@/lib/constants";
import { formatPhone } from "@/lib/normalize";
import { formatTimestampDate } from "@/lib/dates";
import { withParams } from "@/components/data/url";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("contact.view");
  const sp = await searchParams;
  const [data, users, accounts] = await Promise.all([listContacts(ctx, sp), listAssignableUsers(ctx), accountOptions(ctx)]);
  type Row = (typeof data.rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "Contact ID", sortKey: "number", cell: (c) => c.number },
    { key: "name", header: "Name", sortKey: "firstName", cell: (c) => <span className="font-medium">{c.firstName} {c.lastName}</span> },
    { key: "email", header: "Email", sortKey: "email", cell: (c) => c.email },
    { key: "phone", header: "Phone", cell: (c) => formatPhone(c.phone) || "—" },
    { key: "designation", header: "Designation", sortKey: "designation", cell: (c) => c.designation ?? "—" },
    { key: "account", header: "Account", cell: (c) => (c.account ? <Link href={`/accounts/${c.account.id}`} className="hover:underline">{c.account.name}</Link> : "—") },
    { key: "owner", header: "Owner", cell: (c) => c.owner.name },
    { key: "channel", header: "Preferred channel", cell: (c) => CHANNEL_LABEL[c.preferredChannel] },
    { key: "status", header: "Status", sortKey: "status", cell: (c) => <EnumBadge value={c.status} meta={CONTACT_STATUS_META} /> },
    { key: "subscription", header: "Subscription", cell: (c) => <EnumBadge value={c.subscriptionStatus} meta={SUBSCRIPTION_META} /> },
    {
      key: "eligible",
      header: "Campaign eligible",
      cell: (c) => {
        const e = campaignEligibility(c);
        return <StatusBadge tone={e.eligible ? "success" : "neutral"}>{e.eligible ? "Eligible" : e.reason}</StatusBadge>;
      },
    },
    { key: "created", header: "Created", sortKey: "createdAt", cell: (c) => formatTimestampDate(c.createdAt, ctx.org.timezone) },
  ];
  return (
    <>
      <PageHeader
        title="Contacts"
        description="Buyer contacts across all accounts, with consent tracking for future campaigns."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Contacts" }]}
        actions={
          <>
            {ctx.can("contact.export") && (
              <Button variant="outline" size="sm" asChild>
                <a href={withParams("/api/export/contacts", sp, { page: undefined, pageSize: undefined })}>
                  <Download className="size-4" /> Export CSV
                </a>
              </Button>
            )}
            {ctx.can("contact.create") && (
              <Button size="sm" asChild>
                <Link href="/contacts/new">
                  <Plus className="size-4" /> New contact
                </Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar
        searchPlaceholder="Search name, email, designation, account…"
        filters={[
          { key: "status", label: "Statuses", type: "select", options: CONTACT_STATUSES.map((s) => ({ value: s, label: CONTACT_STATUS_META[s].label })) },
          { key: "subscription", label: "Subscriptions", type: "select", options: SUBSCRIPTION_STATUSES.map((s) => ({ value: s, label: SUBSCRIPTION_META[s].label })) },
          { key: "account", label: "Accounts", type: "select", options: accounts.map((a) => ({ value: a.id, label: a.name })) },
          ...(ctx.dataScope === "ALL" ? [{ key: "owner", label: "Owners", type: "select" as const, options: users.map((u) => ({ value: u.id, label: u.name })) }] : []),
          { key: "eligible", label: "Campaign eligible only", type: "checkbox" },
        ]}
      />
      <DataTable caption="Contacts" columns={columns} data={data} basePath="/contacts" searchParams={sp} rowHref={(c) => `/contacts/${c.id}`} empty={<EmptyState icon={Users} title="No contacts found" description="Adjust the filters or add a contact." />} />
    </>
  );
}
