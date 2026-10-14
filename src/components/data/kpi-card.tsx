import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";


export function KpiCard({
  label,
  value,
  hint,
  definition,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  definition?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card
      className={cn(
        "group relative gap-0 overflow-hidden rounded-2xl border-border/70 py-5 transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 motion-safe:hover:-translate-y-1",
      )}
    >
      {/* Brand-tinted wash and a faded watermark icon, in the theme colours. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.05] to-transparent to-60%" />
      {Icon && (
        <Icon
          aria-hidden
          className="pointer-events-none absolute -right-4 -bottom-5 size-24 text-primary opacity-[0.06] transition-transform duration-500 motion-safe:group-hover:scale-110 motion-safe:group-hover:-rotate-6"
        />
      )}

      <CardContent className="relative px-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
            {label}
            {definition && (
              <Tooltip>
                <TooltipTrigger aria-label={`How ${label} is calculated`} className="text-muted-foreground/70 hover:text-foreground">
                  <Info className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{definition}</TooltipContent>
              </Tooltip>
            )}
          </div>
          {Icon && (
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white shadow-lg shadow-primary/25 ring-1 ring-white/20 ring-inset transition-transform duration-300 motion-safe:group-hover:scale-110"
            >
              <Icon className="size-5" aria-hidden />
            </span>
          )}
        </div>
        <div className="mt-2 text-[2rem] leading-tight font-extrabold tracking-tight tabular-nums">{value}</div>
        {hint && <div className="mt-1 text-xs font-medium text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
