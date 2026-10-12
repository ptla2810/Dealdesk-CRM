import { cookies } from "next/headers";
import { pageContext } from "@/server/context";
import { AppShell, SIDEBAR_COOKIE } from "@/components/app/app-shell";
import { APP_NAME } from "@/lib/config";

// Every page in this group is per-user and must never be statically cached.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageContext();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return (
    <AppShell
      appName={APP_NAME}
      orgName={ctx.org.name}
      user={{ name: ctx.user.name, email: ctx.user.email, roleName: ctx.user.roleName }}
      permissions={[...ctx.permissions]}
      initialCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
