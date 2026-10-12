import Link from "next/link";
import { ResetPasswordForm } from "./reset-form";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">At least 10 characters with upper- and lowercase letters and a number.</p>
      </div>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-destructive">This reset link is missing its token. Request a new link.</p>
      )}
      <Link href="/forgot-password" className="block text-center text-sm text-primary hover:underline">
        Request a new link
      </Link>
    </div>
  );
}
