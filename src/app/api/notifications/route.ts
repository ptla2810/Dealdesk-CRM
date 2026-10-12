import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getContext } from "@/server/context";
import { listNotifications, markNotificationsRead } from "@/server/services/notifications";
import { parseInput } from "@/server/validate";
import { apiError } from "../_helpers";

/** GET /api/notifications → { items, unread } (also generates due reminders). */
export async function GET() {
  try {
    const ctx = await getContext();
    return NextResponse.json(await listNotifications(ctx), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return apiError(err);
  }
}

/** POST /api/notifications { ids?: string[] } → marks the given (or all) notifications read. */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getContext();
    const body = parseInput(z.object({ ids: z.array(z.string().uuid()).max(200).optional() }), await req.json().catch(() => ({})));
    await markNotificationsRead(ctx, body.ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err);
  }
}
