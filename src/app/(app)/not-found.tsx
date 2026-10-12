import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="mb-4 rounded-full bg-muted p-3 text-muted-foreground">
        <SearchX className="size-6" />
      </span>
      <h1 className="text-xl font-semibold">Record not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have been archived, or you may not have access to it.</p>
      <Button className="mt-6" asChild>
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
