import type { Tx } from "./db";

/**
 * Allocates the next human-readable number for an entity within an organization
 * (LD-00001, ORD-00001 …). Uses an atomic upsert so concurrent requests never
 * receive the same number.
 */
export async function nextNumber(tx: Tx, organizationId: string, key: string, prefix: string): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("organizationId", "key", "value")
    VALUES (${organizationId}::uuid, ${key}, 1)
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${prefix}-${String(rows[0]!.value).padStart(5, "0")}`;
}
