import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { listAssignableUsers } from "@/server/services/users";
import { PageHeader } from "@/components/data/page-header";
import { AccountForm } from "@/features/accounts/account-form";
import { userOptions } from "@/features/leads/options";

export const metadata: Metadata = { title: "New account" };

export default async function NewAccountPage() {
  const ctx = await pageContext("account.create");
  const users = await listAssignableUsers(ctx);
  return (
    <>
      <PageHeader title="New account" breadcrumbs={[{ label: "Accounts & Buyers", href: "/accounts" }, { label: "New" }]} />
      <div className="max-w-4xl">
        <AccountForm mode="create" defaults={{ ownerId: ctx.userId }} owners={userOptions(users)} canAssign={ctx.can("account.assign")} cancelHref="/accounts" />
      </div>
    </>
  );
}
