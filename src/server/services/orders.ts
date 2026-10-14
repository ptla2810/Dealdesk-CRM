import type { DeliveryStatus, OrderStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { scopeOwner, type Ctx } from "../context";
import { BusinessRuleError, ConflictError, NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit } from "../audit";
import { nextNumber } from "../numbers";
import { notify } from "../notifications";
import { asEnum, asUuid, contains, dateRange, paged, parseListParams, type SearchParams } from "../list";
import { assertOrgUser } from "./users";
import { accountWhere } from "./accounts";
import { leadWhere } from "./leads";
import { computeLine, computeOrder, Decimal } from "@/lib/order-math";
import { parseDateOnly, parseLocalDateTime, todayUtc } from "@/lib/dates";
import { DELIVERY_STATUSES, ORDER_STATUSES, ORDER_STATUS_META, DELIVERY_STATUS_META } from "@/lib/constants";
import { checkOrderTransition } from "@/lib/workflows";
import { deliveryEventSchema, orderCreateSchema, orderStatusChangeSchema, orderUpdateSchema } from "@/lib/validation/order";

export const ORDER_SORTS = ["number", "orderDate", "total", "status", "deliveryStatus", "expectedDeliveryDate", "createdAt"] as const;

export function orderWhere(ctx: Ctx, extra: Prisma.OrderWhereInput = {}): Prisma.OrderWhereInput {
  return { organizationId: ctx.orgId, deletedAt: null, AND: [scopeOwner(ctx), extra] };
}

export function orderFilters(ctx: Ctx, sp: SearchParams) {
  const p = parseListParams(sp, ORDER_SORTS, "orderDate");
  const orderDate = dateRange(p.get("from"), p.get("to"));
  const where = orderWhere(ctx, {
    ...(p.q ? { OR: [{ number: contains(p.q) }, { account: { name: contains(p.q) } }, { trackingNumber: contains(p.q) }] } : {}),
    ...(asEnum(p.get("status"), ORDER_STATUSES) ? { status: p.get("status") as OrderStatus } : {}),
    ...(p.get("active") === "1" ? { status: { in: ["CONFIRMED", "PROCESSING", "SHIPPED"] as OrderStatus[] } } : {}),
    ...(asEnum(p.get("delivery"), DELIVERY_STATUSES) ? { deliveryStatus: p.get("delivery") as DeliveryStatus } : {}),
    ...(asUuid(p.get("account")) ? { accountId: p.get("account") } : {}),
    ...(asUuid(p.get("owner")) ? { ownerId: p.get("owner") } : {}),
    ...(asUuid(p.get("lead")) ? { leadId: p.get("lead") } : {}),
    ...(orderDate ? { orderDate } : {}),
  });
  return { p, where };
}

const listInclude = {
  account: { select: { id: true, name: true } },
  lead: { select: { id: true, number: true, name: true } },
  owner: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;

export async function listOrders(ctx: Ctx, sp: SearchParams) {
  ctx.require("order.view");
  const { p, where } = orderFilters(ctx, sp);
  const [rows, total] = await Promise.all([
    prisma.order.findMany({ where, include: listInclude, orderBy: { [p.sort]: p.dir }, skip: p.skip, take: p.pageSize }),
    prisma.order.count({ where }),
  ]);
  return paged(rows, total, p);
}

export async function exportOrders(ctx: Ctx, sp: SearchParams) {
  ctx.require("order.export");
  const { p, where } = orderFilters(ctx, sp);
  return prisma.order.findMany({ where, include: listInclude, orderBy: { [p.sort]: p.dir }, take: 10000 });
}

export async function getOrder(ctx: Ctx, id: string) {
  ctx.require("order.view");
  const order = await prisma.order.findFirst({
    where: orderWhere(ctx, { id }),
    include: {
      ...listInclude,
      createdBy: { select: { name: true } },
      modifiedBy: { select: { name: true } },
      lineItems: { orderBy: { position: "asc" }, include: { product: { select: { id: true, number: true, status: true } } } },
      statusHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { name: true } } } },
      deliveryEvents: { orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }], include: { recordedBy: { select: { name: true } } } },
      tickets: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, include: { assignedTo: { select: { name: true } } } },
    },
  });
  if (!order) throw new NotFoundError("Order");
  return order;
}

type ParsedOrder = ReturnType<typeof orderCreateSchema.parse>;

/**
 * Prices every line from the catalogue on the server. Client-submitted unit prices are only
 * accepted when they equal the list price, or when the user may override prices.
 */
async function priceLines(tx: Tx, ctx: Ctx, data: ParsedOrder, allowProductIds: string[] = []) {
  const ids = data.lines.map((l) => l.productId);
  const products = await tx.product.findMany({
    where: { id: { in: ids }, organizationId: ctx.orgId },
    include: { taxRate: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const { pricing } = ctx.settings;
  const canOverride = ctx.can("order.override_price");
  const errors: Record<string, string> = {};

  const priced = data.lines.map((line, i) => {
    const product = byId.get(line.productId);
    const orderable = product && ((product.status === "ACTIVE" && !product.deletedAt) || allowProductIds.includes(product.id));
    if (!product || !orderable) {
      errors[`lines.${i}.productId`] = "This product is not available for ordering";
      return null;
    }
    const listPrice = new Decimal(product.listPrice.toString());
    const unitPrice = new Decimal(line.unitPrice);
    if (product.currency !== data.currency && !canOverride) {
      errors[`lines.${i}.productId`] = `Priced in ${product.currency}; the order is in ${data.currency}`;
    }
    if (!unitPrice.equals(listPrice) && !canOverride && product.currency === data.currency) {
      errors[`lines.${i}.unitPrice`] = `Must equal the list price (${listPrice.toFixed(2)}); you cannot override prices`;
    }
    const discount = new Decimal(line.discountPercent || 0);
    if (discount.gt(0) && !pricing.discountsEnabled) errors[`lines.${i}.discountPercent`] = "Discounts are disabled";
    else if (discount.gt(pricing.maxDiscountPercent)) errors[`lines.${i}.discountPercent`] = `Maximum discount is ${pricing.maxDiscountPercent}%`;
    const taxRatePercent = pricing.taxEnabled && product.taxRate ? new Decimal(product.taxRate.ratePercent.toString()) : new Decimal(0);
    const totals = computeLine({ quantity: line.quantity, unitPrice, discountPercent: discount, taxRatePercent });
    return {
      productId: product.id,
      position: i + 1,
      productName: product.name,
      productSku: product.sku,
      description: product.shortDescription,
      unitOfMeasure: product.unitOfMeasure,
      quantity: line.quantity,
      unitPrice: unitPrice.toFixed(2),
      listPriceAtSale: listPrice.toFixed(2),
      discountPercent: discount.toFixed(2),
      taxRatePercent: taxRatePercent.toFixed(3),
      taxRateName: pricing.taxEnabled ? (product.taxRate?.name ?? null) : null,
      lineSubtotal: totals.lineSubtotal.toFixed(2),
      discountAmount: totals.discountAmount.toFixed(2),
      taxAmount: totals.taxAmount.toFixed(2),
      lineTotal: totals.lineTotal.toFixed(2),
    };
  });
  if (Object.keys(errors).length) throw new ValidationError(errors, "Some order lines are invalid.");
  const lines = priced.filter((l): l is NonNullable<typeof l> => l !== null);
  const totals = computeOrder(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxRatePercent: l.taxRatePercent })));
  return {
    lines,
    subtotal: totals.subtotal.toFixed(2),
    discountTotal: totals.discountTotal.toFixed(2),
    taxTotal: totals.taxTotal.toFixed(2),
    total: totals.total.toFixed(2),
  };
}

async function validateOrderLinks(ctx: Ctx, data: ParsedOrder) {
  const account = await prisma.account.findFirst({ where: accountWhere(ctx, { id: data.accountId }), select: { id: true } });
  if (!account) throw new ValidationError({ accountId: "Select an account you have access to" });
  if (data.leadId) {
    const lead = await prisma.lead.findFirst({ where: leadWhere(ctx, { id: data.leadId }), select: { accountId: true } });
    if (!lead) throw new ValidationError({ leadId: "Select a lead you have access to" });
    if (lead.accountId !== data.accountId) throw new ValidationError({ leadId: "The lead must be converted to the selected account" });
  }
}

export async function createOrder(ctx: Ctx, input: unknown) {
  ctx.require("order.create");
  const data = parseInput(orderCreateSchema, input);
  await validateOrderLinks(ctx, data);
  // OWN-scope users always own the orders they create; otherwise they could not see them.
  const ownerId = ctx.dataScope === "ALL" ? data.ownerId : ctx.userId;
  await assertOrgUser(prisma, ctx, ownerId);

  return prisma.$transaction(async (tx) => {
    const priced = await priceLines(tx, ctx, data);
    const order = await tx.order.create({
      data: {
        organizationId: ctx.orgId,
        number: await nextNumber(tx, ctx.orgId, "order", "ORD"),
        accountId: data.accountId,
        leadId: nn(data.leadId),
        ownerId,
        orderDate: parseDateOnly(data.orderDate)!,
        expectedDeliveryDate: parseDateOnly(data.expectedDeliveryDate),
        billingAddress: data.billingAddress,
        shippingAddress: data.shippingAddress,
        currency: data.currency,
        notes: nn(data.notes),
        subtotal: priced.subtotal,
        discountTotal: priced.discountTotal,
        taxTotal: priced.taxTotal,
        total: priced.total,
        status: "DRAFT",
        createdById: ctx.userId,
        modifiedById: ctx.userId,
        lineItems: { create: priced.lines },
      },
    });
    await tx.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: null, toStatus: "DRAFT", note: "Order created", changedById: ctx.userId } });
    await audit(tx, ctx, { entityType: "Order", entityId: order.id, action: "created", summary: `Created order ${order.number} (${order.currency} ${order.total.toFixed(2)})` });
    await notify(tx, ctx, { userId: ownerId, type: "order_assigned", title: `Order ${order.number} assigned to you`, link: `/orders/${order.id}` });
    return order;
  });
}

export async function updateOrder(ctx: Ctx, input: unknown) {
  ctx.require("order.edit");
  const data = parseInput(orderUpdateSchema, input);
  const existing = await prisma.order.findFirst({ where: orderWhere(ctx, { id: data.id }), include: { lineItems: true } });
  if (!existing) throw new NotFoundError("Order");
  if (existing.version !== data.version) throw new ConflictError();
  if (existing.status !== "DRAFT") throw new BusinessRuleError("Only draft orders can be edited. Confirmed orders keep their agreed lines and prices.");
  await validateOrderLinks(ctx, data);
  const ownerId = ctx.dataScope === "ALL" ? data.ownerId : existing.ownerId;
  await assertOrgUser(prisma, ctx, ownerId);

  return prisma.$transaction(async (tx) => {
    // Lines already on the draft may stay even if their product was deactivated since.
    const priced = await priceLines(tx, ctx, data, existing.lineItems.map((l) => l.productId));
    const res = await tx.order.updateMany({
      where: { id: existing.id, version: data.version, status: "DRAFT" },
      data: {
        accountId: data.accountId,
        leadId: nn(data.leadId),
        ownerId,
        orderDate: parseDateOnly(data.orderDate)!,
        expectedDeliveryDate: parseDateOnly(data.expectedDeliveryDate),
        billingAddress: data.billingAddress,
        shippingAddress: data.shippingAddress,
        currency: data.currency,
        notes: nn(data.notes),
        subtotal: priced.subtotal,
        discountTotal: priced.discountTotal,
        taxTotal: priced.taxTotal,
        total: priced.total,
        modifiedById: ctx.userId,
        version: { increment: 1 },
      },
    });
    if (res.count === 0) throw new ConflictError();
    await tx.orderLineItem.deleteMany({ where: { orderId: existing.id } });
    await tx.orderLineItem.createMany({ data: priced.lines.map((l) => ({ ...l, orderId: existing.id })) });
    await audit(tx, ctx, {
      entityType: "Order",
      entityId: existing.id,
      action: "updated",
      summary: `Updated draft order ${existing.number}`,
      changes: existing.total.toFixed(2) !== priced.total ? { total: { from: existing.total.toFixed(2), to: priced.total } } : undefined,
    });
    return { id: existing.id };
  });
}

/**
 * Moves an order through the configured workflow. The conditional update on
 * (version, status) prevents duplicate or out-of-order status updates.
 */
export async function changeOrderStatus(ctx: Ctx, input: unknown) {
  ctx.require("order.change_status");
  const data = parseInput(orderStatusChangeSchema, input);
  const order = await prisma.order.findFirst({ where: orderWhere(ctx, { id: data.id }) });
  if (!order) throw new NotFoundError("Order");
  if (order.version !== data.version) throw new ConflictError("This order was updated by someone else. Reload to see its current status.");
  const check = checkOrderTransition(order.status, data.toStatus, ctx.settings.orderWorkflow);
  if (!check.ok) throw new BusinessRuleError(check.reason);
  const now = new Date();

  const extra: Prisma.OrderUpdateManyMutationInput = {};
  let deliveryEvent: { status: DeliveryStatus; note: string } | null = null;
  if (data.toStatus === "SHIPPED") {
    extra.deliveryStatus = "IN_TRANSIT";
    if (data.carrier) extra.carrier = data.carrier;
    if (data.trackingNumber) extra.trackingNumber = data.trackingNumber;
    deliveryEvent = { status: "IN_TRANSIT", note: "Shipment dispatched" };
  } else if (data.toStatus === "DELIVERED") {
    const delivered = parseDateOnly(data.actualDeliveryDate) ?? todayUtc(now);
    if (delivered < order.orderDate) throw new ValidationError({ actualDeliveryDate: "Delivery date cannot be before the order date" });
    extra.deliveryStatus = "DELIVERED";
    extra.actualDeliveryDate = delivered;
    deliveryEvent = { status: "DELIVERED", note: "Delivered to customer" };
  } else if (data.toStatus === "CANCELLED") {
    extra.deliveryStatus = "CANCELLED";
  }

  return prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: order.id, version: data.version, status: order.status },
      data: { status: data.toStatus, modifiedById: ctx.userId, version: { increment: 1 }, ...extra },
    });
    if (res.count === 0) throw new ConflictError("This order was updated by someone else. Reload to see its current status.");
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: data.toStatus, note: nn(data.note), changedById: ctx.userId },
    });
    if (deliveryEvent) {
      await tx.deliveryEvent.create({
        data: {
          orderId: order.id,
          status: deliveryEvent.status,
          occurredAt: now,
          carrier: data.carrier || order.carrier,
          trackingNumber: data.trackingNumber || order.trackingNumber,
          note: nn(data.note) ?? deliveryEvent.note,
          recordedById: ctx.userId,
        },
      });
    }
    await audit(tx, ctx, {
      entityType: "Order",
      entityId: order.id,
      action: "status_changed",
      summary: `${order.number}: ${ORDER_STATUS_META[order.status].label} → ${ORDER_STATUS_META[data.toStatus].label}`,
      changes: { status: { from: order.status, to: data.toStatus } },
    });
    await notify(tx, ctx, { userId: order.ownerId, type: "order_status", title: `Order ${order.number} is ${ORDER_STATUS_META[data.toStatus].label}`, link: `/orders/${order.id}` });
    return { id: order.id };
  });
}

/** Records a carrier/delivery event for a shipped order. A DELIVERED event also completes the order. */
export async function addDeliveryEvent(ctx: Ctx, input: unknown) {
  ctx.require("order.change_status");
  const data = parseInput(deliveryEventSchema, input);
  const order = await prisma.order.findFirst({ where: orderWhere(ctx, { id: data.orderId }) });
  if (!order) throw new NotFoundError("Order");
  if (order.version !== data.version) throw new ConflictError();
  if (order.status !== "SHIPPED") throw new BusinessRuleError("Delivery events can only be recorded for shipped orders.");
  let occurredAt = parseLocalDateTime(data.occurredAt, ctx.org.timezone);
  if (!occurredAt) throw new ValidationError({ occurredAt: "Enter a valid date and time" });
  if (occurredAt.getTime() > Date.now() + 5 * 60 * 1000) throw new ValidationError({ occurredAt: "Delivery events cannot be in the future" });
  const shipped = await prisma.orderStatusHistory.findFirst({ where: { orderId: order.id, toStatus: "SHIPPED" }, orderBy: { changedAt: "desc" } });
  // Inputs have minute precision, so compare against the shipment time truncated to the minute.
  if (shipped && occurredAt.getTime() < Math.floor(shipped.changedAt.getTime() / 60_000) * 60_000) {
    throw new ValidationError({ occurredAt: "Delivery events cannot be dated before the order was shipped" });
  }
  // Same minute as the shipment: keep the timeline ordered after the dispatch event.
  if (shipped && occurredAt < shipped.changedAt) occurredAt = shipped.changedAt;
  const delivering = data.status === "DELIVERED";
  if (delivering) {
    const check = checkOrderTransition(order.status, "DELIVERED", ctx.settings.orderWorkflow);
    if (!check.ok) throw new BusinessRuleError(check.reason);
  }

  return prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: order.id, version: data.version, status: "SHIPPED" },
      data: {
        deliveryStatus: data.status,
        modifiedById: ctx.userId,
        version: { increment: 1 },
        ...(data.carrier ? { carrier: data.carrier } : {}),
        ...(data.trackingNumber ? { trackingNumber: data.trackingNumber } : {}),
        ...(delivering ? { status: "DELIVERED" as const, actualDeliveryDate: new Date(Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), occurredAt.getUTCDate())) } : {}),
      },
    });
    if (res.count === 0) throw new ConflictError();
    const event = await tx.deliveryEvent.create({
      data: {
        orderId: order.id,
        status: data.status,
        occurredAt,
        location: nn(data.location),
        carrier: nn(data.carrier) ?? order.carrier,
        trackingNumber: nn(data.trackingNumber) ?? order.trackingNumber,
        note: nn(data.note),
        recordedById: ctx.userId,
      },
    });
    if (delivering) {
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, fromStatus: "SHIPPED", toStatus: "DELIVERED", note: "Delivered (from delivery event)", changedById: ctx.userId },
      });
    }
    await audit(tx, ctx, {
      entityType: "Order",
      entityId: order.id,
      action: "delivery_event",
      summary: `${order.number} delivery: ${DELIVERY_STATUS_META[data.status].label}${data.location ? ` @ ${data.location}` : ""}`,
    });
    await notify(tx, ctx, { userId: order.ownerId, type: "order_delivery", title: `${order.number}: ${DELIVERY_STATUS_META[data.status].label}`, link: `/orders/${order.id}` });
    return event;
  });
}

export async function archiveOrder(ctx: Ctx, id: string) {
  ctx.require("order.delete");
  const order = await prisma.order.findFirst({ where: orderWhere(ctx, { id }) });
  if (!order) throw new NotFoundError("Order");
  if (order.status !== "DRAFT" && order.status !== "CANCELLED") throw new BusinessRuleError("Only draft or cancelled orders can be archived.");
  await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id }, data: { deletedAt: new Date(), modifiedById: ctx.userId } });
    await audit(tx, ctx, { entityType: "Order", entityId: id, action: "archived", summary: `Archived order ${order.number}` });
  });
}

export async function orderOptions(ctx: Ctx, opts: { accountId?: string } = {}) {
  return prisma.order.findMany({
    where: { organizationId: ctx.orgId, deletedAt: null, ...(opts.accountId ? { accountId: opts.accountId } : {}) },
    select: { id: true, number: true, accountId: true, status: true, orderDate: true },
    orderBy: { orderDate: "desc" },
    take: 500,
  });
}
