import { NextResponse } from "next/server";
import { getContext } from "@/server/context";
import { AppError } from "@/server/errors";
import { checkRateLimit } from "@/server/rate-limit";
import { assistantErrorMessage, isAssistantConfigured, runAssistant, type AssistantEvent } from "@/server/assistant/chat";
import { apiError } from "../_helpers";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * POST /api/assistant  { messages: [{ role, content }] }
 * → newline-delimited JSON stream of AssistantEvent ({type:"text"|"tool"|"done"|"error"}).
 */
export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await getContext();
    if (!req.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Expected JSON." } }, { status: 415 });
    }
    if (!isAssistantConfigured()) {
      return NextResponse.json({ error: { code: "NOT_CONFIGURED", message: "The assistant is not configured. Ask an administrator to set ANTHROPIC_API_KEY." } }, { status: 503 });
    }
    if (!checkRateLimit(`assistant:${ctx.userId}`, RATE_LIMIT, RATE_WINDOW_MS)) {
      return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many assistant requests. Please wait a few minutes." } }, { status: 429 });
    }
  } catch (err) {
    return apiError(err);
  }

  const body = await req.json().catch(() => null);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AssistantEvent) => {
        if (!req.signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
      };
      try {
        await runAssistant(ctx, body, emit, req.signal);
      } catch (err) {
        if (!req.signal.aborted) {
          if (!(err instanceof AppError)) console.error("[assistant] request failed", err instanceof Error ? err.message : err);
          emit({ type: "error", message: err instanceof AppError ? err.message : assistantErrorMessage(err) });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed because the client disconnected.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
