import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { StatusBadge } from "@/components/data/status-badge";
import { AddCategoryForm, AddLeadSourceForm, AddTaxRateForm, ToggleActive } from "@/features/settings/settings-forms";

export const metadata: Metadata = { title: "Lead sources & catalogue" };

export default async function ConfigurationPage() {
  const ctx = await pageContext("settings.manage_config");
  const [sources, categories, taxRates] = await Promise.all([
    prisma.leadSource.findMany({ where: { organizationId: ctx.orgId }, include: { _count: { select: { leads: true } } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.productCategory.findMany({ where: { organizationId: ctx.orgId }, include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }),
    prisma.taxRate.findMany({ where: { organizationId: ctx.orgId }, include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Lead sources & catalogue" breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Lead sources & catalogue" }]} />
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Lead sources" description="Deactivated sources stay on existing leads but can't be chosen for new ones.">
          <ul className="mb-4 divide-y">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{s.name} <span className="text-xs text-muted-foreground">({s._count.leads})</span> {s.isSystem && <StatusBadge>Default</StatusBadge>} {!s.isActive && <StatusBadge tone="warning">Inactive</StatusBadge>}</span>
                <ToggleActive id={s.id} isActive={s.isActive} kind="source" />
              </li>
            ))}
          </ul>
          <AddLeadSourceForm />
        </SectionCard>
        <SectionCard title="Product categories">
          <ul className="mb-4 divide-y">
            {categories.map((c) => <li key={c.id} className="py-2 text-sm">{c.name} <span className="text-xs text-muted-foreground">({c._count.products} products)</span></li>)}
          </ul>
          <AddCategoryForm />
        </SectionCard>
        <SectionCard title="Tax classifications" description="Applied per product. Existing order lines keep the rate they were priced with.">
          <ul className="mb-4 divide-y">
            {taxRates.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>{t.name} · {t.ratePercent.toString()}% <span className="text-xs text-muted-foreground">({t._count.products})</span> {!t.isActive && <StatusBadge tone="warning">Inactive</StatusBadge>}</span>
                <ToggleActive id={t.id} isActive={t.isActive} kind="tax" />
              </li>
            ))}
          </ul>
          <AddTaxRateForm />
        </SectionCard>
      </div>
    </>
  );
}
