import Link from "next/link";
import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissions";

export const metadata: Metadata = { title: "Access denied" };

export default async function ForbiddenPage({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  const description = need && need in PERMISSIONS ? PERMISSIONS[need as PermissionKey] : null;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <span className="mb-4 rounded-full bg-amber-500/10 p-3 text-amber-600">
        <ShieldAlert className="size-6" />
      </span>
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {description ? <>This requires the permission “{description}”. </> : null}
        Ask an administrator to update your role if you need access.
      </p>
      <Button className="mt-6" asChild>
        <Link href="/">Back to dashboard</Link>
      </Button>
    </div>
  );
}
