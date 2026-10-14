"use client";

import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";

/** The current module's navigation icon in the brand-gradient tile used across the app. */
export function ModuleIcon({ className }: { className?: string }) {
  const pathname = usePathname();
  const item = NAV_ITEMS.filter((i) => i.href !== "/" && (pathname === i.href || pathname.startsWith(`${i.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];
  const Icon = item?.icon ?? LayoutGrid;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white shadow-lg shadow-primary/25 ring-1 ring-white/20 ring-inset",
        className,
      )}
    >
      <Icon className="size-6" />
    </span>
  );
}
