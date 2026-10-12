import { Timeline } from "./timeline";
import { formatDateTime } from "@/lib/dates";

type Entry = { id: string; summary: string; action: string; createdAt: Date; actor: { name: string } | null; changes: unknown };

function describeChanges(changes: unknown): string | null {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return null;
  const parts = Object.entries(changes as Record<string, unknown>)
    .filter(([, v]) => v && typeof v === "object" && "from" in (v as object))
    .map(([k, v]) => {
      const { from, to } = v as { from: unknown; to: unknown };
      return `${k}: ${from ?? "—"} → ${to ?? "—"}`;
    });
  return parts.length ? parts.join(" · ") : null;
}

/** Activity timeline built from audit-log entries for one record. */
export function AuditTimeline({ entries, timeZone }: { entries: Entry[]; timeZone: string }) {
  return (
    <Timeline
      items={entries.map((e) => ({
        id: e.id,
        title: e.summary,
        meta: `${e.actor?.name ?? "System"} · ${formatDateTime(e.createdAt, timeZone)}`,
        body: describeChanges(e.changes) ? <span className="text-xs">{describeChanges(e.changes)}</span> : undefined,
        tone: e.action.includes("archived") || e.action.includes("cancel") ? "danger" : e.action.includes("convert") ? "success" : "default",
      }))}
    />
  );
}
