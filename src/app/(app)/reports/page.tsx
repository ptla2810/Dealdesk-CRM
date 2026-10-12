import type { Metadata } from "next";
import { Download } from "lucide-react";
import { pageContext } from "@/server/context";
import { getGroupedLeadReport, getKpis, getLeadSources, getSalespersonPerformance, type GroupBy } from "@/server/services/dashboard";
import { listAssignableUsers } from "@/server/services/users";
import { leadSourceOptions } from "@/server/services/leads";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { KpiCard } from "@/components/data/kpi-card";
import { PeriodFilter } from "@/components/charts/period-filter";
import { Button } from "@/components/ui/button";
import { readDashboardFilters } from "@/lib/period";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { LEAD_STAGE_META } from "@/lib/constants";
import { withParams } from "@/components/data/url";
import type { SearchParams } from "@/server/list";
import type { LeadStage } from "@prisma/client";

export const metadata: Metadata = { title: "Reports" };

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "owner", label: "Salesperson" },
  { value: "source", label: "Lead source" },
  { value: "account", label: "Account" },
  { value: "stage", label: "Lead stage" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("report.view");
  const sp = await searchParams;
  const f = readDashboardFilters(sp, ctx.org.timezone);
  const groupRaw = Array.isArray(sp.groupBy) ? sp.groupBy[0] : sp.groupBy;
  const groupBy = (GROUPS.some((g) => g.value === groupRaw) ? groupRaw : "owner") as GroupBy;
  const [rows, perf, sources, kpis, users, sourceOpts] = await Promise.all([
    getGroupedLeadReport(ctx, f, groupBy),
    getSalespersonPerformance(ctx, f),
    getLeadSources(ctx, f),
    getKpis(ctx, f),
    ctx.dataScope === "ALL" ? listAssignableUsers(ctx) : [],
    leadSourceOptions(ctx, true),
  ]);
  const cur = ctx.org.baseCurrency;
  const totals = rows.reduce((t, r) => ({ leads: t.leads + r.leads, open: t.open + r.open, converted: t.converted + r.converted, pipeline: t.pipeline + r.pipeline, won: t.won + r.won }), { leads: 0, open: 0, converted: 0, pipeline: 0, won: 0 });
  const th = "py-2 pr-3 font-medium";
  const td = "py-2 pr-3 text-right tabular-nums";

  return (
    <>
      <PageHeader
        title="Reports"
        description={`Sales team performance for ${f.range.label}. Leads are grouped by creation date; sales volume by order date.`}
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Reports" }]}
        actions={
          ctx.can("report.export") ? (
            <Button size="sm" variant="outline" asChild>
              <a href={withParams("/api/export/report", sp, { groupBy })}><Download className="size-4" /> Export CSV</a>
            </Button>
          ) : undefined
        }
      />
      <PeriodFilter owners={users.map((u) => ({ id: u.id, name: u.name }))} sources={sourceOpts.map((s) => ({ id: s.id, name: s.name }))} extra={{ key: "groupBy", label: "Group by", options: GROUPS, defaultValue: "owner" }} />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Leads created" value={formatNumber(kpis.totalLeads)} />
        <KpiCard label="Conversion rate" value={formatPercent(kpis.conversionRate)} hint="Converted ÷ created in period" />
        <KpiCard label="Open pipeline" value={formatMoney(kpis.pipelineValue, cur, { compact: true })} hint="Forecast, not revenue" />
        <KpiCard label="Sales volume" value={formatMoney(kpis.salesVolume, cur, { compact: true })} hint={`${kpis.salesVolumeOrders} orders (${cur})`} />
      </div>

      <div className="space-y-4">
        <SectionCard title={`Leads by ${GROUPS.find((g) => g.value === groupBy)!.label.toLowerCase()}`}>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">No leads in this period.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className={th}>{GROUPS.find((g) => g.value === groupBy)!.label}</th>
                    <th className={`${th} text-right`}>Leads</th>
                    <th className={`${th} text-right`}>Open</th>
                    <th className={`${th} text-right`}>Converted</th>
                    <th className={`${th} text-right`}>Conversion</th>
                    <th className={`${th} text-right`}>Open pipeline</th>
                    <th className={`${th} text-right`}>Converted est. value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-b last:border-0">
                      <td className="py-2 pr-3">{groupBy === "stage" ? LEAD_STAGE_META[r.key as LeadStage]?.label ?? r.key : r.key}</td>
                      <td className={td}>{r.leads}</td>
                      <td className={td}>{r.open}</td>
                      <td className={td}>{r.converted}</td>
                      <td className={td}>{formatPercent(r.conversionRate)}</td>
                      <td className={td}>{formatMoney(r.pipeline, cur)}</td>
                      <td className={td}>{formatMoney(r.won, cur)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="py-2 pr-3">Total</td>
                    <td className={td}>{totals.leads}</td>
                    <td className={td}>{totals.open}</td>
                    <td className={td}>{totals.converted}</td>
                    <td className={td}>{formatPercent(totals.leads ? (totals.converted / totals.leads) * 100 : null)}</td>
                    <td className={td}>{formatMoney(totals.pipeline, cur)}</td>
                    <td className={td}>{formatMoney(totals.won, cur)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Salesperson performance" description="Converted = conversion date in period; sales volume = confirmed→delivered orders dated in period">
            {perf.length === 0 ? <p className="text-sm text-muted-foreground">No activity in this period.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground"><th className={th}>Salesperson</th><th className={`${th} text-right`}>Leads</th><th className={`${th} text-right`}>Converted</th><th className={`${th} text-right`}>Orders</th><th className={`${th} text-right`}>Sales volume</th></tr></thead>
                  <tbody>
                    {perf.map((p) => (
                      <tr key={p.id} className="border-b last:border-0"><td className="py-2 pr-3">{p.name}</td><td className={td}>{p.leads}</td><td className={td}>{p.converted}</td><td className={td}>{p.orders}</td><td className={td}>{formatMoney(p.volume, cur)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Lead source effectiveness">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-muted-foreground"><th className={th}>Source</th><th className={`${th} text-right`}>Leads</th><th className={`${th} text-right`}>Converted</th><th className={`${th} text-right`}>Conversion</th><th className={`${th} text-right`}>Est. value</th></tr></thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.id} className="border-b last:border-0"><td className="py-2 pr-3">{s.name}</td><td className={td}>{s.total}</td><td className={td}>{s.converted}</td><td className={td}>{formatPercent(s.conversionRate)}</td><td className={td}>{formatMoney(s.value, cur)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
        {kpis.otherCurrencyOrders > 0 && (
          <p className="text-xs text-muted-foreground">{kpis.otherCurrencyOrders} order(s) in currencies other than {cur} are excluded from sales-volume totals (no exchange rates are configured).</p>
        )}
      </div>
    </>
  );
}
