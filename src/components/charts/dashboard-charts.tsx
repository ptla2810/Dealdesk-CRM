"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { ChartCard } from "./chart-card";

// Brand palette from the DealDesk logo: navy and teal (ordinal ramp runs teal → navy with
// monotone lightness so stage order still reads without colour).
// Two-series charts pair the dark and light shade and always show a legend; lines also differ by dash.
const BLUE = { main: "#1f9e91", dark: "#163a5e", light: "#4fd1c2" } as const;
// Ordinal ramp for ordered funnel stages, light → dark.
const ORDINAL = ["#7ddccf", "#1fb5a5", "#237394", "#163a5e"];
const GRID = "var(--border)";
const AXIS = { fontSize: 12, fill: "var(--muted-foreground)" };

const money = (currency: string) => (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(v);
const moneyFull = (currency: string) => (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);

const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)" },
  cursor: { fill: "var(--muted)", opacity: 0.5 },
};

export type DashboardChartData = {
  currency: string;
  funnel: { label: string; reached: number }[];
  byStage: { label: string; count: number; value: number }[];
  sources: { name: string; total: number; converted: number; conversionRate: number | null }[];
  conversionTrend: { label: string; created: number; converted: number }[];
  salesTrend: { label: string; volume: number; orders: number }[];
  performance: { name: string; leads: number; converted: number; pipeline: number; volume: number; orders: number }[];
  orderStatus: { label: string; count: number; value: number }[];
};

export function FunnelChart({ data }: { data: DashboardChartData["funnel"] }) {
  const top = data[0]?.reached ?? 0;
  return (
    <ChartCard
      title="Sales funnel"
      description="Leads created in the period that reached at least each stage"
      empty={top === 0}
      table={{ headers: ["Stage", "Leads reached", "% of created"], rows: data.map((d) => [d.label, d.reached, top ? `${((d.reached / top) * 100).toFixed(1)}%` : "—"]) }}
    >
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 56 }} barCategoryGap={6}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={110} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => [`${v} leads`, "Reached"]} />
          <Bar dataKey="reached" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((_, i) => (
              <Cell key={i} fill={ORDINAL[i]} />
            ))}
            <LabelList dataKey="reached" position="right" className="fill-foreground text-xs" formatter={(v) => `${v}${top ? ` · ${((Number(v) / top) * 100).toFixed(0)}%` : ""}`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function LeadsByStageChart({ data }: { data: DashboardChartData["byStage"] }) {
  return (
    <ChartCard
      title="Leads by stage"
      description="Current stage of leads created in the period"
      empty={data.every((d) => d.count === 0)}
      table={{ headers: ["Stage", "Leads"], rows: data.map((d) => [d.label, d.count]) }}
    >
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 8, left: -16 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => [v, "Leads"]} />
          <Bar dataKey="count" fill={BLUE.main} radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false}>
            <LabelList dataKey="count" position="top" className="fill-foreground text-xs" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function PipelineByStageChart({ data, currency }: { data: DashboardChartData["byStage"]; currency: string }) {
  const open = data.filter((d) => d.label !== "Lead Converted");
  return (
    <ChartCard
      title="Pipeline value by stage"
      description={`Estimated value of open leads created in the period (${currency}) — forecast, not revenue`}
      empty={open.every((d) => d.value === 0)}
      table={{ headers: ["Stage", "Pipeline value"], rows: open.map((d) => [d.label, moneyFull(currency)(d.value)]) }}
    >
      <ResponsiveContainer>
        <BarChart data={open} margin={{ top: 16, right: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={money(currency)} tick={AXIS} axisLine={false} tickLine={false} width={64} />
          <Tooltip {...tooltipStyle} formatter={(v) => [moneyFull(currency)(Number(v)), "Pipeline"]} />
          <Bar dataKey="value" fill={BLUE.main} radius={[4, 4, 0, 0]} maxBarSize={56} isAnimationActive={false}>
            <LabelList dataKey="value" position="top" className="fill-foreground text-xs" formatter={(v) => money(currency)(Number(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function LeadSourcesChart({ data }: { data: DashboardChartData["sources"] }) {
  return (
    <ChartCard
      title="Lead sources"
      description="Leads created in the period, by source, with how many converted"
      empty={data.every((d) => d.total === 0)}
      table={{
        headers: ["Source", "Leads", "Converted", "Conversion"],
        rows: data.map((d) => [d.name, d.total, d.converted, d.conversionRate === null ? "—" : `${d.conversionRate.toFixed(1)}%`]),
      }}
    >
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }} barGap={2} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={130} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="total" name="Leads" fill={BLUE.dark} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          <Bar dataKey="converted" name="Converted" fill={BLUE.light} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ConversionTrendChart({ data }: { data: DashboardChartData["conversionTrend"] }) {
  return (
    <ChartCard
      title="Lead conversion trend"
      description="Leads created vs. leads converted in each interval"
      empty={data.every((d) => d.created === 0 && d.converted === 0)}
      table={{ headers: ["Period", "Created", "Converted"], rows: data.map((d) => [d.label, d.created, d.converted]) }}
    >
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -16 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={16} />
          <YAxis allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <Line type="linear" dataKey="created" name="Created" stroke={BLUE.dark} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
          <Line type="linear" dataKey="converted" name="Converted" stroke={BLUE.light} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function SalesTrendChart({ data, currency }: { data: DashboardChartData["salesTrend"]; currency: string }) {
  return (
    <ChartCard
      title="Sales volume trend"
      description={`Confirmed → delivered order value by order date (${currency} orders only)`}
      empty={data.every((d) => d.volume === 0)}
      table={{ headers: ["Period", "Orders", "Sales volume"], rows: data.map((d) => [d.label, d.orders, moneyFull(currency)(d.volume)]) }}
    >
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} minTickGap={12} />
          <YAxis tickFormatter={money(currency)} tick={AXIS} axisLine={false} tickLine={false} width={64} />
          <Tooltip {...tooltipStyle} formatter={(v, n) => (n === "Sales volume" ? [moneyFull(currency)(Number(v)), n] : [v, n])} />
          <Bar dataKey="volume" name="Sales volume" fill={BLUE.main} radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function SalespersonChart({ data, currency }: { data: DashboardChartData["performance"]; currency: string }) {
  return (
    <ChartCard
      title="Salesperson performance"
      description="Sales volume (orders dated in the period) per order owner"
      empty={data.length === 0}
      table={{
        headers: ["Salesperson", "Leads", "Converted", "Open pipeline", "Orders", "Sales volume"],
        rows: data.map((d) => [d.name, d.leads, d.converted, moneyFull(currency)(d.pipeline), d.orders, moneyFull(currency)(d.volume)]),
      }}
    >
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 64 }} barCategoryGap={8}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={120} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => [moneyFull(currency)(Number(v)), "Sales volume"]} />
          <Bar dataKey="volume" fill={BLUE.main} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="volume" position="right" className="fill-foreground text-xs" formatter={(v) => money(currency)(Number(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function OrderStatusChart({ data }: { data: DashboardChartData["orderStatus"] }) {
  return (
    <ChartCard
      title="Order status distribution"
      description="Orders dated in the period, by current status"
      empty={data.every((d) => d.count === 0)}
      table={{ headers: ["Status", "Orders"], rows: data.map((d) => [d.label, d.count]) }}
    >
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 32 }} barCategoryGap={6}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={90} tick={AXIS} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} formatter={(v) => [v, "Orders"]} />
          <Bar dataKey="count" fill={BLUE.main} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            <LabelList dataKey="count" position="right" className="fill-foreground text-xs" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
