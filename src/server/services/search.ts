import { prisma } from "../db";
import type { Ctx } from "../context";
import { contains } from "../list";
import { leadWhere } from "./leads";
import { accountWhere } from "./accounts";
import { contactWhere } from "./contacts";
import { ticketWhere } from "./tickets";
import { orderWhere } from "./orders";

export type SearchHit = { type: "lead" | "account" | "contact" | "product" | "ticket" | "order"; id: string; title: string; subtitle: string; href: string };

/** Global search across modules. Respects permissions, tenant and data scope. */
export async function globalSearch(ctx: Ctx, rawQuery: string, perType = 5): Promise<SearchHit[]> {
  const q = rawQuery.trim().slice(0, 100);
  if (q.length < 2) return [];
  const take = perType;
  const tasks: Promise<SearchHit[]>[] = [];

  if (ctx.can("lead.view"))
    tasks.push(
      prisma.lead
        .findMany({
          where: leadWhere(ctx, { OR: [{ name: contains(q) }, { email: contains(q) }, { companyName: contains(q) }, { number: contains(q) }] }),
          select: { id: true, number: true, name: true, companyName: true },
          take,
        })
        .then((r) => r.map((l) => ({ type: "lead" as const, id: l.id, title: l.name, subtitle: `${l.number} · ${l.companyName}`, href: `/leads/${l.id}` }))),
    );
  if (ctx.can("account.view"))
    tasks.push(
      prisma.account
        .findMany({
          where: accountWhere(ctx, { OR: [{ name: contains(q) }, { email: contains(q) }, { number: contains(q) }] }),
          select: { id: true, number: true, name: true, city: true },
          take,
        })
        .then((r) => r.map((a) => ({ type: "account" as const, id: a.id, title: a.name, subtitle: [a.number, a.city].filter(Boolean).join(" · "), href: `/accounts/${a.id}` }))),
    );
  if (ctx.can("contact.view"))
    tasks.push(
      prisma.contact
        .findMany({
          where: contactWhere(ctx, { OR: [{ firstName: contains(q) }, { lastName: contains(q) }, { email: contains(q) }, { number: contains(q) }] }),
          select: { id: true, number: true, firstName: true, lastName: true, email: true },
          take,
        })
        .then((r) => r.map((c) => ({ type: "contact" as const, id: c.id, title: `${c.firstName} ${c.lastName}`, subtitle: [c.number, c.email].filter(Boolean).join(" · "), href: `/contacts/${c.id}` }))),
    );
  if (ctx.can("product.view"))
    tasks.push(
      prisma.product
        .findMany({
          where: { organizationId: ctx.orgId, deletedAt: null, OR: [{ name: contains(q) }, { sku: contains(q) }, { number: contains(q) }] },
          select: { id: true, sku: true, name: true },
          take,
        })
        .then((r) => r.map((p) => ({ type: "product" as const, id: p.id, title: p.name, subtitle: p.sku, href: `/products/${p.id}` }))),
    );
  if (ctx.can("ticket.view"))
    tasks.push(
      prisma.ticket
        .findMany({
          where: ticketWhere(ctx, { OR: [{ subject: contains(q) }, { number: contains(q) }] }),
          select: { id: true, number: true, subject: true, status: true },
          take,
        })
        .then((r) => r.map((t) => ({ type: "ticket" as const, id: t.id, title: t.subject, subtitle: `${t.number} · ${t.status.replaceAll("_", " ").toLowerCase()}`, href: `/tickets/${t.id}` }))),
    );
  if (ctx.can("order.view"))
    tasks.push(
      prisma.order
        .findMany({
          where: orderWhere(ctx, { OR: [{ number: contains(q) }, { trackingNumber: contains(q) }, { account: { name: contains(q) } }] }),
          select: { id: true, number: true, status: true, account: { select: { name: true } } },
          take,
        })
        .then((r) => r.map((o) => ({ type: "order" as const, id: o.id, title: o.number, subtitle: `${o.account.name} · ${o.status.toLowerCase()}`, href: `/orders/${o.id}` }))),
    );

  return (await Promise.all(tasks)).flat();
}
