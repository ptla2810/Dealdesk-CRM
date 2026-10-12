"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

export function FormActions({ pending, submitLabel, cancelHref }: { pending: boolean; submitLabel: string; cancelHref: string }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
      <Button variant="outline" asChild>
        <Link href={cancelHref}>Cancel</Link>
      </Button>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </div>
  );
}

export function FormErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircle className="size-4" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
