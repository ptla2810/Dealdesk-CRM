"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/validation/common";

export type DuplicateMatch = { id: string; label: string; reason: string; href: string };
export type DuplicateState = { matches: DuplicateMatch[]; canOverride: boolean; values: unknown } | null;

/**
 * Submits RHF values to a server action and maps the result back onto the form:
 * field errors → inline messages, duplicate warnings → a review dialog, success → toast + navigation.
 */
export function useServerForm<T extends FieldValues, R>(
  form: UseFormReturn<T>,
  action: (values: T) => Promise<ActionResult<R>>,
  opts: { successMessage: string; onSuccess?: (data: R) => string | void },
) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateState>(null);

  const submit = async (values: T) => {
    setFormError(null);
    const res = await action(values);
    if (res.ok) {
      setDuplicates(null);
      toast.success(opts.successMessage);
      const href = opts.onSuccess?.(res.data);
      if (href) router.push(href);
      router.refresh();
      return;
    }
    if (res.code === "DUPLICATE_WARNING") {
      const d = res.details as { matches: DuplicateMatch[]; canOverride: boolean };
      setDuplicates({ ...d, values });
      return;
    }
    if (res.fieldErrors) {
      let focused = false;
      for (const [k, msg] of Object.entries(res.fieldErrors)) {
        if (k === "_form") continue;
        form.setError(k as Path<T>, { type: "server", message: msg }, { shouldFocus: !focused });
        focused = true;
      }
    }
    setFormError(res.error);
    toast.error(res.error);
  };

  return { submit, formError, duplicates, setDuplicates };
}
