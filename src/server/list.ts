import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/config";
import { parseDateOnly } from "@/lib/dates";

export type SearchParams = Record<string, string | string[] | undefined>;

export type ListParams = {
  page: number;
  pageSize: number;
  skip: number;
  q: string;
  sort: string;
  dir: "asc" | "desc";
  get(key: string): string | undefined;
};

export type Paged<T> = { rows: T[]; total: number; page: number; pageSize: number; pageCount: number };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Parses list query-string params, whitelisting sortable columns. */
export function parseListParams(sp: SearchParams, sortable: readonly string[], defaultSort: string, defaultDir: "asc" | "desc" = "desc"): ListParams {
  const page = Math.max(1, Number.parseInt(first(sp.page) ?? "1", 10) || 1);
  const sizeRaw = Number.parseInt(first(sp.pageSize) ?? "", 10);
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(sizeRaw) ? sizeRaw : DEFAULT_PAGE_SIZE;
  const sortRaw = first(sp.sort) ?? "";
  const sort = sortable.includes(sortRaw) ? sortRaw : defaultSort;
  const dirRaw = first(sp.dir);
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : sortable.includes(sortRaw) ? "asc" : defaultDir;
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    q,
    sort,
    dir,
    get: (key) => {
      const v = first(sp[key])?.trim();
      return v ? v : undefined;
    },
  };
}

export function paged<T>(rows: T[], total: number, p: ListParams): Paged<T> {
  return { rows, total, page: p.page, pageSize: p.pageSize, pageCount: Math.max(1, Math.ceil(total / p.pageSize)) };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const asUuid = (v: string | undefined) => (v && UUID_RE.test(v) ? v : undefined);

export function asEnum<T extends string>(v: string | undefined, values: readonly T[]): T | undefined {
  return v && (values as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** Inclusive date-only range filter → Prisma `{ gte, lt }`. */
export function dateRange(from?: string, to?: string) {
  const f = parseDateOnly(from);
  const t = parseDateOnly(to);
  if (!f && !t) return undefined;
  return {
    ...(f ? { gte: f } : {}),
    ...(t ? { lt: new Date(t.getTime() + 24 * 60 * 60 * 1000) } : {}),
  };
}

export const contains = (q: string) => ({ contains: q, mode: "insensitive" as const });
