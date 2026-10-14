import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { listUsers } from "@/server/services/users";
import { listRoles } from "@/server/services/settings";
import { PageHeader } from "@/components/data/page-header";
import { StatusBadge } from "@/components/data/status-badge";
import { CreateUserDialog, EditUserDialog, SetPasswordDialog } from "@/features/settings/settings-forms";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const ctx = await pageContext("settings.manage_users");
  const [users, roles] = await Promise.all([listUsers(ctx), ctx.can("settings.manage_roles") ? listRoles(ctx) : null]);
  const roleOptions = (roles ?? [...new Map(users.map((u) => [u.role.id, u.role])).values()]).map((r) => ({ value: r.id, label: r.name }));
  const managerOptions = users.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.jobTitle ? `${u.name} — ${u.jobTitle}` : u.name }));
  const isAdmin = ctx.user.roleKey === "ADMIN";
  const reportCount = new Map<string, number>();
  for (const u of users) if (u.managerId) reportCount.set(u.managerId, (reportCount.get(u.managerId) ?? 0) + 1);
  return (
    <>
      <PageHeader title="Users" description={`${users.filter((u) => u.isActive).length} active of ${users.length}`} breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users" }]} actions={<CreateUserDialog roles={roleOptions} managers={managerOptions} />} />
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
        <table className="w-full text-sm">
          <caption className="sr-only">Users</caption>
          <thead className="bg-gradient-to-r from-primary/[0.06] to-muted/40"><tr className="border-b text-left text-muted-foreground"><th className="px-3 py-2 font-medium">Name</th><th className="px-3 font-medium">Email</th><th className="px-3 font-medium">Username</th><th className="px-3 font-medium">Role</th><th className="px-3 font-medium">Reports to</th><th className="px-3 font-medium">Status</th><th className="px-3 font-medium">Last sign-in</th><th className="px-3" /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2.5"><div className="font-medium">{u.name}</div><div className="text-xs text-muted-foreground">{u.jobTitle}</div></td>
                <td className="px-3">{u.email}</td>
                <td className="px-3">{u.username ?? "—"}</td>
                <td className="px-3">{u.role.name}</td>
                <td className="px-3">
                  {u.manager?.name ?? <span className="text-muted-foreground">—</span>}
                  {reportCount.get(u.id) ? <div className="text-xs text-muted-foreground">{reportCount.get(u.id)} direct report{reportCount.get(u.id) === 1 ? "" : "s"}</div> : null}
                </td>
                <td className="px-3"><StatusBadge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Inactive"}</StatusBadge></td>
                <td className="px-3 whitespace-nowrap">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, ctx.org.timezone) : "Never"}</td>
                <td className="px-3 text-right">
                  <div className="flex justify-end gap-1.5">
                    {isAdmin && u.id !== ctx.userId && <SetPasswordDialog user={{ id: u.id, name: u.name }} />}
                    <EditUserDialog user={{ id: u.id, name: u.name, roleId: u.roleId, jobTitle: u.jobTitle, managerId: u.managerId, isActive: u.isActive }} roles={roleOptions} managers={managerOptions} isSelf={u.id === ctx.userId} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
