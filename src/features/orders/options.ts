import type { Ctx } from "@/server/context";
import { listAssignableUsers } from "@/server/services/users";
import { accountOptions } from "@/server/services/accounts";
import { leadOptions } from "@/server/services/leads";
import { orderableProducts } from "@/server/services/products";
import { userOptions } from "@/features/leads/options";
import type { OrderProduct } from "./order-form";

export async function orderFormOptions(ctx: Ctx, includeProductIds: string[] = []) {
  const [users, accounts, leads, products] = await Promise.all([listAssignableUsers(ctx), accountOptions(ctx), leadOptions(ctx), orderableProducts(ctx, includeProductIds)]);
  return {
    owners: userOptions(users),
    accounts: accounts.map((a) => ({
      value: a.id,
      label: `${a.number} · ${a.name}`,
      address: [a.name, a.addressLine, [a.city, a.state, a.postalCode].filter(Boolean).join(" "), a.country].filter(Boolean).join(", "),
    })),
    leads: leads.filter((l) => l.stage === "CONVERTED").map((l) => ({ value: l.id, label: `${l.number} · ${l.name}`, accountId: l.accountId })),
    products: products.map<OrderProduct>((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      listPrice: p.listPrice.toFixed(2),
      currency: p.currency,
      unitOfMeasure: p.unitOfMeasure,
      taxRatePercent: p.taxRate ? p.taxRate.ratePercent.toString() : "0",
      taxName: p.taxRate?.name ?? null,
      status: p.status,
    })),
  };
}
