"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, Workflow } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";
import { GlobalSearch } from "./global-search";
import { NotificationsBell } from "./notifications-bell";
import { UserMenu } from "./user-menu";

type ShellUser = { name: string; email: string; roleName: string };

export const SIDEBAR_COOKIE = "sf_sidebar_collapsed";

export function AppShell({ appName, orgName, user, permissions, initialCollapsed, children }: { appName: string; orgName: string; user: ShellUser; permissions: string[]; initialCollapsed: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const allowed = new Set(permissions);
  const items = NAV_ITEMS.filter((i) => !i.permission || allowed.has(i.permission));

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    // Persisted in a cookie so the server renders the same width on the next load (no flash).
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const navList = (compact: boolean) => (
    <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
      {items.map((item) => {
        const active = isActive(item.href);
        const link = (
          <Link
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors",
              active ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              compact && "justify-center px-0",
            )}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            {compact ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
          </Link>
        );
        return compact ? (
          <Tooltip key={item.href}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        ) : (
          <div key={item.href}>{link}</div>
        );
      })}
    </nav>
  );

  const brand = (compact: boolean) => (
    <Link href="/" className={cn("flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4", compact && "justify-center px-0")}>
      <span className="grid size-8 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
        <Workflow className="size-4" aria-hidden />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-sidebar-accent-foreground">{appName}</span>
          <span className="block truncate text-xs text-sidebar-foreground/60">{orgName}</span>
        </span>
      )}
    </Link>
  );

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex", collapsed ? "w-16" : "w-64")}>
        {brand(collapsed)}
        {navList(collapsed)}
        <div className="border-t border-sidebar-border p-2">
          <Button variant="ghost" size="sm" onClick={toggle} className={cn("w-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", collapsed ? "justify-center" : "justify-start")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && "Collapse"}
          </Button>
        </div>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-full flex-col">
            {brand(false)}
            {navList(false)}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <NotificationsBell />
          <UserMenu user={user} />
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
