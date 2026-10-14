"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, RotateCcw, SendHorizontal, Sparkles, Square, X } from "lucide-react";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MessageText } from "./message-text";

type ChatMessage = { role: "user" | "assistant"; content: string; error?: boolean };
type StreamEvent = { type: "text"; delta: string } | { type: "tool"; name: string } | { type: "done" } | { type: "error"; message: string };

const TOOL_LABELS: Record<string, string> = {
  search_records: "Searching records",
  list_records: "Looking up records",
  get_record: "Reading record details",
  get_sales_metrics: "Crunching sales numbers",
  get_follow_ups: "Checking follow-ups",
  search_meeting_minutes: "Searching meeting minutes",
};

const SUGGESTIONS = [
  "What are my follow-ups this week?",
  "Which leads are in discussion right now?",
  "What did we agree in recent meetings about pricing?",
  "How are sales doing this month?",
  "Show open urgent tickets",
  "Who are the contacts at our biggest account?",
];

// Conversation survives navigation and reloads in this tab only; cleared when the tab closes.
const STORAGE_KEY = "leadzen-assistant-chat";

function loadHistory(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed) ? parsed.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatMessage[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    // Storage unavailable (private mode, quota): the chat still works for this page view.
  }
}

function BotAvatar({ className }: { className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-from to-brand-to text-white shadow-sm", className)} aria-hidden>
      <Sparkles className="size-[55%]" />
    </span>
  );
}

export function AssistantPanel({ name, userFirstName, configured, isAdmin }: { name: string; userFirstName: string; configured: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Restored after mount so server and client render the same markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadHistory());
  }, []);

  useEffect(() => {
    if (!busy) saveHistory(messages.filter((m) => m.content));
  }, [messages, busy]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activity, open]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // No-op after "New conversation" cleared the list mid-answer.
  const updateLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((prev) => (prev.at(-1)?.role === "assistant" ? [...prev.slice(0, -1), fn(prev.at(-1)!)] : prev));

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy || !configured) return;
    // Failed answers are shown but not sent back as history.
    const history = [...messages.filter((m) => !m.error && m.content), { role: "user" as const, content: question }];
    setMessages([...messages, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    setActivity("Thinking");
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history.map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? `${name} is unavailable right now.`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "text") {
            setActivity(null);
            updateLast((m) => ({ ...m, content: m.content + event.delta }));
          } else if (event.type === "tool") {
            setActivity(TOOL_LABELS[event.name] ?? "Working");
            // Separate text written before and after a lookup.
            updateLast((m) => (m.content && !m.content.endsWith("\n\n") ? { ...m, content: `${m.content}\n\n` } : m));
          } else if (event.type === "error") {
            updateLast((m) => ({ ...m, content: m.content ? `${m.content}\n\n${event.message}` : event.message, error: true }));
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        updateLast((m) => ({ ...m, content: m.content || "Stopped.", error: !m.content }));
      } else {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        updateLast((m) => ({ ...m, content: message, error: true }));
      }
    } finally {
      setBusy(false);
      setActivity(null);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Chat with ${name}`}
        className={cn(
          "group fixed right-5 bottom-5 z-40 flex items-center gap-2 rounded-full bg-gradient-to-br from-brand-from to-brand-to py-2.5 pr-4 pl-2.5 text-sm font-semibold text-white shadow-lg ring-1 ring-white/20 transition hover:shadow-xl focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-none sm:right-6 sm:bottom-6",
          open && "pointer-events-none opacity-0",
        )}
      >
        <span className="grid size-8 place-items-center rounded-full bg-white/15">
          <MessageCircle className="size-4.5" aria-hidden />
        </span>
        <span className="hidden sm:inline">Ask {name}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="relative border-b bg-gradient-to-br from-brand-from to-brand-to pr-14 text-white">
            <div className="flex items-center gap-3">
              <BotAvatar className="size-10 bg-none bg-white/15 ring-1 ring-white/25" />
              <div>
                <SheetTitle className="text-white">{name}</SheetTitle>
                <SheetDescription className="text-white/80">Your sales assistant · read-only</SheetDescription>
              </div>
            </div>
            <SheetClose className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none">
              <X className="size-5" />
              <span className="sr-only">Close</span>
            </SheetClose>
          </SheetHeader>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-muted/30 px-4 py-4" aria-live="polite">
            <div className="flex gap-2.5">
              <BotAvatar className="mt-0.5 size-7" />
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-sm shadow-xs">
                <p>
                  Hi {userFirstName}! I&apos;m <strong>{name}</strong>. Ask me about your leads, accounts, contacts, meeting minutes, tickets, orders or sales numbers — I&apos;ll look them up for you.
                </p>
              </div>
            </div>

            {!configured && (
              <div className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{name} isn&apos;t switched on yet.</p>
                <p className="mt-1">
                  {isAdmin
                    ? "Set ANTHROPIC_API_KEY in the server environment and restart the app to enable the assistant."
                    : "Ask your administrator to enable the assistant."}
                </p>
              </div>
            )}

            {configured && messages.length === 0 && (
              <div className="space-y-2 pl-9">
                <p className="text-xs font-medium text-muted-foreground">Try asking</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border bg-card px-3 py-1.5 text-left text-xs font-medium text-foreground shadow-xs transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground shadow-xs">
                  {m.content}
                </div>
              ) : m.content ? (
                <div key={i} className="flex gap-2.5">
                  <BotAvatar className="mt-0.5 size-7" />
                  <div className={cn("max-w-[85%] rounded-2xl rounded-tl-sm border bg-card px-3.5 py-2.5 text-sm shadow-xs", m.error && "border-destructive/30 bg-destructive/5 text-destructive")}>
                    <MessageText text={m.content} onNavigate={() => setOpen(false)} />
                  </div>
                </div>
              ) : null,
            )}

            {activity && (
              <div className="flex items-center gap-2.5 pl-9 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> {activity}…
              </div>
            )}
          </div>

          <form
            className="flex items-end gap-2 border-t bg-card p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder={configured ? `Message ${name}…` : `${name} is not enabled`}
              aria-label={`Message ${name}`}
              disabled={!configured}
              maxLength={8000}
              rows={1}
              className="max-h-40 min-h-10 resize-none rounded-xl"
            />
            {busy ? (
              <Button type="button" size="icon" variant="outline" className="size-10 rounded-xl" onClick={() => abortRef.current?.abort()} aria-label="Stop">
                <Square className="size-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" className="size-10 rounded-xl" disabled={!configured || !input.trim()} aria-label="Send">
                <SendHorizontal className="size-4" />
              </Button>
            )}
            <Button type="button" size="icon" variant="ghost" className="size-10 rounded-xl" onClick={reset} disabled={!messages.length} aria-label="New conversation" title="New conversation">
              <RotateCcw className="size-4" />
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
