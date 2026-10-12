import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, googleEnabled, ssoEnabled, ssoName } from "@/server/auth";
import { APP_NAME } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const PAGE_ERRORS: Record<string, string> = {
  NotProvisioned: "No active account exists for that email address. Ask your administrator to invite you.",
  AccountDisabled: "Your account has been deactivated. Contact your administrator.",
  EmailNotVerified: "Your identity provider did not confirm a verified email address.",
  OAuthAccountNotLinked: "This email is linked to a different sign-in method.",
  AccessDenied: "Access denied.",
  Configuration: "Sign-in is misconfigured. Contact your administrator.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const error = sp.error ? (PAGE_ERRORS[sp.error] ?? "Sign-in failed. Please try again.") : undefined;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to {APP_NAME}</h1>
        <p className="text-sm text-muted-foreground">Use your work email or username.</p>
      </div>
      <LoginForm
        callbackUrl={sp.callbackUrl ?? "/"}
        pageError={error}
        reset={sp.reset === "1"}
        googleEnabled={googleEnabled}
        ssoEnabled={ssoEnabled}
        ssoName={ssoName}
        showDemoHint={process.env.NODE_ENV !== "production"}
      />
    </div>
  );
}
