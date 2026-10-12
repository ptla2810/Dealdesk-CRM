import { z } from "zod";
import type { OrderStatus } from "@prisma/client";

/**
 * Organization-level configuration stored in `Organization.settings` (JSON).
 * Every value has a default so older rows stay valid as settings are added.
 */
export const DEFAULT_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const orderStatus = z.enum(["DRAFT", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]);

export const orgSettingsSchema = z.object({
  leadWorkflow: z
    .object({
      /** Allow jumping forward more than one stage (e.g. Qualified → Mature). */
      allowSkipStages: z.boolean().default(false),
      /** Allow moving an open lead back to an earlier stage. */
      allowBackward: z.boolean().default(true),
      /** Allow reopening a converted lead (moves it back to Lead Mature and clears conversion). */
      allowReopenConverted: z.boolean().default(false),
    })
    .default({ allowSkipStages: false, allowBackward: true, allowReopenConverted: false }),
  orderWorkflow: z
    .object({
      transitions: z.record(orderStatus, z.array(orderStatus)).default(DEFAULT_ORDER_TRANSITIONS),
    })
    .default({ transitions: DEFAULT_ORDER_TRANSITIONS }),
  pricing: z
    .object({
      discountsEnabled: z.boolean().default(true),
      maxDiscountPercent: z.number().min(0).max(100).default(30),
      taxEnabled: z.boolean().default(true),
    })
    .default({ discountsEnabled: true, maxDiscountPercent: 30, taxEnabled: true }),
  tickets: z
    .object({
      requireResolutionNote: z.boolean().default(true),
    })
    .default({ requireResolutionNote: true }),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

export function parseOrgSettings(raw: unknown): OrgSettings {
  const result = orgSettingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : orgSettingsSchema.parse({});
}
