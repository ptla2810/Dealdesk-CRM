import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { prisma } from "@/server/db";
import { listMyTeam } from "@/server/services/users";
import { StatusBadge } from "@/components/data/status-badge";
import { PageHeader } from "@/components/data/page-header";
import { SectionCard } from "@/components/data/section-card";
import { PasswordForm, ProfileForm } from "@/features/settings/settings-forms";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ctx = await pageContext();
  const [user, team] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { name: true, jobTitle: true, phone: true, email: true, passwordHash: true, identities: { select: { provider: true } }, manager: { select: { name: true } } } }),
    listMyTeam(ctx),
  ]);
  return (
    <>
      <PageHeader title="Profile & password" description={`${user.email}${user.manager ? ` · Reports to ${user.manager.name}` : ""}`} breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Profile" }]} />
      <div className="grid max-w-4xl gap-4">
        <SectionCard title="Profile"><ProfileForm defaults={{ name: user.name, jobTitle: user.jobTitle ?? "", phone: user.phone ?? "" }} /></SectionCard>
        {user.passwordHash ? (
          <SectionCard title="Change password"><PasswordForm /></SectionCard>
        ) : (
          <SectionCard title="Password"><p className="text-sm text-muted-foreground">You sign in with an external identity provider; no {APP_NAME} password is set.</p></SectionCard>
        )}
        {team.length > 0 && (
          <SectionCard
            title="My team"
            description={`${team.length} ${team.length === 1 ? "person reports" : "people report"} to you directly or indirectly. You can see the records they own${ctx.dataScope === "ALL" ? "" : " in every list, report and dashboard"}.`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">People reporting to you</caption>
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Contact</th>
                    <th className="py-2 pr-3 font-medium">Role</th>
                    <th className="py-2 pr-3 font-medium">Reports to</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-3"><div className="font-medium">{m.name}</div><div className="text-xs text-muted-foreground">{m.jobTitle}</div></td>
                      <td className="py-2.5 pr-3"><div>{m.email}</div><div className="text-xs text-muted-foreground">{m.phone}</div></td>
                      <td className="py-2.5 pr-3">{m.role.name}</td>
                      <td className="py-2.5 pr-3">{m.manager?.name ?? "—"}</td>
                      <td className="py-2.5"><StatusBadge tone={m.isActive ? "success" : "neutral"}>{m.isActive ? "Active" : "Inactive"}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
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
