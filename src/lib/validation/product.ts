import { z } from "zod";
import { currencyCode, money, optionalText, optionalUuid, requiredText, uuid } from "./common";

export const productFields = z.object({
  name: requiredText("Product name", 200),
  sku: requiredText("SKU", 64).regex(/^[A-Za-z0-9][A-Za-z0-9._\-/]*$/, "SKU may contain letters, numbers, dot, dash, underscore and slash"),
  categoryId: optionalUuid,
  shortDescription: optionalText(300),
  description: optionalText(10000),
  unitOfMeasure: requiredText("Unit of measure", 40),
  listPrice: money("List price"),
  currency: currencyCode,
  taxRateId: optionalUuid,
  status: z.enum(["ACTIVE", "INACTIVE", "OUT_OF_STOCK", "DISCONTINUED"]),
  imageUrl: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === "" || /^https:\/\/\S+$/i.test(v), "Use an https:// image URL")
    .optional(),
});

export const productCreateSchema = productFields;
export type ProductCreateInput = z.input<typeof productCreateSchema>;
export const productUpdateSchema = productFields.extend({ id: uuid() });
export type ProductUpdateInput = z.input<typeof productUpdateSchema>;
