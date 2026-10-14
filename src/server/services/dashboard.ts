/**
 * Dashboard & report metrics. All figures come from live queries, are scoped to the caller's
 * organization and data scope, and respond to the selected period.
 *
 * KPI definitions (period = selected date range, in the organization's timezone):
 * - Total Leads ........ leads created in the period.
 * - Active Leads ....... of those, leads not yet converted (Qualified / In Discussion / Mature).
 * - Qualified Leads .... of those, leads currently in the "Qualified Lead" stage.
 * - Converted Leads .... leads whose conversion date falls in the period (regardless of creation date).
 * - Conversion Rate .... cohort rate: leads created in the period that are now converted
 *                        ÷ leads created in the period. Shown as "—" when the denominator is 0.
 * - Pipeline Value ..... sum of estimated deal value of open (non-converted) leads created in the period.
 *                        This is a forecast of opportunity, NOT revenue. The all-time open pipeline is shown alongside.
 * - Sales Volume ....... sum of order totals (incl. tax) for orders dated in the period whose status is
 *                        Confirmed, Processing, Shipped or Delivered. Drafts and cancelled orders are excluded.
 *                        Only orders in the organization's base currency are summed; others are counted separately.
 *                        Each order is counted once (totals live on the order, not summed from lines).
 * - Orders in Progress . orders dated in the period with status Confirmed, Processing or Shipped.
 */
import { Prisma, type LeadStage, type OrderStatus } from "@prisma/client";
import { eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, format } from "date-fns";
import { tz } from "@date-fns/tz";
import { prisma } from "../db";
import type { Ctx } from "../context";
import type { DateRange } from "@/lib/dates";
import { LEAD_STAGES } from "@/lib/constants";

export const REVENUE_STATUSES: OrderStatus[] = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
export const IN_PROGRESS_STATUSES: OrderStatus[] = ["CONFIRMED", "PROCESSING", "SHIPPED"];

export type DashboardFilters = { range: DateRange; ownerId?: string; sourceId?: string };

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

/**
 * Owner ids the figures are limited to, or undefined for the whole organization. OWN-scope users
 * see themselves and their reports; an owner filter outside that team is ignored, never widening it.
 */
function scopeOwnerIds(ctx: Ctx, f: DashboardFilters): string[] | undefined {
  if (ctx.dataScope === "ALL") return f.ownerId ? [f.ownerId] : undefined;
  return f.ownerId && ctx.teamUserIds.includes(f.ownerId) ? [f.ownerId] : [...ctx.teamUserIds];
}

function leadConds(ctx: Ctx, f: DashboardFilters, alias = "l") {
  const owners = scopeOwnerIds(ctx, f);
  const a = Prisma.raw(`"${alias}"`);
  return Prisma.sql`${a}."organizationId" = ${ctx.orgId}::uuid AND ${a}."deletedAt" IS NULL
    ${owners ? Prisma.sql`AND ${a}."ownerId" = ANY(${owners}::uuid[])` : Prisma.empty}
    ${f.sourceId ? Prisma.sql`AND ${a}."sourceId" = ${f.sourceId}::uuid` : Prisma.empty}`;
}

function orderConds(ctx: Ctx, f: DashboardFilters, alias = "o") {
  const owners = scopeOwnerIds(ctx, f);
  const a = Prisma.raw(`"${alias}"`);
  return Prisma.sql`${a}."organizationId" = ${ctx.orgId}::uuid AND ${a}."deletedAt" IS NULL
    AND ${a}."orderDate" BETWEEN ${f.range.from} AND ${f.range.to}
    ${owners ? Prisma.sql`AND ${a}."ownerId" = ANY(${owners}::uuid[])` : Prisma.empty}`;
}

const inPeriod = (f: DashboardFilters, col: string, alias = "l") =>
  Prisma.sql`${Prisma.raw(`"${alias}"."${col}"`)} BETWEEN ${f.range.from} AND ${f.range.to}`;

export async function getKpis(ctx: Ctx, f: DashboardFilters) {
  ctx.require("dashboard.view");
  const base = ctx.org.baseCurrency;
  const [leadRow] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE l.stage <> 'CONVERTED') AS active,
      COUNT(*) FILTER (WHERE l.stage = 'QUALIFIED') AS qualified,
      COUNT(*) FILTER (WHERE l.stage = 'CONVERTED') AS cohort_converted,
      COALESCE(SUM(l."estimatedValue") FILTER (WHERE l.stage <> 'CONVERTED'), 0) AS pipeline
    FROM "Lead" l WHERE ${leadConds(ctx, f)} AND ${inPeriod(f, "createdAt")}`;
  const [convRow] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT COUNT(*) AS converted FROM "Lead" l WHERE ${leadConds(ctx, f)} AND ${inPeriod(f, "convertedAt")}`;
  const [pipeAll] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT COALESCE(SUM(l."estimatedValue"), 0) AS pipeline, COUNT(*) AS open FROM "Lead" l
    WHERE ${leadConds(ctx, f)} AND l.stage <> 'CONVERTED'`;
  const [orderRow] = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      COALESCE(SUM(o.total) FILTER (WHERE o.status::text = ANY(${REVENUE_STATUSES}) AND o.currency = ${base}), 0) AS volume,
      COUNT(*) FILTER (WHERE o.status::text = ANY(${REVENUE_STATUSES}) AND o.currency = ${base}) AS volume_orders,
      COUNT(*) FILTER (WHERE o.status::text = ANY(${REVENUE_STATUSES}) AND o.currency <> ${base}) AS other_currency_orders,
      COUNT(*) FILTER (WHERE o.status::text = ANY(${IN_PROGRESS_STATUSES})) AS in_progress
    FROM "Order" o WHERE ${orderConds(ctx, f)}`;

  const total = num(leadRow?.total);
  const cohortConverted = num(leadRow?.cohort_converted);
  return {
    currency: base,
    totalLeads: total,
    activeLeads: num(leadRow?.active),
    qualifiedLeads: num(leadRow?.qualified),
    convertedLeads: num(convRow?.converted),
    cohortConverted,
    conversionRate: total > 0 ? (cohortConverted / total) * 100 : null,
    pipelineValue: num(leadRow?.pipeline),
    pipelineValueAllOpen: num(pipeAll?.pipeline),
    openLeadsAll: num(pipeAll?.open),
    salesVolume: num(orderRow?.volume),
    salesVolumeOrders: num(orderRow?.volume_orders),
    otherCurrencyOrders: num(orderRow?.other_currency_orders),
    ordersInProgress: num(orderRow?.in_progress),
  };
}

/** Cumulative funnel: leads created in the period that reached at least each stage. */
export async function getFunnel(ctx: Ctx, f: DashboardFilters) {
  const rows = await prisma.$queryRaw<{ max_idx: number; count: bigint }[]>`
    SELECT max_idx, COUNT(*) AS count FROM (
      SELECT l.id, GREATEST(
        MAX(CASE h."toStage" WHEN 'QUALIFIED' THEN 0 WHEN 'IN_DISCUSSION' THEN 1 WHEN 'MATURE' THEN 2 WHEN 'CONVERTED' THEN 3 END),
        MAX(CASE l.stage WHEN 'QUALIFIED' THEN 0 WHEN 'IN_DISCUSSION' THEN 1 WHEN 'MATURE' THEN 2 WHEN 'CONVERTED' THEN 3 END)
      ) AS max_idx
      FROM "Lead" l LEFT JOIN "LeadStageHistory" h ON h."leadId" = l.id
      WHERE ${leadConds(ctx, f)} AND ${inPeriod(f, "createdAt")}
      GROUP BY l.id
    ) t GROUP BY max_idx`;
  const byIdx = new Map(rows.map((r) => [Number(r.max_idx), Number(r.count)]));
  return LEAD_STAGES.map((stage, i) => {
    let reached = 0;
    for (let j = i; j < LEAD_STAGES.length; j++) reached += byIdx.get(j) ?? 0;
    return { stage, reached };
  });
}

export async function getLeadsByStage(ctx: Ctx, f: DashboardFilters) {
  const rows = await prisma.$queryRaw<{ stage: LeadStage; count: bigint; value: Prisma.Decimal | null }[]>`
    SELECT l.stage, COUNT(*) AS count, COALESCE(SUM(l."estimatedValue"), 0) AS value
    FROM "Lead" l WHERE ${leadConds(ctx, f)} AND ${inPeriod(f, "createdAt")} GROUP BY l.stage`;
  const map = new Map(rows.map((r) => [r.stage, r]));
  return LEAD_STAGES.map((stage) => ({ stage, count: num(map.get(stage)?.count), value: num(map.get(stage)?.value) }));
}

export async function getLeadSources(ctx: Ctx, f: DashboardFilters) {
  const rows = await prisma.$queryRaw<{ id: string; name: string; total: bigint; converted: bigint; value: Prisma.Decimal }[]>`
    SELECT s.id, s.name, COUNT(l.id) AS total,
      COUNT(l.id) FILTER (WHERE l.stage = 'CONVERTED') AS converted,
      COALESCE(SUM(l."estimatedValue"), 0) AS value
    FROM "LeadSource" s
    LEFT JOIN "Lead" l ON l."sourceId" = s.id AND ${leadConds(ctx, f)} AND ${inPeriod(f, "createdAt")}
    WHERE s."organizationId" = ${ctx.orgId}::uuid
    GROUP BY s.id, s.name ORDER BY total DESC, s.name`;
  return rows.map((r) => {
    const total = num(r.total);
    const converted = num(r.converted);
    return { id: r.id, name: r.name, total, converted, value: num(r.value), conversionRate: total ? (converted / total) * 100 : null };
  });
}

type Granularity = "day" | "week" | "month";

export function granularityFor(range: DateRange): Granularity {
  const days = (range.to.getTime() - range.from.getTime()) / 86_400_000;
  if (days <= 31) return "day";
  if (days <= 190) return "week";
  return "month";
}

function buckets(range: DateRange, g: Granularity, timeZone: string) {
  const o = { in: tz(timeZone) };
  const interval = { start: range.from, end: range.to };
  const dates =
    g === "day" ? eachDayOfInterval(interval, o) : g === "week" ? eachWeekOfInterval(interval, { ...o, weekStartsOn: 1 }) : eachMonthOfInterval(interval, o);
  return dates.map((d) => ({
    key: format(d, "yyyy-MM-dd", o),
    label: g === "month" ? format(d, "MMM yyyy", o) : format(d, "dd MMM", o),
  }));
}

/** Leads created vs. leads converted per day/week/month. */
export async function getConversionTrend(ctx: Ctx, f: DashboardFilters) {
  const g = granularityFor(f.range);
  const zone = ctx.org.timezone;
  const gran = Prisma.raw(`'${g}'`);
  const created = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
    SELECT to_char(date_trunc(${gran}, l."createdAt" AT TIME ZONE ${zone}), 'YYYY-MM-DD') AS bucket, COUNT(*) AS count
    FROM "Lead" l WHERE ${leadConds(ctx, f)} AND ${inPeriod(f, "createdAt")} GROUP BY 1`;
  const converted = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
    SELECT to_char(date_trunc(${gran}, l."convertedAt" AT TIME ZONE ${zone}), 'YYYY-MM-DD') AS bucket, COUNT(*) AS count
    FROM "Lead" l WHERE ${leadConds(ctx, f)} AND ${inPeriod(f, "convertedAt")} GROUP BY 1`;
  const c = new Map(created.map((r) => [r.bucket, num(r.count)]));
  const v = new Map(converted.map((r) => [r.bucket, num(r.count)]));
  return {
    granularity: g,
    points: buckets(f.range, g, zone).map((b) => {
      const createdCount = c.get(b.key) ?? 0;
      const convertedCount = v.get(b.key) ?? 0;
      return { ...b, created: createdCount, converted: convertedCount };
    }),
  };
}

/** Sales volume (base currency, revenue statuses) per bucket by order date. */
export async function getSalesTrend(ctx: Ctx, f: DashboardFilters) {
  const g = granularityFor(f.range);
  const zone = ctx.org.timezone;
  const gran = Prisma.raw(`'${g}'`);
  // orderDate is a date-only value stored at UTC midnight, so it is bucketed in UTC.
  const rows = await prisma.$queryRaw<{ bucket: string; volume: Prisma.Decimal; orders: bigint }[]>`
    SELECT to_char(date_trunc(${gran}, o."orderDate" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS bucket,
      COALESCE(SUM(o.total), 0) AS volume, COUNT(*) AS orders
    FROM "Order" o WHERE ${orderConds(ctx, f)} AND o.status::text = ANY(${REVENUE_STATUSES}) AND o.currency = ${ctx.org.baseCurrency}
    GROUP BY 1`;
  const map = new Map(rows.map((r) => [r.bucket, r]));
  return {
    granularity: g,
    currency: ctx.org.baseCurrency,
    points: buckets(f.range, g, zone).map((b) => ({ ...b, volume: num(map.get(b.key)?.volume), orders: num(map.get(b.key)?.orders) })),
  };
}

export async function getSalespersonPerformance(ctx: Ctx, f: DashboardFilters) {
  const owners = scopeOwnerIds(ctx, f);
  const rows = await prisma.$queryRaw<
    { id: string; name: string; leads: bigint; converted: bigint; pipeline: Prisma.Decimal; volume: Prisma.Decimal; orders: bigint }[]
  >`
    SELECT u.id, u.name,
      (SELECT COUNT(*) FROM "Lead" l WHERE l."ownerId" = u.id AND ${leadConds(ctx, f)} AND ${inPeriod(f, "createdAt")}) AS leads,
      (SELECT COUNT(*) FROM "Lead" l WHERE l."ownerId" = u.id AND ${leadConds(ctx, f)} AND ${inPeriod(f, "convertedAt")}) AS converted,
      (SELECT COALESCE(SUM(l."estimatedValue"), 0) FROM "Lead" l WHERE l."ownerId" = u.id AND ${leadConds(ctx, f)} AND ${inPeriod(f, "createdAt")} AND l.stage <> 'CONVERTED') AS pipeline,
      (SELECT COALESCE(SUM(o.total), 0) FROM "Order" o WHERE o."ownerId" = u.id AND ${orderConds(ctx, f)} AND o.status::text = ANY(${REVENUE_STATUSES}) AND o.currency = ${ctx.org.baseCurrency}) AS volume,
      (SELECT COUNT(*) FROM "Order" o WHERE o."ownerId" = u.id AND ${orderConds(ctx, f)} AND o.status::text = ANY(${REVENUE_STATUSES})) AS orders
    FROM "User" u
    WHERE u."organizationId" = ${ctx.orgId}::uuid AND u."isActive" = true
      ${owners ? Prisma.sql`AND u.id = ANY(${owners}::uuid[])` : Prisma.empty}`;
  return rows
    .map((r) => {
      const leads = num(r.leads);
      return {
        id: r.id,
        name: r.name,
        leads,
        converted: num(r.converted),
        pipeline: num(r.pipeline),
        volume: num(r.volume),
        orders: num(r.orders),
      };
    })
    .filter((r) => r.leads || r.converted || r.pipeline || r.volume || r.orders)
    .sort((a, b) => b.volume - a.volume || b.converted - a.converted || b.leads - a.leads);
}

export async function getOrderStatusDistribution(ctx: Ctx, f: DashboardFilters) {
  const rows = await prisma.$queryRaw<{ status: OrderStatus; count: bigint; value: Prisma.Decimal }[]>`
    SELECT o.status, COUNT(*) AS count, COALESCE(SUM(o.total) FILTER (WHERE o.currency = ${ctx.org.baseCurrency}), 0) AS value
    FROM "Order" o WHERE ${orderConds(ctx, f)} GROUP BY o.status`;
  const map = new Map(rows.map((r) => [r.status, r]));
  return (["DRAFT", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as OrderStatus[]).map((status) => ({
    status,
    count: num(map.get(status)?.count),
    value: num(map.get(status)?.value),
  }));
}

export async function getDashboard(ctx: Ctx, f: DashboardFilters) {
  ctx.require("dashboard.view");
  const [kpis, funnel, byStage, sources, conversionTrend, salesTrend, performance, orderStatus] = await Promise.all([
    getKpis(ctx, f),
    getFunnel(ctx, f),
    getLeadsByStage(ctx, f),
    getLeadSources(ctx, f),
    getConversionTrend(ctx, f),
    getSalesTrend(ctx, f),
    getSalespersonPerformance(ctx, f),
    getOrderStatusDistribution(ctx, f),
  ]);
  return { kpis, funnel, byStage, sources, conversionTrend, salesTrend, performance, orderStatus };
}

// ─── Grouped report (Reports page) ─────────────────────────────────────────

export type GroupBy = "owner" | "source" | "account" | "stage";

export async function getGroupedLeadReport(ctx: Ctx, f: DashboardFilters, groupBy: GroupBy) {
  ctx.require("report.view");
  const keyExpr = {
    owner: Prisma.sql`u.name`,
    source: Prisma.sql`s.name`,
    account: Prisma.sql`COALESCE(a.name, '(No account) ' || l."companyName")`,
    stage: Prisma.sql`l.stage::text`,
  }[groupBy];
  const rows = await prisma.$queryRaw<{ key: string; leads: bigint; open: bigint; converted: bigint; pipeline: Prisma.Decimal; won: Prisma.Decimal }[]>`
    SELECT ${keyExpr} AS key,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE l.stage <> 'CONVERTED') AS open,
      COUNT(*) FILTER (WHERE l.stage = 'CONVERTED') AS converted,
      COALESCE(SUM(l."estimatedValue") FILTER (WHERE l.stage <> 'CONVERTED'), 0) AS pipeline,
      COALESCE(SUM(l."estimatedValue") FILTER (WHERE l.stage = 'CONVERTED'), 0) AS won
    FROM "Lead" l
    JOIN "User" u ON u.id = l."ownerId"
    JOIN "LeadSource" s ON s.id = l."sourceId"
    LEFT JOIN "Account" a ON a.id = l."accountId"
    WHERE ${leadConds(ctx, f)} AND ${inPeriod(f, "createdAt")}
    GROUP BY 1 ORDER BY leads DESC, key ASC LIMIT 200`;
  return rows.map((r) => {
    const leads = num(r.leads);
    const converted = num(r.converted);
    return { key: r.key, leads, open: num(r.open), converted, conversionRate: leads ? (converted / leads) * 100 : null, pipeline: num(r.pipeline), won: num(r.won) };
  });
}

export async function getRecentActivity(ctx: Ctx, take = 12) {
  return prisma.auditLog.findMany({
    where: { organizationId: ctx.orgId, ...(ctx.can("audit.view") ? {} : { actorId: ctx.userId }) },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}
