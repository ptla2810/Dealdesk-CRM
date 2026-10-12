import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addDeliveryEvent, changeOrderStatus, createOrder, getOrder, updateOrder } from "@/server/services/orders";
import { updateProduct } from "@/server/services/products";
import { createAccount } from "@/server/services/accounts";
import { toDateTimeInput } from "@/lib/dates";
import { accountInput, createFixture, expectError, resetDatabase, type Fixture } from "../helpers";

let f: Fixture;
let accountId: string;
beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
  accountId = (await createAccount(f.ctx.rep, accountInput(f))).id;
});
afterAll(() => prisma.$disconnect());

const orderInput = (lines: Record<string, unknown>[], extra: Record<string, unknown> = {}) => ({
  accountId,
  ownerId: f.users.rep.id,
  orderDate: "2030-01-10",
  expectedDeliveryDate: "2030-01-20",
  billingAddress: "1 Main St",
  shippingAddress: "1 Main St",
  currency: "USD",
  lines,
  ...extra,
});
const line = (productId: string, quantity: string, unitPrice: string, discountPercent = "0") => ({ productId, quantity, unitPrice, discountPercent });
const v = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).version;

describe("order creation & calculations", () => {
  it("calculates line and order totals on the server, ignoring client totals", async () => {
    const o = await createOrder(f.ctx.rep, {
      ...orderInput([line(f.products.pump.id, "3", "100.00", "10"), line(f.products.valve.id, "2", "19.99")]),
      total: "1.00",
      subtotal: "1.00",
    });
    // pump: 300 − 30 = 270 + 18% tax 48.60 = 318.60 ; valve: 39.98 (no tax)
    expect(o.subtotal.toFixed(2)).toBe("339.98");
    expect(o.discountTotal.toFixed(2)).toBe("30.00");
    expect(o.taxTotal.toFixed(2)).toBe("48.60");
    expect(o.total.toFixed(2)).toBe("358.58");
    expect(o.status).toBe("DRAFT");
    const full = await getOrder(f.ctx.rep, o.id);
    expect(full.lineItems.map((l) => l.lineTotal.toFixed(2))).toEqual(["318.60", "39.98"]);
    expect(full.statusHistory).toHaveLength(1);
  });

  it("rejects tampered prices unless the user may override them", async () => {
    const err = await expectError(createOrder(f.ctx.rep, orderInput([line(f.products.pump.id, "1", "1.00")])), "VALIDATION");
    expect(err.fieldErrors!["lines.0.unitPrice"]).toMatch(/list price/);
    const o = await createOrder(f.ctx.manager, orderInput([line(f.products.pump.id, "1", "90.00")], { ownerId: f.users.manager.id }));
    const full = await getOrder(f.ctx.manager, o.id);
    expect(full.lineItems[0]).toMatchObject({ unitPrice: expect.anything() });
    expect(full.lineItems[0]!.unitPrice.toFixed(2)).toBe("90.00");
    expect(full.lineItems[0]!.listPriceAtSale.toFixed(2)).toBe("100.00");
  });

  it("validates quantities, discounts, product availability, currency and duplicates", async () => {
    await expectError(createOrder(f.ctx.rep, orderInput([line(f.products.pump.id, "0", "100.00")])), "VALIDATION");
    await expectError(createOrder(f.ctx.rep, orderInput([line(f.products.pump.id, "1", "100.00", "45")])), "VALIDATION"); // > 30% max
    await expectError(createOrder(f.ctx.rep, orderInput([line(f.products.inactive.id, "1", "50.00")])), "VALIDATION");
    await expectError(createOrder(f.ctx.rep, orderInput([line(f.products.euro.id, "1", "200.00")])), "VALIDATION");
    await expectError(createOrder(f.ctx.rep, orderInput([line(f.products.pump.id, "1", "100.00"), line(f.products.pump.id, "1", "100.00")])), "VALIDATION");
    await expectError(createOrder(f.ctx.rep, orderInput([])), "VALIDATION");
    await expectError(createOrder(f.ctx.rep, orderInput([line(f.other.products.pump.id, "1", "100.00")])), "VALIDATION"); // other tenant's product
  });

  it("keeps a price snapshot when the catalogue changes", async () => {
    const o = await createOrder(f.ctx.rep, orderInput([line(f.products.valve.id, "1", "19.99")]));
    await updateProduct(f.ctx.admin, { id: f.products.valve.id, name: "Renamed valve", sku: "VALVE-1", unitOfMeasure: "Each", listPrice: "25.00", currency: "USD", status: "ACTIVE" });
    const full = await getOrder(f.ctx.rep, o.id);
    expect(full.lineItems[0]).toMatchObject({ productName: "Product VALVE-1" });
    expect(full.lineItems[0]!.unitPrice.toFixed(2)).toBe("19.99");
    expect(full.total.toFixed(2)).toBe("19.99");
  });
});

describe("order lifecycle & delivery", () => {
  it("follows the workflow, records history and prevents duplicate updates", async () => {
    const o = await createOrder(f.ctx.rep, orderInput([line(f.products.pump.id, "1", "100.00")]));
    await expectError(changeOrderStatus(f.ctx.rep, { id: o.id, version: 0, toStatus: "SHIPPED" }), "BUSINESS_RULE");
    await changeOrderStatus(f.ctx.rep, { id: o.id, version: 0, toStatus: "CONFIRMED" });
    // A second click with the same (stale) version is rejected rather than applied twice.
    await expectError(changeOrderStatus(f.ctx.rep, { id: o.id, version: 0, toStatus: "CONFIRMED" }), "CONFLICT");
    await expectError(updateOrder(f.ctx.rep, { ...orderInput([line(f.products.pump.id, "2", "100.00")]), id: o.id, version: 1 }), "BUSINESS_RULE");
    await changeOrderStatus(f.ctx.rep, { id: o.id, version: 1, toStatus: "PROCESSING" });
    await changeOrderStatus(f.ctx.rep, { id: o.id, version: 2, toStatus: "SHIPPED", carrier: "DHL", trackingNumber: "TRK123" });
    let full = await getOrder(f.ctx.rep, o.id);
    expect(full).toMatchObject({ status: "SHIPPED", deliveryStatus: "IN_TRANSIT", carrier: "DHL", trackingNumber: "TRK123" });

    const now = toDateTimeInput(new Date(), "UTC");
    await expectError(addDeliveryEvent(f.ctx.rep, { orderId: o.id, version: full.version, status: "OUT_FOR_DELIVERY", occurredAt: "2020-01-15T09:00" }), "VALIDATION");
    await expectError(addDeliveryEvent(f.ctx.rep, { orderId: o.id, version: full.version, status: "OUT_FOR_DELIVERY", occurredAt: "2099-01-15T09:00" }), "VALIDATION");
    await addDeliveryEvent(f.ctx.rep, { orderId: o.id, version: full.version, status: "OUT_FOR_DELIVERY", occurredAt: now, location: "Hub" });
    full = await getOrder(f.ctx.rep, o.id);
    await addDeliveryEvent(f.ctx.rep, { orderId: o.id, version: full.version, status: "DELIVERED", occurredAt: now, note: "Signed" });
    full = await getOrder(f.ctx.rep, o.id);
    expect(full).toMatchObject({ status: "DELIVERED", deliveryStatus: "DELIVERED" });
    expect(full.actualDeliveryDate?.toISOString().slice(0, 10)).toBe(now.slice(0, 10));
    expect(full.deliveryEvents.at(-1)?.note).toBe("Signed");
    expect(full.statusHistory.map((h) => h.toStatus)).toEqual(["DRAFT", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]);
    expect(full.deliveryEvents.map((e) => e.status)).toEqual(["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"]);
    await expectError(changeOrderStatus(f.ctx.rep, { id: o.id, version: full.version, toStatus: "CANCELLED" }), "BUSINESS_RULE");
    await expectError(addDeliveryEvent(f.ctx.rep, { orderId: o.id, version: full.version, status: "IN_TRANSIT", occurredAt: "2026-01-17T09:00" }), "BUSINESS_RULE");
  });

  it("allows editing drafts with server re-pricing, and cancellation", async () => {
    const o = await createOrder(f.ctx.rep, orderInput([line(f.products.pump.id, "1", "100.00")]));
    await updateOrder(f.ctx.rep, { ...orderInput([line(f.products.pump.id, "2", "100.00")]), id: o.id, version: 0 });
    expect((await getOrder(f.ctx.rep, o.id)).total.toFixed(2)).toBe("236.00");
    await changeOrderStatus(f.ctx.rep, { id: o.id, version: await v(o.id), toStatus: "CANCELLED", note: "Customer withdrew" });
    expect((await getOrder(f.ctx.rep, o.id)).deliveryStatus).toBe("CANCELLED");
  });
});
