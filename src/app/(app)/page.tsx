import Link from "next/link";
import type { Metadata } from "next";
import { AlertCircle, CalendarClock, CheckCircle2, CircleDollarSign, Filter, Percent, ShoppingCart, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import { canFilterByOwner, pageContext, visibleUsers } from "@/server/context";
import { getDashboard, getRecentActivity } from "@/server/services/dashboard";
import { getFollowUps } from "@/server/services/meetings";
import { listAssignableUsers } from "@/server/services/users";
import { leadSourceOptions } from "@/server/services/leads";
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
  const canFilterPeople = canFilterByOwner(ctx);
  const [d, followUps, activity, users, sources] = await Promise.all([
    getDashboard(ctx, filters),
    ctx.can("meeting.view") ? getFollowUps(ctx, { mine: true, days: 7 }) : null,
    getRecentActivity(ctx, 8),
    canFilterPeople ? listAssignableUsers(ctx).then((u) => visibleUsers(ctx, u)) : [],
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
      <section aria-labelledby="dashboard-title" className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-from to-brand-to px-5 py-6 text-white shadow-lg sm:px-8 sm:py-7">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-sky-300/15 blur-3xl" />
        <div className="relative">
          <div className="min-w-0 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-white/75 uppercase">
              <Sparkles className="size-3.5" aria-hidden /> {ctx.org.name}
            </p>
            <h1 id="dashboard-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome back, {ctx.user.name.split(" ")[0]}
            </h1>
            <p className="max-w-xl text-sm text-white/80">
              Sales performance for <strong className="text-white">{filters.range.label}</strong>
              {ctx.dataScope === "OWN" ? (ctx.teamUserIds.length > 1 ? " — showing you and your team" : " — showing your own records") : ""}. Figures are live from the database.
            </p>
          </div>
        </div>
      </section>

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

      <DashboardSection title="Leads & conversion" description="How leads move through the pipeline and where they come from">
        <FunnelChart data={d.funnel.map((f) => ({ label: LEAD_STAGE_META[f.stage].label, reached: f.reached }))} />
        <LeadsByStageChart data={d.byStage.map((s) => ({ label: LEAD_STAGE_META[s.stage].label, count: s.count, value: s.value }))} />
        <ConversionTrendChart data={d.conversionTrend.points} />
        <LeadSourcesChart data={d.sources} />
      </DashboardSection>

      <DashboardSection title="Revenue & team" description="Sales volume, pipeline value, order status and salesperson performance">
        <SalesTrendChart data={d.salesTrend.points} currency={cur} />
        <PipelineByStageChart data={d.byStage.map((s) => ({ label: LEAD_STAGE_META[s.stage].label, count: s.count, value: s.value }))} currency={cur} />
        <SalespersonChart data={d.performance} currency={cur} />
        <OrderStatusChart data={d.orderStatus.map((o) => ({ label: ORDER_STATUS_META[o.status].label, count: o.count, value: o.value }))} />
      </DashboardSection>

      <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">Your work</h2>
      <div className="grid gap-4 lg:grid-cols-2">
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
                    {c.overdue && <StatusBadge>Overdue</StatusBadge>}
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

function DashboardSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const id = `section-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="mt-8">
      <div className="mb-3">
        <h2 id={id} className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">{children}</div>
    </section>
  );
}
