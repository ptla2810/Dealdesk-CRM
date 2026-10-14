import Link from "next/link";
import type { Metadata } from "next";
import { KeyRound, ListChecks, Plug, ScrollText, ShieldCheck, SlidersHorizontal, UserCircle, Users } from "lucide-react";
import { pageContext } from "@/server/context";
import { PageHeader } from "@/components/data/page-header";
import type { PermissionKey } from "@/lib/permissions";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS: { href: string; title: string; description: string; icon: typeof Users; permission?: PermissionKey }[] = [
  { href: "/settings/profile", title: "Profile & password", description: "Your name, job title, password and the team reporting to you.", icon: UserCircle },
  { href: "/settings/users", title: "Users", description: "Invite, edit and deactivate team members.", icon: Users, permission: "settings.manage_users" },
  { href: "/settings/roles", title: "Roles & permissions", description: "What each role can view, create, edit, assign, export and delete.", icon: ShieldCheck, permission: "settings.manage_roles" },
  { href: "/settings/configuration", title: "Lead sources & catalogue", description: "Lead sources, product categories and tax classifications.", icon: ListChecks, permission: "settings.manage_config" },
  { href: "/settings/organization", title: "Organization & workflows", description: "Currency, timezone, lead/order workflow and pricing rules.", icon: SlidersHorizontal, permission: "settings.manage_config" },
  { href: "/settings/integrations", title: "Authentication & integrations", description: "Google sign-in, enterprise SSO and email delivery status.", icon: Plug, permission: "settings.manage_config" },
  { href: "/settings/audit-log", title: "Audit log", description: "Who changed what, and when.", icon: ScrollText, permission: "audit.view" },
];

export default async function SettingsPage() {
  const ctx = await pageContext();
  const visible = SECTIONS.filter((s) => !s.permission || ctx.can(s.permission));
  return (
    <>
      <PageHeader title="Settings" description={`${ctx.org.name} · signed in as ${ctx.user.roleName}`} breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Settings" }]} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((s) => (
          <Link key={s.href} href={s.href} className="group relative flex gap-4 overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 motion-safe:hover:-translate-y-1">
            <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.05] to-transparent to-60%" />
            <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white shadow-lg shadow-primary/25 ring-1 ring-white/20 ring-inset transition-transform duration-300 motion-safe:group-hover:scale-110"><s.icon className="size-5" /></span>
            <span className="relative">
              <span className="block font-semibold group-hover:text-primary">{s.title}</span>
              <span className="block text-sm text-muted-foreground">{s.description}</span>
            </span>
          </Link>
        ))}
      </div>
      {visible.length === 1 && (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground"><KeyRound className="size-4" /> Other settings are managed by your administrator.</p>
      )}
    </>
  );
}
