import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { globalSearch } from "@/server/services/search";
import { apiError } from "../_helpers";

/** GET /api/search?q=term → { results: SearchHit[] } */
export async function GET(req: NextRequest) {
  try {
    const ctx = await getContext();
    const results = await globalSearch(ctx, req.nextUrl.searchParams.get("q") ?? "");
    return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}
