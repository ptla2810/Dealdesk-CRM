import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { leadSourceOptions } from "@/server/services/leads";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { PageHeader } from "@/components/data/page-header";
import { LeadForm } from "@/features/leads/lead-form";
import { accountOptionsOf, userOptions } from "@/features/leads/options";
import { toDateInput, todayUtc } from "@/lib/dates";

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage({ searchParams }: { searchParams: Promise<{ accountId?: string }> }) {
  const ctx = await pageContext("lead.create");
  const { accountId } = await searchParams;
  const [sources, users, accounts] = await Promise.all([leadSourceOptions(ctx), listAssignableUsers(ctx), accountOptions(ctx)]);
  const account = accounts.find((a) => a.id === accountId);
  const manual = sources.find((s) => s.name === "Manual Entry");
  return (
    <>
      <PageHeader title="New lead" breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "New" }]} />
      <div className="max-w-4xl">
        <LeadForm
          mode="create"
          defaults={{
            ownerId: ctx.userId,
            sourceId: manual?.id ?? "",
            accountId: account?.id ?? "",
            companyName: account?.name ?? "",
            nextFollowUpAt: toDateInput(new Date(todayUtc().getTime() + 3 * 86_400_000)),
          }}
          sources={sources.map((s) => ({ value: s.id, label: s.name }))}
          owners={userOptions(users)}
          accounts={accountOptionsOf(accounts)}
          canAssign={ctx.can("lead.assign")}
          currency={ctx.org.baseCurrency}
          cancelHref="/leads"
        />
      </div>
    </>
  );
}
