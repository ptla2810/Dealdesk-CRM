/**
 * Date handling conventions
 * - Date+time values (meeting times, events) are entered and displayed in the
 *   organization's timezone (Settings → Organization), stored as UTC instants.
 * - Date-only values (follow-up dates, due dates, delivery dates) are stored as
 *   UTC midnight and always formatted in UTC so they never shift by a day.
 */
import { TZDate, tz } from "@date-fns/tz";
import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  format,
  formatDistanceToNowStrict,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startOfYear,
} from "date-fns";

const UTC = tz("UTC");

export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(y, mo - 1, day));
  // Reject impossible dates (e.g. 2026-02-30) instead of letting them roll over.
  return d.getUTCFullYear() === y && d.getUTCMonth() === mo - 1 && d.getUTCDate() === day ? d : null;
}

export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd", { in: UTC });
}

/** Parses "YYYY-MM-DDTHH:mm" as wall-clock time in `timeZone`. */
export function parseLocalDateTime(value: string | null | undefined, timeZone: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new TZDate(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), timeZone);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime());
}

export function toDateTimeInput(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm", { in: tz(timeZone) });
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return format(new Date(value), "dd MMM yyyy", { in: UTC });
}

export function formatDateTime(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  return format(new Date(value), "dd MMM yyyy, HH:mm", { in: tz(timeZone) });
}

/** Timestamps (createdAt etc.) shown as a date in the org timezone. */
export function formatTimestampDate(value: Date | string | null | undefined, timeZone: string): string {
  if (!value) return "—";
  return format(new Date(value), "dd MMM yyyy", { in: tz(timeZone) });
}

export function formatRelative(value: Date | string): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

/** Next full hour, one day from now — a sensible default for scheduling a meeting. */
export function defaultMeetingStart(now = new Date()): Date {
  return new Date(Math.ceil((now.getTime() + 86_400_000) / 3_600_000) * 3_600_000);
}

/** UTC midnight of "today" — the comparison point for date-only fields. */
export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ─── Dashboard / report periods ────────────────────────────────────────────

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "half", label: "Half-Yearly" },
  { key: "year", label: "This Year" },
  { key: "custom", label: "Custom Range" },
] as const;

export type PeriodKey = (typeof PERIODS)[number]["key"];

export type DateRange = { from: Date; to: Date; key: PeriodKey; label: string };

/**
 * Resolves a period to an inclusive [from, to] instant range in the org timezone.
 * Weeks start on Monday. "Half-Yearly" is the current calendar half (Jan–Jun or Jul–Dec).
 */
export function resolvePeriod(
  key: string | undefined,
  opts: { timeZone: string; from?: string; to?: string; now?: Date },
): DateRange {
  const inTz = tz(opts.timeZone);
  const now = opts.now ?? new Date();
  const o = { in: inTz };
  const range = (from: Date, to: Date, k: PeriodKey): DateRange => ({
    from: new Date(from.getTime()),
    to: new Date(to.getTime()),
    key: k,
    label: PERIODS.find((p) => p.key === k)!.label,
  });

  switch (key) {
    case "today":
      return range(startOfDay(now, o), endOfDay(now, o), "today");
    case "week":
      return range(startOfWeek(now, { ...o, weekStartsOn: 1 }), endOfWeek(now, { ...o, weekStartsOn: 1 }), "week");
    case "quarter":
      return range(startOfQuarter(now, o), endOfQuarter(now, o), "quarter");
    case "half": {
      const local = new TZDate(now.getTime(), opts.timeZone);
      const year = local.getFullYear();
      const firstHalf = local.getMonth() < 6;
      const start = new TZDate(year, firstHalf ? 0 : 6, 1, opts.timeZone);
      const end = endOfMonth(new TZDate(year, firstHalf ? 5 : 11, 1, opts.timeZone), o);
      return range(start, end, "half");
    }
    case "year":
      return range(startOfYear(now, o), endOfYear(now, o), "year");
    case "custom": {
      const from = opts.from && /^\d{4}-\d{2}-\d{2}$/.test(opts.from) ? parseLocalDateTime(`${opts.from}T00:00`, opts.timeZone) : null;
      const to = opts.to && /^\d{4}-\d{2}-\d{2}$/.test(opts.to) ? parseLocalDateTime(`${opts.to}T00:00`, opts.timeZone) : null;
      if (from && to && from <= to) {
        const r = range(from, endOfDay(inTz(to.getTime()), o), "custom");
        r.label = `${opts.from} → ${opts.to}`;
        return r;
      }
      return range(startOfMonth(now, o), endOfMonth(now, o), "month");
    }
    case "month":
    default:
      return range(startOfMonth(now, o), endOfMonth(now, o), "month");
  }
}
