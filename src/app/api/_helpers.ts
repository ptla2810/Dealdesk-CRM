import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";

/** Consistent JSON error responses for route handlers; internal details never leak. */
export function apiError(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, fieldErrors: err.fieldErrors } }, { status: err.status });
  }
  console.error("[api] unexpected error", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
}
