import type { Metadata } from "next";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { pageContext } from "@/server/context";
import { googleEnabled, ssoEnabled, ssoName } from "@/server/auth";
import { isEmailConfigured } from "@/server/mailer";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { APP_NAME, APP_URL } from "@/lib/config";

export const metadata: Metadata = { title: "Authentication & integrations" };

function Status({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${on ? "text-emerald-700" : "text-muted-foreground"}`}>
      {on ? <CheckCircle2 className="size-4" /> : <CircleDashed className="size-4" />} {label}
    </span>
  );
}

export default async function IntegrationsPage() {
  await pageContext("settings.manage_config");
  const code = "rounded bg-muted px-1 py-0.5 text-xs";
  return (
    <>
      <PageHeader
        title="Authentication & integrations"
        description="Status is read from server environment variables. Secrets are never shown or stored in the database."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Authentication & integrations" }]}
      />
      <div className="grid max-w-5xl gap-4 md:grid-cols-2">
        <SectionCard title="Email & password" actions={<Status on label="Enabled" />}>
          <p className="text-sm text-muted-foreground">Users sign in with email or username. Passwords are hashed with bcrypt (cost 12). Ten failed attempts lock an identifier for 15 minutes.</p>
        </SectionCard>
        <SectionCard title="Google sign-in" actions={<Status on={googleEnabled} label={googleEnabled ? "Configured" : "Not configured"} />}>
          <p className="text-sm text-muted-foreground">
            Set <code className={code}>AUTH_GOOGLE_ID</code> and <code className={code}>AUTH_GOOGLE_SECRET</code>. Authorized redirect URI: <code className={code}>{APP_URL}/api/auth/callback/google</code>. Only existing, active users with a verified matching email can sign in.
          </p>
        </SectionCard>
        <SectionCard title="Enterprise SSO (OpenID Connect)" actions={<Status on={ssoEnabled} label={ssoEnabled ? `Configured (${ssoName})` : "Not configured"} />}>
          <p className="text-sm text-muted-foreground">
            Works with Okta, Microsoft Entra ID, Auth0, Keycloak, OneLogin and other OIDC providers. Set <code className={code}>AUTH_SSO_ISSUER</code>, <code className={code}>AUTH_SSO_CLIENT_ID</code>, <code className={code}>AUTH_SSO_CLIENT_SECRET</code> and optionally{" "}
            <code className={code}>AUTH_SSO_NAME</code>. Redirect URI: <code className={code}>{APP_URL}/api/auth/callback/sso</code>. SAML is not built in — use an OIDC bridge (e.g. your IdP&apos;s OIDC app, or a broker such as Keycloak) for SAML-only providers.
          </p>
        </SectionCard>
        <SectionCard title="Outbound email" actions={<Status on={isEmailConfigured()} label={isEmailConfigured() ? "Configured" : "Not configured"} />}>
          <p className="text-sm text-muted-foreground">
            Set <code className={code}>SMTP_URL</code> and <code className={code}>EMAIL_FROM</code> to send password-reset emails and customer ticket replies. Without it, customer replies are recorded but marked “not sent”, and no marketing email is ever sent.
          </p>
        </SectionCard>
        <SectionCard title="Calendar & marketing platforms" actions={<Status on={false} label="Not available yet" />}>
          <p className="text-sm text-muted-foreground">Meetings are stored in {APP_NAME} only. Contacts carry consent and subscription fields ready for a future email-marketing integration.</p>
        </SectionCard>
      </div>
    </>
  );
}
