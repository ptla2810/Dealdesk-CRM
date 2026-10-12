"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/server/auth";
import { requestPasswordReset, resetPassword } from "@/server/services/password-reset";
import { runAction } from "@/server/action";

export type LoginState = { error?: string; identifier?: string } | undefined;

const LOGIN_ERRORS: Record<string, string> = {
  invalid_credentials: "Incorrect email/username or password.",
  account_disabled: "Your account has been deactivated. Contact your administrator.",
  rate_limited: "Too many sign-in attempts. Please wait 15 minutes and try again.",
};

/** Only same-site relative paths are accepted as post-login destinations (prevents open redirects). */
function safeCallback(raw: FormDataEntryValue | null) {
  const v = typeof raw === "string" ? raw : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "");
  try {
    await signIn("credentials", {
      identifier,
      password: String(formData.get("password") ?? ""),
      remember: formData.get("remember") === "on" ? "true" : "false",
      redirectTo: safeCallback(formData.get("callbackUrl")),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      const code = (err as AuthError & { code?: string }).code ?? "";
      return { error: LOGIN_ERRORS[code] ?? "Sign-in failed. Please try again.", identifier };
    }
    throw err; // NEXT_REDIRECT on success
  }
}

export async function oauthSignInAction(formData: FormData) {
  const provider = String(formData.get("provider"));
  if (provider !== "google" && provider !== "sso") return;
  await signIn(provider, { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function forgotPasswordAction(input: { email: string }) {
  return runAction(() => requestPasswordReset(input));
}

export async function resetPasswordAction(input: { token: string; password: string; confirmPassword: string }) {
  return runAction(() => resetPassword(input));
}
