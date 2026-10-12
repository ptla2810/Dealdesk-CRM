import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { getLead, leadSourceOptions } from "@/server/services/leads";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { LeadForm } from "@/features/leads/lead-form";
import { accountOptionsOf, userOptions } from "@/features/leads/options";
import { toDateInput } from "@/lib/dates";

export const metadata: Metadata = { title: "Edit lead" };

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("lead.edit");
  const { id } = await params;
  const lead = await orNotFound(getLead(ctx, id));
  const [sources, users, accounts] = await Promise.all([leadSourceOptions(ctx, true), listAssignableUsers(ctx), accountOptions(ctx)]);
  return (
    <>
      <PageHeader title={`Edit ${lead.name}`} breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: lead.number, href: `/leads/${lead.id}` }, { label: "Edit" }]} />
      <div className="max-w-4xl">
        <LeadForm
          mode="edit"
          defaults={{
            id: lead.id,
            version: lead.version,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            companyName: lead.companyName,
            accountId: lead.accountId ?? "",
            sourceId: lead.sourceId,
            ownerId: lead.ownerId,
            estimatedValue: lead.estimatedValue.toFixed(2),
            description: lead.description ?? "",
            nextFollowUpAt: toDateInput(lead.nextFollowUpAt),
          }}
          sources={sources.map((s) => ({ value: s.id, label: s.isActive ? s.name : `${s.name} (inactive)` }))}
          owners={userOptions(users)}
          accounts={accountOptionsOf(accounts)}
          canAssign={ctx.can("lead.assign")}
          currency={lead.currency}
          cancelHref={`/leads/${lead.id}`}
        />
      </div>
    </>
  );
}
