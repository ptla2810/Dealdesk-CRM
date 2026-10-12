import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { listUsers } from "@/server/services/users";
import { listRoles } from "@/server/services/settings";
import { PageHeader } from "@/components/data/page-header";
import { StatusBadge } from "@/components/data/status-badge";
import { CreateUserDialog, EditUserDialog } from "@/features/settings/settings-forms";
import { formatDateTime } from "@/lib/dates";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const ctx = await pageContext("settings.manage_users");
  const [users, roles] = await Promise.all([listUsers(ctx), ctx.can("settings.manage_roles") ? listRoles(ctx) : null]);
  const roleOptions = (roles ?? [...new Map(users.map((u) => [u.role.id, u.role])).values()]).map((r) => ({ value: r.id, label: r.name }));
  return (
    <>
      <PageHeader title="Users" description={`${users.filter((u) => u.isActive).length} active of ${users.length}`} breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Users" }]} actions={<CreateUserDialog roles={roleOptions} />} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Users</caption>
          <thead className="bg-muted/50"><tr className="border-b text-left text-muted-foreground"><th className="px-3 py-2 font-medium">Name</th><th className="px-3 font-medium">Email</th><th className="px-3 font-medium">Username</th><th className="px-3 font-medium">Role</th><th className="px-3 font-medium">Status</th><th className="px-3 font-medium">Last sign-in</th><th className="px-3" /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-3 py-2.5"><div className="font-medium">{u.name}</div><div className="text-xs text-muted-foreground">{u.jobTitle}</div></td>
                <td className="px-3">{u.email}</td>
                <td className="px-3">{u.username ?? "—"}</td>
                <td className="px-3">{u.role.name}</td>
                <td className="px-3"><StatusBadge tone={u.isActive ? "success" : "neutral"}>{u.isActive ? "Active" : "Inactive"}</StatusBadge></td>
                <td className="px-3 whitespace-nowrap">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, ctx.org.timezone) : "Never"}</td>
                <td className="px-3 text-right"><EditUserDialog user={{ id: u.id, name: u.name, roleId: u.roleId, jobTitle: u.jobTitle, isActive: u.isActive }} roles={roleOptions} isSelf={u.id === ctx.userId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
