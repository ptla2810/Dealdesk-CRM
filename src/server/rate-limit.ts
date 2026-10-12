/**
 * Minimal fixed-window rate limiter kept in process memory. Adequate for a single
 * instance; use a shared store (e.g. Redis) when running several instances.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}
