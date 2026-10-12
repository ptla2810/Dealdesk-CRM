"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Lock, Send } from "lucide-react";
import type { TicketPriority, TicketStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectClass, type Option } from "@/components/forms/fields";
import { TICKET_PRIORITIES, TICKET_PRIORITY_META, TICKET_STATUS_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { addTicketMessageAction, assignTicketAction, changeTicketPriorityAction, changeTicketStatusAction } from "@/app/(app)/tickets/actions";
import type { ActionResult } from "@/lib/validation/common";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        onOk?.();
        router.refresh();
      } else toast.error(res.fieldErrors ? Object.values(res.fieldErrors)[0] ?? res.error : res.error);
    });
  return { pending, run };
}

export function TicketControls({
  id,
  version,
  priority,
  assignedToId,
  statusTargets,
  agents,
  canEdit,
  canAssign,
  requireResolutionNote,
}: {
  id: string;
  version: number;
  priority: TicketPriority;
  assignedToId: string | null;
  statusTargets: TicketStatus[];
  agents: Option[];
  canEdit: boolean;
  canAssign: boolean;
  requireResolutionNote: boolean;
}) {
  const { pending, run } = useRun();
  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState("");

  const changeStatus = (to: TicketStatus) => {
    if (to === "RESOLVED") {
      setResolveOpen(true);
      return;
    }
    run(() => changeTicketStatusAction({ id, version, status: to }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Status</Label>
        <div className="flex flex-wrap gap-1.5">
          {statusTargets.map((s) => (
            <Button key={s} size="xs" variant="outline" disabled={!canEdit || pending} onClick={() => changeStatus(s)}>
              → {TICKET_STATUS_META[s].label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ticket-priority">Priority</Label>
        <select id="ticket-priority" className={selectClass} value={priority} disabled={!canEdit || pending} onChange={(e) => run(() => changeTicketPriorityAction({ id, version, priority: e.target.value }))}>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>{TICKET_PRIORITY_META[p].label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ticket-agent">Assigned agent</Label>
        <select id="ticket-agent" className={selectClass} value={assignedToId ?? ""} disabled={!canAssign || pending} onChange={(e) => run(() => assignTicketAction({ id, version, assignedToId: e.target.value }))}>
          <option value="">Unassigned</option>
          {agents.map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </select>
        {!canAssign && <p className="text-xs text-muted-foreground">You cannot reassign tickets.</p>}
      </div>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Saving" />}

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve ticket</DialogTitle>
            <DialogDescription>Describe how the issue was resolved{requireResolutionNote ? " (required)" : ""}.</DialogDescription>
          </DialogHeader>
          <Label htmlFor="resolution" className="sr-only">Resolution note</Label>
          <Textarea id="resolution" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button
              disabled={pending || (requireResolutionNote && !note.trim())}
              onClick={() => run(() => changeTicketStatusAction({ id, version, status: "RESOLVED", resolutionNote: note }), () => setResolveOpen(false))}
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function MessageComposer({ ticketId, canReplyCustomer, emailConfigured, disabled }: { ticketId: string; canReplyCustomer: boolean; emailConfigured: boolean; disabled: boolean }) {
  const { pending, run } = useRun();
  const [kind, setKind] = useState<"INTERNAL_NOTE" | "CUSTOMER_REPLY">("INTERNAL_NOTE");
  const [body, setBody] = useState("");
  if (disabled) return <p className="text-sm text-muted-foreground">Reopen the ticket to add notes or replies.</p>;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex gap-1" role="tablist" aria-label="Message type">
        <button type="button" role="tab" aria-selected={kind === "INTERNAL_NOTE"} onClick={() => setKind("INTERNAL_NOTE")} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm", kind === "INTERNAL_NOTE" ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200" : "text-muted-foreground hover:bg-muted")}>
          <Lock className="size-3.5" /> Internal note
        </button>
        {canReplyCustomer && (
          <button type="button" role="tab" aria-selected={kind === "CUSTOMER_REPLY"} onClick={() => setKind("CUSTOMER_REPLY")} className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm", kind === "CUSTOMER_REPLY" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            <Send className="size-3.5" /> Customer reply
          </button>
        )}
      </div>
      <Label htmlFor="ticket-message" className="sr-only">Message</Label>
      <Textarea id="ticket-message" rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={kind === "INTERNAL_NOTE" ? "Visible to your team only…" : "Visible to the customer…"} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {kind === "CUSTOMER_REPLY"
            ? emailConfigured
              ? "Will be emailed to the ticket contact."
              : "No email provider is configured: the reply is recorded on the ticket but NOT sent to the customer."
            : "Internal notes are never shown to customers."}
        </p>
        <Button
          size="sm"
          disabled={pending || !body.trim()}
          onClick={() => run(() => addTicketMessageAction({ ticketId, kind, body }), () => setBody(""))}
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {kind === "INTERNAL_NOTE" ? "Add note" : "Add reply"}
        </Button>
      </div>
    </div>
  );
}
