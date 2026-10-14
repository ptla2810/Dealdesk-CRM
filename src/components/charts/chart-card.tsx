"use client";

import { useState } from "react";
import { BarChart3, Table2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Chart container with a chart/table toggle so every chart has an accessible,
 * colour-independent table view.
 */
export function ChartCard({
  title,
  description,
  table,
  children,
  empty,
  className,
}: {
  title: string;
  description?: string;
  table: { headers: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  empty?: boolean;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card className={cn("gap-3 border-border/70", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-[0.95rem] font-semibold">{title}</CardTitle>
          {description && <CardDescription className="text-xs">{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 rounded-lg bg-muted p-0.5" role="group" aria-label={`${title} view`}>
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              aria-label={v === "chart" ? "Show chart" : "Show table"}
              className={cn("rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:text-foreground", view === v && "bg-card text-foreground shadow-sm")}
            >
              {v === "chart" ? <BarChart3 className="size-3.5" /> : <Table2 className="size-3.5" />}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="grid h-56 place-items-center text-sm text-muted-foreground">No data for the selected period.</div>
        ) : view === "chart" ? (
          <div className="h-64 w-full">{children}</div>
        ) : (
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-muted-foreground">
                  {table.headers.map((h, i) => (
                    <th key={h} className={cn("py-1.5 pr-3 font-medium", i > 0 && "text-right")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {r.map((c, j) => (
                      <td key={j} className={cn("py-1.5 pr-3", j > 0 && "text-right tabular-nums")}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
