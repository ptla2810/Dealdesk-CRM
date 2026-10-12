import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { OrganizationForm, WorkflowForm } from "@/features/settings/settings-forms";

export const metadata: Metadata = { title: "Organization & workflows" };

export default async function OrganizationPage() {
  const ctx = await pageContext("settings.manage_config");
  const s = ctx.settings;
  return (
    <>
      <PageHeader title="Organization & workflows" breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Organization & workflows" }]} />
      <div className="max-w-5xl space-y-4">
        <SectionCard title="Organization"><OrganizationForm defaults={{ name: ctx.org.name, baseCurrency: ctx.org.baseCurrency, timezone: ctx.org.timezone }} /></SectionCard>
        <SectionCard title="Workflow & pricing rules" description="Changes apply immediately to new actions; existing records are not altered.">
          <WorkflowForm
            defaults={{
              ...s.leadWorkflow,
              ...s.pricing,
              requireResolutionNote: s.tickets.requireResolutionNote,
              orderTransitions: s.orderWorkflow.transitions as Record<string, string[]>,
            }}
          />
        </SectionCard>
      </div>
    </>
  );
}
