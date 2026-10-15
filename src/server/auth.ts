/**
 * Auth.js (NextAuth v5) configuration.
 *
 * - Credentials: email or username + password (bcrypt). JWT sessions.
 * - Google OAuth and enterprise OIDC SSO are enabled only when their env vars are set.
 * - DealDesk is invite-only: an external identity can only sign in to an existing,
 *   active user with the same verified email address.
 * - "Remember me" extends the session to 30 days; otherwise it ends after 12 hours.
 * - Sessions are invalidated on password reset/deactivation via `User.sessionVersion`
 *   (checked in src/server/context.ts on every request).
 */
import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { prisma } from "./db";
import { verifyCredentials } from "./credentials";

const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const SHORT_MS = 12 * 60 * 60 * 1000;

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}
class AccountDisabled extends CredentialsSignin {
  code = "account_disabled";
}
class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
export const ssoEnabled = Boolean(process.env.AUTH_SSO_ISSUER && process.env.AUTH_SSO_CLIENT_ID && process.env.AUTH_SSO_CLIENT_SECRET);
export const ssoName = process.env.AUTH_SSO_NAME || "Company SSO";

const providers: NextAuthConfig["providers"] = [
  Credentials({
    id: "credentials",
    credentials: { identifier: {}, password: {}, remember: {} },
    async authorize(raw) {
      const result = await verifyCredentials(String(raw?.identifier ?? ""), String(raw?.password ?? ""));
      if (!result.ok) {
        if (result.reason === "disabled") throw new AccountDisabled();
        if (result.reason === "rate_limited") throw new TooManyAttempts();
        throw new InvalidCredentials();
      }
      return { ...result.user, remember: raw?.remember === "true" || raw?.remember === "on" };
    },
  }),
];

if (googleEnabled) providers.push(Google({ allowDangerousEmailAccountLinking: false }));

if (ssoEnabled) {
  providers.push({
    id: "sso",
    name: ssoName,
    type: "oidc",
    issuer: process.env.AUTH_SSO_ISSUER,
    clientId: process.env.AUTH_SSO_CLIENT_ID,
    clientSecret: process.env.AUTH_SSO_CLIENT_SECRET,
    authorization: { params: { scope: "openid email profile" } },
  });
}

export const authConfig: NextAuthConfig = {
  providers,
  session: { strategy: "jwt", maxAge: REMEMBER_MS / 1000 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: process.env.AUTH_TRUST_HOST === "true" || process.env.NODE_ENV !== "production",
  logger: {
    // Failed sign-ins are expected user errors (shown on the login page); don't log them as server errors.
    error(error) {
      const type = (error as Error & { type?: string }).type ?? error.name;
      if (type === "CredentialsSignin") return;
      console.error(`[auth] ${type}: ${error.message.split("\n")[0]}`);
    },
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider === "credentials") return true;
      // External identity: only link to an existing, active, provisioned user.
      const email = (profile?.email ?? user.email ?? "").toLowerCase();
      const verified = account.provider === "google" ? profile?.email_verified === true : profile?.email_verified !== false;
      if (!email || !verified) return "/login?error=EmailNotVerified";
      const existing = await prisma.user.findUnique({ where: { email } });
      if (!existing) return "/login?error=NotProvisioned";
      if (!existing.isActive) return "/login?error=AccountDisabled";
      await prisma.userIdentity.upsert({
        where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
        create: { userId: existing.id, provider: account.provider, providerAccountId: account.providerAccountId },
        update: {},
      });
      await prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
      return true;
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        // First call after sign-in: resolve our user id and session lifetime.
        const dbUser =
          account.provider === "credentials"
            ? await prisma.user.findUnique({ where: { id: user.id! } })
            : await prisma.user.findUnique({ where: { email: (user.email ?? "").toLowerCase() } });
        if (!dbUser) return null;
        const remember = account.provider === "credentials" ? Boolean((user as { remember?: boolean }).remember) : true;
        token.uid = dbUser.id;
        token.sv = dbUser.sessionVersion;
        token.sessionExpiresAt = Date.now() + (remember ? REMEMBER_MS : SHORT_MS);
      }
      if (typeof token.sessionExpiresAt === "number" && Date.now() > token.sessionExpiresAt) return null;
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      session.sessionVersion = (token.sv as number | undefined) ?? 0;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

declare module "next-auth" {
  interface Session {
    sessionVersion: number;
  }
}
