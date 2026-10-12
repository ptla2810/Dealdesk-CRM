import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { getAccount } from "@/server/services/accounts";
import { listAssignableUsers } from "@/server/services/users";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { AccountForm } from "@/features/accounts/account-form";
import { userOptions } from "@/features/leads/options";

export const metadata: Metadata = { title: "Edit account" };

export default async function EditAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("account.edit");
  const { id } = await params;
  const [a, users] = await Promise.all([orNotFound(getAccount(ctx, id)), listAssignableUsers(ctx)]);
  return (
    <>
      <PageHeader title={`Edit ${a.name}`} breadcrumbs={[{ label: "Accounts & Buyers", href: "/accounts" }, { label: a.number, href: `/accounts/${a.id}` }, { label: "Edit" }]} />
      <div className="max-w-4xl">
        <AccountForm
          mode="edit"
          defaults={{
            id: a.id,
            name: a.name,
            email: a.email ?? "",
            phone: a.phone ?? "",
            website: a.website ?? "",
            industry: a.industry ?? "",
            addressLine: a.addressLine ?? "",
            country: a.country ?? "",
            state: a.state ?? "",
            city: a.city ?? "",
            postalCode: a.postalCode ?? "",
            ownerId: a.ownerId,
            description: a.description ?? "",
            status: a.status,
          }}
          owners={userOptions(users)}
          canAssign={ctx.can("account.assign")}
          cancelHref={`/accounts/${a.id}`}
        />
      </div>
    </>
  );
}
