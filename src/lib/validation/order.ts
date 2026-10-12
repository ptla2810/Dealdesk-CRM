import { z } from "zod";
import {
  currencyCode,
  dateOnly,
  dateTimeLocal,
  money,
  optionalDateOnly,
  optionalText,
  optionalUuid,
  percent,
  quantity,
  requiredText,
  uuid,
  versionField,
} from "./common";

export const orderLineFields = z.object({
  productId: uuid("Product"),
  quantity,
  /** Agreed unit price. Must equal the catalogue price unless the user may override prices. */
  unitPrice: money("Unit price"),
  discountPercent: percent("Discount").optional(),
});

export const orderFields = z
  .object({
    accountId: uuid("Account"),
    leadId: optionalUuid,
    ownerId: uuid("Order owner"),
    orderDate: dateOnly("Order date"),
    expectedDeliveryDate: optionalDateOnly,
    billingAddress: requiredText("Billing address", 1000),
    shippingAddress: requiredText("Shipping address", 1000),
    currency: currencyCode,
    notes: optionalText(5000),
    lines: z.array(orderLineFields).min(1, "Add at least one product line").max(200),
  })
  .superRefine((v, ctx) => {
    if (v.expectedDeliveryDate && v.expectedDeliveryDate < v.orderDate) {
      ctx.addIssue({ code: "custom", path: ["expectedDeliveryDate"], message: "Expected delivery cannot be before the order date" });
    }
    const seen = new Set<string>();
    v.lines.forEach((l, i) => {
      if (seen.has(l.productId)) {
        ctx.addIssue({ code: "custom", path: ["lines", i, "productId"], message: "This product is already on the order" });
      }
      seen.add(l.productId);
    });
  });

export const orderCreateSchema = orderFields;
export type OrderCreateInput = z.input<typeof orderCreateSchema>;

export const orderUpdateSchema = z.intersection(orderFields, z.object({ id: uuid(), version: versionField }));
export type OrderUpdateInput = z.input<typeof orderUpdateSchema>;

const orderStatus = z.enum(["DRAFT", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]);

export const orderStatusChangeSchema = z.object({
  id: uuid(),
  version: versionField,
  toStatus: orderStatus,
  note: optionalText(1000),
  carrier: optionalText(120),
  trackingNumber: optionalText(120),
  actualDeliveryDate: optionalDateOnly,
});
export type OrderStatusChangeInput = z.input<typeof orderStatusChangeSchema>;

export const deliveryEventSchema = z.object({
  orderId: uuid(),
  version: versionField,
  status: z.enum(["IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION"]),
  occurredAt: dateTimeLocal("Event date and time"),
  location: optionalText(200),
  carrier: optionalText(120),
  trackingNumber: optionalText(120),
  note: optionalText(1000),
});
export type DeliveryEventInput = z.input<typeof deliveryEventSchema>;
