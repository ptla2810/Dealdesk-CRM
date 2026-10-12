import { notFound } from "next/navigation";
import { NotFoundError } from "./errors";

/** Resolves a service lookup, rendering the 404 page when the record is missing or out of scope. */
export async function orNotFound<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
