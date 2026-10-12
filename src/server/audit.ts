import type { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import type { Ctx } from "./context";

export type Changes = Record<string, { from: unknown; to: unknown }>;

const serialize = (v: unknown): unknown => {
  if (v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object" && "toFixed" in v) return v.toString(); // Decimal
  return v;
};

/** Field-level diff between two snapshots, limited to `fields`. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>, fields: (keyof T)[]): Changes {
  const out: Changes = {};
  for (const f of fields) {
    if (!(f in after)) continue;
    const a = serialize(before[f]);
    const b = serialize(after[f]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[f as string] = { from: a, to: b };
  }
  return out;
}

export async function audit(
  tx: Tx,
  ctx: Pick<Ctx, "orgId" | "userId">,
  entry: { entityType: string; entityId: string; action: string; summary: string; changes?: Changes | Record<string, unknown> },
) {
  await tx.auditLog.create({
    data: {
      organizationId: ctx.orgId,
      actorId: ctx.userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      summary: entry.summary,
      changes: entry.changes && Object.keys(entry.changes).length ? (entry.changes as Prisma.InputJsonValue) : undefined,
    },
  });
}
