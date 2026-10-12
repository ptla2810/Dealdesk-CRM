"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Package, Search, Target, Truck, LifeBuoy, User } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { SearchHit } from "@/server/services/search";

const GROUPS: { type: SearchHit["type"]; label: string; icon: typeof Search }[] = [
  { type: "lead", label: "Leads", icon: Target },
  { type: "account", label: "Accounts", icon: Building2 },
  { type: "contact", label: "Contacts", icon: User },
  { type: "order", label: "Orders", icon: Truck },
  { type: "ticket", label: "Tickets", icon: LifeBuoy },
  { type: "product", label: "Products", icon: Package },
];

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: c.signal });
        if (!res.ok) throw new Error();
        setHits((await res.json()).results);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground hover:bg-muted"
        aria-label="Search everything"
      >
        <Search className="size-4" />
        <span className="truncate">Search leads, accounts, orders…</span>
        <kbd className="ml-auto hidden rounded border bg-background px-1.5 text-[10px] font-medium sm:inline">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Global search" description="Search across all modules" shouldFilter={false}>
        <CommandInput value={q} onValueChange={setQ} placeholder="Type at least 2 characters…" />
        <CommandList>
          {loading && (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </div>
          )}
          {error && <div className="px-3 py-4 text-sm text-destructive">Search failed. Please try again.</div>}
          {!loading && q.trim().length >= 2 && <CommandEmpty>No results for “{q}”.</CommandEmpty>}
          {GROUPS.map((g) => {
            const items = (q.trim().length < 2 ? [] : hits).filter((h) => h.type === g.type);
            if (!items.length) return null;
            return (
              <CommandGroup key={g.type} heading={g.label}>
                {items.map((h) => (
                  <CommandItem
                    key={`${h.type}-${h.id}`}
                    value={`${h.type}-${h.id}`}
                    onSelect={() => {
                      setOpen(false);
                      setQ("");
                      router.push(h.href);
                    }}
                  >
                    <g.icon className="size-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate">{h.title}</div>
                      <div className="truncate text-xs text-muted-foreground">{h.subtitle}</div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
        </CommandList>
      </CommandDialog>
    </>
  );
}
