"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { loginAction, oauthSignInAction, type LoginState } from "../actions";

export function LoginForm({
  callbackUrl,
  pageError,
  reset,
  googleEnabled,
  ssoEnabled,
  ssoName,
  showDemoHint,
}: {
  callbackUrl: string;
  pageError?: string;
  reset?: boolean;
  googleEnabled: boolean;
  ssoEnabled: boolean;
  ssoName: string;
  showDemoHint: boolean;
}) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginAction, undefined);
  const error = state?.error ?? pageError;

  return (
    <div className="space-y-5">
      {reset && !error && (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>Your password was updated. Sign in with your new password.</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div className="space-y-1.5">
          <Label htmlFor="identifier">Email or username</Label>
          <Input id="identifier" name="identifier" autoComplete="username" placeholder="you@company.com" required defaultValue={state?.identifier} autoFocus className="h-11" />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••••" required className="h-11" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="remember" className="size-4 accent-[var(--primary)]" />
          Keep me signed in for 30 days
        </label>
        <Button type="submit" className="h-11 w-full text-[0.95rem] font-semibold shadow-sm" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </Button>
      </form>

      {(googleEnabled || ssoEnabled) && (
        <>
          <div className="relative text-center text-xs text-muted-foreground">
            <span className="relative z-10 bg-card px-2">or continue with</span>
            <span className="absolute inset-x-0 top-1/2 border-t" />
          </div>
          <form action={oauthSignInAction} className="grid gap-2">
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            {googleEnabled && (
              <Button type="submit" name="provider" value="google" variant="outline">
                <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
                </svg>
                Google
              </Button>
            )}
            {ssoEnabled && (
              <Button type="submit" name="provider" value="sso" variant="outline">
                <KeyRound className="size-4" />
                {ssoName}
              </Button>
            )}
          </form>
        </>
      )}

      {showDemoHint && (
        <p className="rounded-lg border border-dashed bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          <strong>Development demo:</strong> sign in as <code>admin@salesflow.demo</code>, <code>manager@salesflow.demo</code>, <code>priya@salesflow.demo</code> or{" "}
          <code>support@salesflow.demo</code> with password <code>Demo@12345</code>. Hidden in production.
        </p>
      )}
    </div>
  );
}
