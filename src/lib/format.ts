import Decimal from "decimal.js";

type Num = number | string | Decimal | { toString(): string } | null | undefined;

const toNumber = (v: Num) => (v === null || v === undefined ? 0 : Number(v.toString()));

export function formatMoney(value: Num, currency: string, opts: { compact?: boolean } = {}): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: opts.compact ? "compact" : "standard",
      maximumFractionDigits: opts.compact ? 1 : 2,
    }).format(toNumber(value));
  } catch {
    return `${currency} ${toNumber(value).toFixed(2)}`;
  }
}

export function formatNumber(value: Num, digits = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(toNumber(value));
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export const fullName = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`.trim();
