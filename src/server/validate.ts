import type { z } from "zod";
import { ValidationError } from "./errors";

/** Parses input with a Zod schema, converting issues into field errors. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  throw new ValidationError(fieldErrors);
}

/** "" / undefined → null, for optional relation and text columns. */
export const nn = <T>(v: T | "" | undefined | null): T | null => (v === "" || v === undefined ? null : v);
