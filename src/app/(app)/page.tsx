import Link from "next/link";
import type { Metadata } from "next";
import { AlertCircle, CalendarClock, CheckCircle2, CircleDollarSign, Filter, Percent, ShoppingCart, Target, TrendingUp, Users } from "lucide-react";
import { pageContext } from "@/server/context";
import { getDashboard, getRecentActivity } from "@/server/services/dashboard";
import { getFollowUps } from "@/server/services/meetings";
import { listAssignableUsers } from "@/server/services/users";
import { leadSourceOptions } from "@/server/services/leads";
import { PageHeader } from "@/components/data/page-header";
import { KpiCard } from "@/components/data/kpi-card";
import { SectionCard } from "@/components/data/section-card";
import { StatusBadge } from "@/components/data/status-badge";
import { PeriodFilter } from "@/components/charts/period-filter";
import {
  ConversionTrendChart,
  FunnelChart,
  LeadSourcesChart,
  LeadsByStageChart,
  OrderStatusChart,
  PipelineByStageChart,
  SalesTrendChart,
  SalespersonChart,
} from "@/components/charts/dashboard-charts";
import { readDashboardFilters } from "@/lib/period";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { formatDate, formatDateTime, formatRelative } from "@/lib/dates";
import { LEAD_STAGE_META, ORDER_STATUS_META } from "@/lib/constants";
import type { SearchParams } from "@/server/list";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await pageContext("dashboard.view");
  const sp = await searchParams;
  const filters = readDashboardFilters(sp, ctx.org.timezone);
  const canFilterPeople = ctx.dataScope === "ALL";
  const [d, followUps, activity, users, sources] = await Promise.all([
    getDashboard(ctx, filters),
    ctx.can("meeting.view") ? getFollowUps(ctx, { mine: true, days: 7 }) : null,
    getRecentActivity(ctx, 8),
    canFilterPeople ? listAssignableUsers(ctx) : [],
    leadSourceOptions(ctx, true),
  ]);
  const k = d.kpis;
  const cur = k.currency;
  const tz = ctx.org.timezone;

  const commitments = followUps
    ? [
        ...followUps.meetings.map((m) => ({ id: `m${m.id}`, when: m.scheduledAt, overdue: false, label: m.title, sub: `Meeting · ${formatDateTime(m.scheduledAt, tz)}`, href: `/meetings/${m.id}` })),
        ...followUps.actionItems.map((a) => ({ id: `a${a.id}`, when: a.dueDate, overdue: a.overdue, label: a.description, sub: `Action item · due ${formatDate(a.dueDate)}`, href: `/meetings/${a.meeting.id}` })),
        ...followUps.leads.map((l) => ({ id: `l${l.id}`, when: l.nextFollowUpAt, overdue: l.overdue, label: `Follow up: ${l.name} (${l.companyName})`, sub: `Lead follow-up · ${formatDate(l.nextFollowUpAt)}`, href: `/leads/${l.id}` })),
      ]
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.when?.getTime() ?? Infinity) - (b.when?.getTime() ?? Infinity))
        .slice(0, 10)
    : [];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${ctx.user.name.split(" ")[0]}`}
        description={
          <>
            Sales performance for <strong>{filters.range.label}</strong>
            {ctx.dataScope === "OWN" ? " — showing your own records" : ""}. Figures are live from the database.
          </>
        }
      />
      <PeriodFilter owners={canFilterPeople ? users.map((u) => ({ id: u.id, name: u.name })) : undefined} sources={sources.map((s) => ({ id: s.id, name: s.name }))} />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Total Leads" icon={Target} value={formatNumber(k.totalLeads)} hint="Created in period" definition="Number of leads created in the selected period." />
        <KpiCard label="Active Leads" icon={Users} value={formatNumber(k.activeLeads)} hint={`${formatNumber(k.openLeadsAll)} open overall`} definition="Leads created in the period that are not yet converted." />
        <KpiCard label="Qualified Leads" icon={Filter} value={formatNumber(k.qualifiedLeads)} hint="Currently in Qualified stage" definition="Leads created in the period currently in the “Qualified Lead” stage." />
        <KpiCard
          label="Lead Conversion Rate"
          icon={Percent}
          value={formatPercent(k.conversionRate)}
          hint={`${k.cohortConverted} of ${k.totalLeads} leads created`}
          definition="Leads created in the period that are now converted ÷ leads created in the period."
        />
        <KpiCard
          label="Sales Pipeline Value"
          icon={TrendingUp}
          value={formatMoney(k.pipelineValue, cur, { compact: true })}
          hint={`All open: ${formatMoney(k.pipelineValueAllOpen, cur, { compact: true })} · forecast, not revenue`}
          definition="Sum of estimated deal value of open (not converted) leads created in the period. This is a forecast, not revenue."
        />
        <KpiCard
          label="Total Sales Volume"
          icon={CircleDollarSign}
          value={formatMoney(k.salesVolume, cur, { compact: true })}
          hint={`${k.salesVolumeOrders} orders${k.otherCurrencyOrders ? ` · ${k.otherCurrencyOrders} in other currencies excluded` : ""}`}
          definition={`Total value (incl. tax) of ${cur} orders dated in the period with status Confirmed, Processing, Shipped or Delivered. Drafts and cancelled orders are excluded; each order counted once. Not the same as cash collected.`}
        />
        <KpiCard label="Converted Leads" icon={CheckCircle2} value={formatNumber(k.convertedLeads)} hint="Conversion date in period" definition="Leads whose conversion date falls in the selected period." />
        <KpiCard label="Orders in Progress" icon={ShoppingCart} value={formatNumber(k.ordersInProgress)} hint="Confirmed, processing or shipped" definition="Orders dated in the period whose status is Confirmed, Processing or Shipped." />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <FunnelChart data={d.funnel.map((f) => ({ label: LEAD_STAGE_META[f.stage].label, reached: f.reached }))} />
        <LeadsByStageChart data={d.byStage.map((s) => ({ label: LEAD_STAGE_META[s.stage].label, count: s.count, value: s.value }))} />
        <ConversionTrendChart data={d.conversionTrend.points} />
        <SalesTrendChart data={d.salesTrend.points} currency={cur} />
        <LeadSourcesChart data={d.sources} />
        <PipelineByStageChart data={d.byStage.map((s) => ({ label: LEAD_STAGE_META[s.stage].label, count: s.count, value: s.value }))} currency={cur} />
        <SalespersonChart data={d.performance} currency={cur} />
        <OrderStatusChart data={d.orderStatus.map((o) => ({ label: ORDER_STATUS_META[o.status].label, count: o.count, value: o.value }))} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {followUps && (
          <SectionCard
            title="My upcoming commitments"
            description="Meetings, action items and lead follow-ups for the next 7 days, overdue first"
            actions={
              <Link href="/meetings/follow-ups" className="text-sm text-primary hover:underline">
                View all
              </Link>
            }
          >
            {commitments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due in the next 7 days.</p>
            ) : (
              <ul className="divide-y">
                {commitments.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 py-2.5">
                    {c.overdue ? <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Overdue" /> : <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <Link href={c.href} className="line-clamp-1 text-sm font-medium hover:underline">
                        {c.label}
                      </Link>
                      <div className="text-xs text-muted-foreground">{c.sub}</div>
                    </div>
                    {c.overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}
        <SectionCard
          title="Recent activity"
          description={ctx.can("audit.view") ? "Latest changes across the organization" : "Your latest changes"}
          actions={
            ctx.can("audit.view") ? (
              <Link href="/settings/audit-log" className="text-sm text-primary hover:underline">
                Audit log
              </Link>
            ) : undefined
          }
        >
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y">
              {activity.map((a) => (
                <li key={a.id} className="py-2.5">
                  <div className="line-clamp-1 text-sm">{a.summary}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.actor?.name ?? "System"} · {formatRelative(a.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
