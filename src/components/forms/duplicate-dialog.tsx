"use client";

import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DuplicateState } from "./use-server-form";

/** Shows possible duplicates; authorized users may explicitly proceed. Nothing is merged automatically. */
export function DuplicateDialog({ state, onClose, onProceed, pending, entity = "account" }: { state: DuplicateState; onClose: () => void; onProceed: () => void; pending: boolean; entity?: string }) {
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" /> Possible duplicate {entity}
          </DialogTitle>
          <DialogDescription>
            {state?.canOverride
              ? `These existing records look similar. Open one to use it instead, or create a new ${entity} anyway.`
              : `These existing records look similar. Use an existing record or ask a manager to create this ${entity}.`}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {state?.matches.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">Matched on {m.reason}</div>
              </div>
              <Link href={m.href} target="_blank" className="shrink-0 text-primary hover:underline">
                Review
              </Link>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Go back
          </Button>
          {state?.canOverride && (
            <Button onClick={onProceed} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Create anyway
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
