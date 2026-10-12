"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PERIODS } from "@/lib/dates";
import { selectClass } from "@/components/forms/fields";
import { cn } from "@/lib/utils";

/** Dashboard/report filter row: period presets, custom range and optional dimension filters. */
export function PeriodFilter({
  owners,
  sources,
  extra,
}: {
  owners?: { id: string; name: string }[];
  sources?: { id: string; name: string }[];
  extra?: { key: string; label: string; options: { value: string; label: string }[]; defaultValue: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const period = params.get("period") ?? "month";
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");

  const apply = (u: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    Object.entries(u).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };

  return (
    <div className="mb-6 flex flex-wrap items-end gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={period === p.key}
            onClick={() => apply({ period: p.key, ...(p.key === "custom" ? {} : { from: undefined, to: undefined }) })}
            className={`rounded-md px-2.5 py-1 text-sm ${period === p.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ period: "custom", from, to });
          }}
        >
          <label className="text-xs text-muted-foreground">
            From
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" required />
          </label>
          <label className="text-xs text-muted-foreground">
            To
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" required />
          </label>
          <Button type="submit" size="sm" variant="secondary" className="h-9">
            Apply
          </Button>
        </form>
      )}
      {owners && owners.length > 0 && (
        <select aria-label="Salesperson" className={cn(selectClass, "w-44")} value={params.get("owner") ?? ""} onChange={(e) => apply({ owner: e.target.value || undefined })}>
          <option value="">All salespeople</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      {sources && sources.length > 0 && (
        <select aria-label="Lead source" className={cn(selectClass, "w-44")} value={params.get("source") ?? ""} onChange={(e) => apply({ source: e.target.value || undefined })}>
          <option value="">All lead sources</option>
          {sources.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      {extra && (
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {extra.label}
          <select className={cn(selectClass, "w-40")} value={params.get(extra.key) ?? extra.defaultValue} onChange={(e) => apply({ [extra.key]: e.target.value })}>
            {extra.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {pending && <Loader2 className="mb-2 size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
    </div>
  );
}
