"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ActionResult } from "@/lib/validation/common";

/**
 * Button that runs a server action, optionally behind a confirmation dialog
 * (required for destructive or irreversible actions), then shows a toast.
 */
export function ActionButton({
  action,
  children,
  confirm,
  successMessage = "Saved",
  redirectTo,
  variant = "outline",
  size = "sm",
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: React.ReactNode;
  confirm?: { title: string; description: string; confirmLabel?: string; destructive?: boolean };
  successMessage?: string;
  redirectTo?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  const run = () =>
    start(async () => {
      const res = await action();
      setOpen(false);
      if (res.ok) {
        toast.success(res.message ?? successMessage);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } else {
        toast.error(res.error);
      }
    });

  if (!confirm) {
    return (
      <Button variant={variant} size={size} onClick={run} disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {children}
      </Button>
    );
  }
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} disabled={pending}>
        {children}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
              disabled={pending}
              className={confirm.destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {confirm.confirmLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
