import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getDashboard, getGroupedLeadReport, getKpis } from "@/server/services/dashboard";
import { resolvePeriod } from "@/lib/dates";
import { syncDueNotifications } from "@/server/notifications";
import { createFixture, resetDatabase, type Fixture } from "../helpers";
import type { LeadStage, OrderStatus } from "@prisma/client";

let f: Fixture;
const range = (from: string, to: string) => resolvePeriod("custom", { timeZone: "UTC", from, to });
const JAN = range("2030-01-01", "2030-01-31");
const FEB = range("2030-02-01", "2030-02-28");

let n = 0;
async function lead(owner: string, stage: LeadStage, created: string, value: number, convertedAt?: string, sourceIdx = 0) {
  n++;
  return prisma.lead.create({
    data: {
      organizationId: f.org.id, number: `LD-${n}`, name: `Lead ${n}`, email: `l${n}@x.test`, phone: "+14155550100", companyName: "Co",
      sourceId: f.sources[sourceIdx]!.id, ownerId: owner, stage, estimatedValue: value.toFixed(2), currency: "USD",
      createdAt: new Date(created), convertedAt: convertedAt ? new Date(convertedAt) : null, createdById: owner, modifiedById: owner,
      stageHistory: { create: [{ toStage: "QUALIFIED", changedById: owner, changedAt: new Date(created) }, ...(stage !== "QUALIFIED" ? [{ fromStage: "QUALIFIED" as const, toStage: stage, changedById: owner, changedAt: new Date(created) }] : [])] },
    },
  });
}
let accountId = "";
async function order(owner: string, status: OrderStatus, date: string, total: number, currency = "USD", lines = 1) {
  n++;
  return prisma.order.create({
    data: {
      organizationId: f.org.id, number: `ORD-${n}`, accountId, ownerId: owner, orderDate: new Date(`${date}T00:00:00Z`), billingAddress: "x", shippingAddress: "x",
      currency, subtotal: total.toFixed(2), total: total.toFixed(2), status, createdById: owner, modifiedById: owner,
      // Several lines per order must not inflate sales volume.
      lineItems: { create: Array.from({ length: lines }, (_, i) => ({ productId: f.products.pump.id, position: i + 1, productName: "P", productSku: "S", unitOfMeasure: "Each", quantity: "1", unitPrice: (total / lines).toFixed(2), listPriceAtSale: "1", lineSubtotal: (total / lines).toFixed(2), discountAmount: "0", taxAmount: "0", lineTotal: (total / lines).toFixed(2) })) },
    },
  });
}

beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
  const { rep, rep2 } = f.users;
  accountId = (await prisma.account.create({ data: { organizationId: f.org.id, number: "ACC-1", name: "Dash Co", nameNormalized: "dash co", ownerId: rep.id, createdById: rep.id, modifiedById: rep.id } })).id;
  // January cohort: 5 leads (rep ×3, rep2 ×2)
  await lead(rep.id, "QUALIFIED", "2030-01-05T10:00:00Z", 1000);
  await lead(rep.id, "IN_DISCUSSION", "2030-01-06T10:00:00Z", 2000, undefined, 1);
  await lead(rep.id, "CONVERTED", "2030-01-07T10:00:00Z", 3000, "2030-01-20T10:00:00Z");
  await lead(rep2.id, "MATURE", "2030-01-10T10:00:00Z", 4000, undefined, 1);
  await lead(rep2.id, "CONVERTED", "2030-01-11T10:00:00Z", 5000, "2030-02-03T10:00:00Z"); // converted in Feb
  // February lead
  await lead(rep.id, "QUALIFIED", "2030-02-02T10:00:00Z", 7000);
  // Orders in January
  await order(rep.id, "DELIVERED", "2030-01-15", 1000, "USD", 3);
  await order(rep.id, "CONFIRMED", "2030-01-16", 500);
  await order(rep2.id, "SHIPPED", "2030-01-17", 250);
  await order(rep.id, "DRAFT", "2030-01-18", 9999); // excluded: draft
  await order(rep.id, "CANCELLED", "2030-01-19", 8888); // excluded: cancelled
  await order(rep2.id, "DELIVERED", "2030-01-20", 777, "EUR"); // excluded: other currency
  await order(rep.id, "DELIVERED", "2030-02-10", 4321); // outside January
});
afterAll(() => prisma.$disconnect());

describe("dashboard KPIs", () => {
  it("computes January KPIs with documented definitions", async () => {
    const k = await getKpis(f.ctx.admin, { range: JAN });
    expect(k).toMatchObject({
      totalLeads: 5,
      activeLeads: 3, // not converted
      qualifiedLeads: 1,
      convertedLeads: 1, // conversion date in January
      cohortConverted: 2, // created in Jan and now converted
      pipelineValue: 7000, // 1000 + 2000 + 4000 (open leads only)
      salesVolume: 1750, // 1000 + 500 + 250; draft, cancelled and EUR excluded; multi-line order counted once
      salesVolumeOrders: 3,
      otherCurrencyOrders: 1,
      ordersInProgress: 2, // confirmed + shipped
    });
    expect(k.conversionRate).toBeCloseTo(40, 5); // 2 / 5
    expect(k.pipelineValueAllOpen).toBe(14000); // includes the February lead
  });

  it("responds to the date filter", async () => {
    const k = await getKpis(f.ctx.admin, { range: FEB });
    expect(k).toMatchObject({ totalLeads: 1, convertedLeads: 1, salesVolume: 4321, ordersInProgress: 0 });
    expect(k.conversionRate).toBe(0);
    const empty = await getKpis(f.ctx.admin, { range: range("2031-01-01", "2031-01-31") });
    expect(empty).toMatchObject({ totalLeads: 0, salesVolume: 0, pipelineValue: 0 });
    expect(empty.conversionRate).toBeNull(); // no division by zero
  });

  it("filters by salesperson and lead source, and scopes reps to their own data", async () => {
    expect((await getKpis(f.ctx.admin, { range: JAN, ownerId: f.users.rep2.id })).totalLeads).toBe(2);
    expect((await getKpis(f.ctx.admin, { range: JAN, sourceId: f.sources[1]!.id })).totalLeads).toBe(2);
    const own = await getKpis(f.ctx.rep, { range: JAN, ownerId: f.users.rep2.id }); // owner filter cannot widen scope
    expect(own).toMatchObject({ totalLeads: 3, salesVolume: 1500 });
  });

  it("builds funnel, trends and distributions from live data", async () => {
    const d = await getDashboard(f.ctx.admin, { range: JAN });
    expect(d.funnel.map((s) => s.reached)).toEqual([5, 4, 3, 2]);
    expect(d.byStage.find((s) => s.stage === "MATURE")?.count).toBe(1);
    expect(d.conversionTrend.granularity).toBe("day");
    expect(d.conversionTrend.points).toHaveLength(31);
    expect(d.conversionTrend.points.reduce((a, p) => a + p.created, 0)).toBe(5);
    expect(d.salesTrend.points.reduce((a, p) => a + p.volume, 0)).toBe(1750);
    expect(d.orderStatus.find((o) => o.status === "CANCELLED")?.count).toBe(1);
    expect(d.performance.find((p) => p.id === f.users.rep.id)).toMatchObject({ leads: 3, converted: 1, volume: 1500, orders: 2 });
    const bySource = await getGroupedLeadReport(f.ctx.admin, { range: JAN }, "source");
    expect(bySource.reduce((a, r) => a + r.leads, 0)).toBe(5);
  });
});

describe("in-app reminders", () => {
  it("creates overdue follow-up reminders once (idempotent)", async () => {
    await prisma.lead.updateMany({ where: { organizationId: f.org.id, ownerId: f.users.rep.id, stage: "QUALIFIED" }, data: { nextFollowUpAt: new Date("2020-01-01T00:00:00Z") } });
    await syncDueNotifications(f.ctx.rep);
    await syncDueNotifications(f.ctx.rep);
    expect(await prisma.notification.count({ where: { userId: f.users.rep.id, type: "followup_overdue" } })).toBe(2);
  });
});
