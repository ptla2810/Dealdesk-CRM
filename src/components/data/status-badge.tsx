import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/constants";

const TONES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground ring-border",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300",
  primary: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-500/10 dark:text-amber-300",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300",
};

export function StatusBadge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Renders an enum value using a meta map from lib/constants. */
export function EnumBadge<T extends string>({ value, meta }: { value: T; meta: Record<T, { label: string; tone: Tone }> }) {
  const m = meta[value];
  return <StatusBadge tone={m?.tone ?? "neutral"}>{m?.label ?? value}</StatusBadge>;
}
