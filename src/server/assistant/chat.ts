/**
 * Conversational CRM assistant. Runs Claude with the read-only tools from ./tools and streams
 * text and tool activity back to the caller.
 *
 * History: the browser sends prior turns as plain text (user questions and assistant answers).
 * Tool calls, tool results and thinking from earlier turns are not replayed, so a conversation
 * stays small and nothing the client sends can carry signed model state.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import type { Ctx } from "../context";
import { ValidationError } from "../errors";
import { parseInput } from "../validate";
import { assistantTools } from "./tools";
import { APP_NAME, ASSISTANT_NAME } from "@/lib/config";

const MODEL = "claude-opus-5-5";
const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 8;

export const chatRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(8000) }))
    .min(1)
    .max(100),
});

export type AssistantEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string }
  | { type: "done" }
  | { type: "error"; message: string };

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic());

export const isAssistantConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

function systemPrompt(ctx: Ctx) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.org.timezone, dateStyle: "full" }).format(new Date());
  return `You are ${ASSISTANT_NAME}, the friendly sales assistant built into ${APP_NAME}, a B2B sales CRM. You are chatting with ${ctx.user.name} (${ctx.user.roleName} at ${ctx.org.name}). You help them find and understand their CRM data — leads, accounts, contacts, meetings and minutes of meeting (MoM), action items, products, support tickets, orders and sales metrics — and think through next steps with them.

Personality: warm, upbeat and professional, like a sharp sales-ops colleague. Greet people back, keep a natural conversational tone, and refer back to earlier messages in the conversation when it helps. Never pretend to know something you have not looked up.

Today is ${today} (organization timezone ${ctx.org.timezone}); the base currency is ${ctx.org.baseCurrency}.

How to work:
- Answer from the CRM tools, not from memory. Look records up before describing them. If the tools return nothing, say so plainly.
- For anything about what was discussed, agreed or decided in meetings, search the minutes (search_meeting_minutes) and open the meeting for detail.
- When a question is ambiguous (e.g. several matching records), list the candidates briefly and ask which one they mean.
- End with a short, useful follow-up suggestion when there is an obvious next step (e.g. "Want me to list their open tickets?"), but don't overdo it.
- You can only read data. If asked to create, edit, assign, convert or delete something, explain that the assistant is read-only and point to the page where the user can do it.
- Tool results only contain what this user is allowed to see. If a tool reports a permission error or a record is not found, tell the user rather than guessing.
- Pipeline value is a forecast, not revenue. Sales volume counts confirmed orders, not cash collected; orders are never treated as paid.
- Be concise: lead with the answer, then the supporting details. Use short bullet lists for several records (no tables or headings).
- Link records with markdown links using the "href" field from tool results, e.g. [LD-00012 Acme pumps](/leads/…). Never invent ids or links.
- Format money with its currency code and dates in a readable form.`;
}

/** Keeps the most recent turns, starting at a user message, ending with the new user message. */
function prepareHistory(messages: z.infer<typeof chatRequestSchema>["messages"]): BetaMessageParam[] {
  if (messages.at(-1)?.role !== "user") throw new ValidationError({ messages: "The last message must be from the user" });
  let recent = messages.slice(-MAX_HISTORY);
  while (recent[0]?.role !== "user") recent = recent.slice(1);
  return recent.map((m) => ({ role: m.role, content: m.content }));
}

/** A tool call was cut off by max_tokens; its input may be incomplete, so it must not run. */
class TruncatedToolInput extends Error {}

export async function runAssistant(ctx: Ctx, input: unknown, emit: (e: AssistantEvent) => void, signal?: AbortSignal) {
  const { messages } = parseInput(chatRequestSchema, input);
  const tools = assistantTools(ctx).map((t) => ({ ...t, eager_input_streaming: true }));

  let runner = anthropic().beta.messages.toolRunner(
    {
      model: MODEL,
      max_tokens: 64000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: systemPrompt(ctx),
      tools,
      messages: prepareHistory(messages),
      max_iterations: MAX_TOOL_ROUNDS,
      stream: true,
    },
    { signal },
  );

  for (let attempt = 0; ; attempt++) {
    try {
      for await (const stream of runner) {
        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
            emit({ type: "tool", name: event.content_block.name });
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            emit({ type: "text", delta: event.delta.text });
          }
        }
        const message = await stream.finalMessage();
        attempt = 0;
        const hasToolUse = message.content.some((b) => b.type === "tool_use");
        if (message.stop_reason === "max_tokens" && hasToolUse) throw new TruncatedToolInput();
        if (message.stop_reason === "refusal") {
          emit({ type: "error", message: "The assistant declined to answer this request." });
          return;
        }
      }
      emit({ type: "done" });
      return;
    } catch (err) {
      if (err instanceof Anthropic.APIError || err instanceof TruncatedToolInput || signal?.aborted || attempt >= 2) throw err;
      // Tool input JSON that could not be parsed: re-issue the turn from the conversation so far.
      runner = anthropic().beta.messages.toolRunner({ ...runner.params, stream: true }, { signal });
    }
  }
}

/** Maps SDK errors to user-safe messages; never exposes provider details. */
export function assistantErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return "The assistant is not configured correctly. Ask an administrator to check the Anthropic API key.";
  }
  if (err instanceof Anthropic.RateLimitError) return "The assistant is busy right now. Please try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the assistant service. Please try again.";
  if (err instanceof Anthropic.APIError) return "The assistant ran into a problem. Please try again.";
  return "Something went wrong. Please try again.";
}
