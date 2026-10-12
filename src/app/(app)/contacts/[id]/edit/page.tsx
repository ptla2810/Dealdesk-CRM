import type { Metadata } from "next";
import { pageContext } from "@/server/context";
import { getContact } from "@/server/services/contacts";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { orNotFound } from "@/server/page-helpers";
import { PageHeader } from "@/components/data/page-header";
import { ContactForm } from "@/features/contacts/contact-form";
import { accountOptionsOf, userOptions } from "@/features/leads/options";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("contact.edit");
  const { id } = await params;
  const [c, users, accounts] = await Promise.all([orNotFound(getContact(ctx, id)), listAssignableUsers(ctx), accountOptions(ctx)]);
  return (
    <>
      <PageHeader title={`Edit ${c.firstName} ${c.lastName}`} breadcrumbs={[{ label: "Contacts", href: "/contacts" }, { label: c.number, href: `/contacts/${c.id}` }, { label: "Edit" }]} />
      <div className="max-w-4xl">
        <ContactForm
          mode="edit"
          defaults={{
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            email: c.email ?? "",
            phone: c.phone ?? "",
            designation: c.designation ?? "",
            department: c.department ?? "",
            accountId: c.accountId ?? "",
            ownerId: c.ownerId,
            preferredChannel: c.preferredChannel,
            status: c.status,
            source: c.source ?? "",
            notes: c.notes ?? "",
            marketingConsent: c.marketingConsent,
            consentSource: c.consentSource ?? "",
            subscriptionStatus: c.subscriptionStatus,
          }}
          owners={userOptions(users)}
          accounts={accountOptionsOf(accounts)}
          canChooseOwner={ctx.dataScope === "ALL"}
          cancelHref={`/contacts/${c.id}`}
        />
      </div>
    </>
  );
}
