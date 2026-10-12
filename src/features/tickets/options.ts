import type { Ctx } from "@/server/context";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { contactOptions } from "@/server/services/contacts";
import { leadOptions } from "@/server/services/leads";
import { orderOptions } from "@/server/services/orders";
import { accountOptionsOf, userOptions } from "@/features/leads/options";

export async function ticketFormOptions(ctx: Ctx) {
  const [users, accounts, contacts, leads, orders] = await Promise.all([listAssignableUsers(ctx), accountOptions(ctx), contactOptions(ctx), leadOptions(ctx), orderOptions(ctx)]);
  // Support and admin users first: tickets are normally handled by agents.
  const agents = [...users].sort((a, b) => Number(b.role.key === "SUPPORT_AGENT") - Number(a.role.key === "SUPPORT_AGENT"));
  return {
    accounts: accountOptionsOf(accounts),
    contacts: contacts.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}`, hint: c.email ?? undefined, accountId: c.accountId })),
    leads: leads.map((l) => ({ value: l.id, label: `${l.number} · ${l.name}`, accountId: l.accountId })),
    orders: orders.map((o) => ({ value: o.id, label: o.number, hint: o.status.toLowerCase(), accountId: o.accountId })),
    agents: userOptions(agents),
  };
}
