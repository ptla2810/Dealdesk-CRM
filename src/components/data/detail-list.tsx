import { cn } from "@/lib/utils";

export function DetailList({ items, columns = 2, className }: { items: { label: string; value: React.ReactNode; full?: boolean }[]; columns?: 1 | 2 | 3; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-4", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((it) => (
        <div key={it.label} className={cn("min-w-0", it.full && "sm:col-span-full")}>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{it.label}</dt>
          <dd className="mt-1 text-sm break-words whitespace-pre-line">{it.value === null || it.value === undefined || it.value === "" ? <span className="text-muted-foreground">—</span> : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
