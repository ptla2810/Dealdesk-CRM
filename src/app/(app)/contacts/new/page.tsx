import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { PageHeader } from "@/components/data/page-header";
import { ContactForm } from "@/features/contacts/contact-form";
import { accountOptionsOf, userOptions } from "@/features/leads/options";

export const metadata: Metadata = { title: "New contact" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ accountId?: string }> }) {
  const ctx = await pageContext("contact.create");
  const { accountId } = await searchParams;
  const [users, accounts] = await Promise.all([listAssignableUsers(ctx), accountOptions(ctx)]);
  return (
    <>
      <PageHeader title="New contact" breadcrumbs={[{ label: "Contacts", href: "/contacts" }, { label: "New" }]} />
      <div className="max-w-4xl">
        <ContactForm
          mode="create"
          defaults={{ ownerId: ctx.userId, accountId: accounts.some((a) => a.id === accountId) ? accountId : "" }}
          owners={userOptions(users)}
          accounts={accountOptionsOf(accounts)}
          canChooseOwner={ctx.dataScope === "ALL"}
          cancelHref={accountId ? `/accounts/${accountId}` : "/contacts"}
        />
      </div>
    </>
  );
}
