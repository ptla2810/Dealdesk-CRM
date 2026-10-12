import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { listRoles } from "@/server/services/settings";
import { PageHeader } from "@/components/data/page-header";
import { CreateRoleDialog, RolePermissionsEditor } from "@/features/settings/settings-forms";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function RolesPage() {
  const ctx = await pageContext("settings.manage_roles");
  const roles = await listRoles(ctx);
  return (
    <>
      <PageHeader
        title="Roles & permissions"
        description="Permissions are enforced on the server for every action. “Own / assigned only” limits a role to records it owns or is assigned to."
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Roles & permissions" }]}
        actions={<CreateRoleDialog />}
      />
      <div className="space-y-4">
        {roles.map((r) => (
          <RolePermissionsEditor key={r.id} role={{ id: r.id, key: r.key, name: r.name, description: r.description, dataScope: r.dataScope, permissions: r.permissions.map((p) => p.permissionKey), users: r._count.users }} />
        ))}
      </div>
    </>
  );
}
