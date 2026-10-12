import type { SearchParams } from "@/server/list";
import { resolvePeriod } from "./dates";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f-]{36}$/i;

/** Reads dashboard/report filters from the query string. */
export function readDashboardFilters(sp: SearchParams, timeZone: string) {
  return {
    range: resolvePeriod(first(sp.period) ?? "month", { timeZone, from: first(sp.from), to: first(sp.to) }),
    ownerId: UUID.test(first(sp.owner) ?? "") ? first(sp.owner) : undefined,
    sourceId: UUID.test(first(sp.source) ?? "") ? first(sp.source) : undefined,
  };
}
