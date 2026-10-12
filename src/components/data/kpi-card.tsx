import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
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
            <span className="rounded-md bg-primary/10 p-1.5 text-primary">
              <Icon className="size-4" aria-hidden />
            </span>
          )}
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
