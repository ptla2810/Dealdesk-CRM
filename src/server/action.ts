import { Prisma } from "@prisma/client";
import { AppError, DuplicateWarning } from "./errors";
import type { ActionResult } from "@/lib/validation/common";

/**
 * Wraps a server action body: converts known errors into a typed result the UI
 * can render, and hides unexpected internals from the client.
 */
export async function runAction<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    return toActionError(err);
  }
}

export function toActionError(err: unknown): { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string; details?: unknown } {
  if (err instanceof DuplicateWarning) {
    return { ok: false, error: err.message, code: err.code, details: err.details };
  }
  if (err instanceof AppError) {
    return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return { ok: false, code: "CONFLICT", error: "A record with these unique values already exists." };
    if (err.code === "P2025") return { ok: false, code: "NOT_FOUND", error: "The record no longer exists." };
    if (err.code === "P2003") return { ok: false, code: "CONFLICT", error: "This record is linked to other records." };
  }
  // Re-throw Next.js control-flow errors (redirect/notFound).
  if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
  console.error("[action] unexpected error", err instanceof Error ? err.message : err);
  return { ok: false, code: "INTERNAL", error: "Something went wrong. Please try again." };
}
