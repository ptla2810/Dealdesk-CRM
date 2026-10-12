import { cn } from "@/lib/utils";

export type TimelineItem = {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  body?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
};

const DOT: Record<NonNullable<TimelineItem["tone"]>, string> = {
  default: "bg-primary",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  muted: "bg-muted-foreground/40",
};

export function Timeline({ items, empty = "No activity yet." }: { items: TimelineItem[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative space-y-5 border-l pl-5">
      {items.map((it) => (
        <li key={it.id} className="relative">
          <span className={cn("absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-background", DOT[it.tone ?? "default"])} aria-hidden />
          <div className="text-sm font-medium">{it.title}</div>
          {it.meta && <div className="text-xs text-muted-foreground">{it.meta}</div>}
          {it.body && <div className="mt-1.5 text-sm text-muted-foreground">{it.body}</div>}
        </li>
      ))}
    </ol>
  );
}
