"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { forgotPasswordAction } from "../actions";

const schema = z.object({ email: z.string().trim().min(1, "Email is required").email("Enter a valid email address") });

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await forgotPasswordAction(values);
    if (res.ok) setSent(true);
    else setError(res.error);
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">Enter your work email and we&apos;ll send you a reset link.</p>
      </div>
      {sent ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>
            If an account exists for that email, a reset link has been sent. The link expires in 1 hour. (If email delivery is not configured, an administrator can
            find the link in the server log in development.)
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" type="email" autoComplete="email" aria-invalid={!!form.formState.errors.email} {...form.register("email")} />
            {form.formState.errors.email && <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Send reset link
          </Button>
        </form>
      )}
      <Link href="/login" className="block text-center text-sm text-primary hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
