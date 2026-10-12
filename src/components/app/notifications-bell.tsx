"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";

async function fetchNotifications(): Promise<{ items: Item[]; unread: number } | null> {
  try {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

type Item = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState<"idle" | "loading" | "error">("loading");

  const load = useCallback(
    () =>
      fetchNotifications().then((data) => {
        if (!data) return setState("error");
        setItems(data.items);
        setUnread(data.unread);
        setState("idle");
      }),
    [],
  );

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const markAll = async () => {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    load();
  };
  const markOne = (id: string) =>
    fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [id] }) }).then(load);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) load(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-sm p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={markAll}>
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {state === "error" && <p className="p-4 text-sm text-destructive">Could not load notifications.</p>}
          {state !== "error" && items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">{state === "loading" ? "Loading…" : "You're all caught up."}</p>}
          <ul>
            {items.map((n) => {
              const content = (
                <div className={cn("flex gap-3 px-4 py-3 text-sm hover:bg-muted/60", !n.readAt && "bg-primary/5")}>
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                  <div className="min-w-0">
                    <div className="font-medium">{n.title}</div>
                    {n.body && <div className="line-clamp-2 text-muted-foreground">{n.body}</div>}
                    <div className="mt-0.5 text-xs text-muted-foreground">{formatDistanceToNowStrict(new Date(n.createdAt), { addSuffix: true })}</div>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className="border-b last:border-0">
                  {n.link ? (
                    <Link href={n.link} onClick={() => { if (!n.readAt) markOne(n.id); setOpen(false); }}>
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
