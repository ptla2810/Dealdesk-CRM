import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { PasswordForm, ProfileForm } from "@/features/settings/settings-forms";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ctx = await pageContext();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true, jobTitle: true, phone: true, email: true, passwordHash: true, identities: { select: { provider: true } } } });
  return (
    <>
      <PageHeader title="Profile & password" description={user.email} breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Profile" }]} />
      <div className="grid max-w-4xl gap-4">
        <SectionCard title="Profile"><ProfileForm defaults={{ name: user.name, jobTitle: user.jobTitle ?? "", phone: user.phone ?? "" }} /></SectionCard>
        {user.passwordHash ? (
          <SectionCard title="Change password"><PasswordForm /></SectionCard>
        ) : (
          <SectionCard title="Password"><p className="text-sm text-muted-foreground">You sign in with an external identity provider; no SalesFlow password is set.</p></SectionCard>
        )}
        {user.identities.length > 0 && (
          <SectionCard title="Linked sign-in methods">
            <ul className="text-sm">{user.identities.map((i) => <li key={i.provider} className="capitalize">{i.provider === "sso" ? "Enterprise SSO" : i.provider}</li>)}</ul>
          </SectionCard>
        )}
      </div>
    </>
  );
}
