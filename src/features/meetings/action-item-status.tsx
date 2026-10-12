"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { selectClass } from "@/components/forms/fields";
import { ACTION_ITEM_STATUSES, ACTION_ITEM_STATUS_META } from "@/lib/constants";
import { updateActionItemStatusAction } from "@/app/(app)/meetings/actions";
import { cn } from "@/lib/utils";
import type { ActionItemStatus } from "@prisma/client";

export function ActionItemStatusSelect({ id, status, disabled }: { id: string; status: ActionItemStatus; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Action item status"
        className={cn(selectClass, "h-8 w-36")}
        value={status}
        disabled={disabled || pending}
        onChange={(e) =>
          start(async () => {
            const res = await updateActionItemStatusAction(id, e.target.value);
            if (res.ok) {
              toast.success("Action item updated");
              router.refresh();
            } else toast.error(res.error);
          })
        }
      >
        {ACTION_ITEM_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ACTION_ITEM_STATUS_META[s].label}
          </option>
        ))}
      </select>
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
