import type { SearchParams } from "@/server/list";

/** Builds a query string from the current params with overrides (undefined/"" removes a key). */
export function withParams(base: string, sp: SearchParams, overrides: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value) params.set(k, value);
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
