"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error.digest ?? error.message);
  }, [error]);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="mb-4 rounded-full bg-destructive/10 p-3 text-destructive">
        <AlertTriangle className="size-6" />
      </span>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The page could not be loaded. You can try again; if the problem persists, contact your administrator{error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
