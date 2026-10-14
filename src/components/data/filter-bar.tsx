"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FilterDef =
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; type: "date" }
  | { key: string; label: string; type: "checkbox" };

/**
 * URL-driven filter bar: every filter is a query-string parameter, so filtered views are
 * shareable and the server applies them. Changing a filter resets pagination.
 */
export function FilterBar({ filters = [], searchPlaceholder = "Search…" }: { filters?: FilterDef[]; searchPlaceholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [lastUrlQ, setLastUrlQ] = useState(urlQ);
  // Keep the input in sync when the URL changes (back/forward, reset) — adjusted during render.
  if (urlQ !== lastUrlQ) {
    setLastUrlQ(urlQ);
    setQ(urlQ);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false }));
  };

  const onSearch = (value: string) => {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply({ q: value.trim() || undefined }), 350);
  };

  const keys = ["q", ...filters.map((f) => f.key)];
  const active = keys.some((k) => params.get(k));

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4 lg:flex-row lg:flex-wrap lg:items-end" role="search">
      <div className="relative min-w-0 flex-1 lg:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => onSearch(e.target.value)} placeholder={searchPlaceholder} aria-label="Search" className="pl-8" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        {filters.map((f) => {
          const value = params.get(f.key) ?? "";
          if (f.type === "checkbox") {
            return (
              <label key={f.key} className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={value === "1"} onChange={(e) => apply({ [f.key]: e.target.checked ? "1" : undefined })} />
                {f.label}
              </label>
            );
          }
          if (f.type === "date") {
            return (
              <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                {f.label}
                <Input type="date" value={value} onChange={(e) => apply({ [f.key]: e.target.value || undefined })} className="h-9 w-full sm:w-40" />
              </label>
            );
          }
          return (
            <label key={f.key} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              <span className="sr-only sm:not-sr-only">{f.label}</span>
              <select
                value={value}
                onChange={(e) => apply({ [f.key]: e.target.value || undefined })}
                className={cn(
                  "h-9 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground shadow-xs sm:w-44",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                )}
                aria-label={f.label}
              >
                <option value="">All {f.label.toLowerCase()}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              const next = new URLSearchParams(params.toString());
              keys.forEach((k) => next.delete(k));
              next.delete("page");
              startTransition(() => router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false }));
            }}
          >
            <X className="size-4" /> Reset filters
          </Button>
        )}
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />}
      </div>
    </div>
  );
}
