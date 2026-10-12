import type { Ctx } from "@/server/context";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { leadOptions } from "@/server/services/leads";
import { contactOptions } from "@/server/services/contacts";
import { accountOptionsOf, userOptions } from "@/features/leads/options";

/** Options for the meeting form, loaded on the server. */
export async function meetingFormOptions(ctx: Ctx) {
  const [users, accounts, leads, contacts] = await Promise.all([listAssignableUsers(ctx), accountOptions(ctx), leadOptions(ctx), contactOptions(ctx)]);
  return {
    users: userOptions(users),
    accounts: accountOptionsOf(accounts),
    leads: leads.map((l) => ({ value: l.id, label: `${l.number} · ${l.name}`, hint: l.companyName, accountId: l.accountId })),
    contacts: contacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}`, hint: c.email ?? undefined, accountId: c.accountId })),
  };
}
