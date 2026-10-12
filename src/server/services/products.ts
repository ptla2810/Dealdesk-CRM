import type { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "../db";
import type { Ctx } from "../context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { parseInput, nn } from "../validate";
import { audit, diff } from "../audit";
import { nextNumber } from "../numbers";
import { asEnum, asUuid, contains, paged, parseListParams, type SearchParams } from "../list";
import { normalizeSku } from "@/lib/normalize";
import { PRODUCT_STATUSES } from "@/lib/constants";
import { productCreateSchema, productUpdateSchema } from "@/lib/validation/product";

export const PRODUCT_SORTS = ["number", "name", "sku", "listPrice", "status", "createdAt", "updatedAt"] as const;

const productWhere = (ctx: Ctx, extra: Prisma.ProductWhereInput = {}): Prisma.ProductWhereInput => ({
  organizationId: ctx.orgId,
  deletedAt: null,
  ...extra,
});

export async function listProducts(ctx: Ctx, sp: SearchParams) {
  ctx.require("product.view");
  const p = parseListParams(sp, PRODUCT_SORTS, "name", "asc");
  const where = productWhere(ctx, {
    ...(p.q ? { OR: [{ name: contains(p.q) }, { sku: contains(p.q) }, { number: contains(p.q) }, { shortDescription: contains(p.q) }] } : {}),
    ...(asEnum(p.get("status"), PRODUCT_STATUSES) ? { status: p.get("status") as ProductStatus } : {}),
    ...(asUuid(p.get("category")) ? { categoryId: p.get("category") } : {}),
  });
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } }, taxRate: { select: { name: true, ratePercent: true } } },
      orderBy: { [p.sort]: p.dir },
      skip: p.skip,
      take: p.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return paged(rows, total, p);
}

export async function getProduct(ctx: Ctx, id: string) {
  ctx.require("product.view");
  const product = await prisma.product.findFirst({
    where: productWhere(ctx, { id }),
    include: {
      category: true,
      taxRate: true,
      createdBy: { select: { name: true } },
      modifiedBy: { select: { name: true } },
      orderLines: {
        where: { order: { deletedAt: null } },
        orderBy: { order: { orderDate: "desc" } },
        take: 20,
        include: { order: { select: { id: true, number: true, orderDate: true, status: true, currency: true, account: { select: { name: true } } } } },
      },
    },
  });
  if (!product) throw new NotFoundError("Product");
  return product;
}

async function columns(ctx: Ctx, data: ReturnType<typeof productCreateSchema.parse>) {
  if (data.categoryId) {
    const c = await prisma.productCategory.findFirst({ where: { id: data.categoryId, organizationId: ctx.orgId } });
    if (!c) throw new ValidationError({ categoryId: "Select a valid category" });
  }
  if (data.taxRateId) {
    const t = await prisma.taxRate.findFirst({ where: { id: data.taxRateId, organizationId: ctx.orgId, isActive: true } });
    if (!t) throw new ValidationError({ taxRateId: "Select an active tax classification" });
  }
  return {
    name: data.name,
    sku: data.sku.trim(),
    skuNormalized: normalizeSku(data.sku),
    categoryId: nn(data.categoryId),
    shortDescription: nn(data.shortDescription),
    description: nn(data.description),
    unitOfMeasure: data.unitOfMeasure,
    listPrice: data.listPrice,
    currency: data.currency,
    taxRateId: nn(data.taxRateId),
    status: data.status,
    imageUrl: nn(data.imageUrl),
  };
}

async function assertSkuFree(ctx: Ctx, skuNormalized: string, excludeId?: string) {
  const clash = await prisma.product.findFirst({
    // Archived products keep their SKU reserved so historic orders stay unambiguous.
    where: { organizationId: ctx.orgId, skuNormalized, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { number: true, name: true },
  });
  if (clash) throw new ConflictError("SKU must be unique.", { sku: `SKU already used by ${clash.number} ${clash.name}` });
}

export async function createProduct(ctx: Ctx, input: unknown) {
  ctx.require("product.create");
  const data = parseInput(productCreateSchema, input);
  const cols = await columns(ctx, data);
  await assertSkuFree(ctx, cols.skuNormalized);
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: { ...cols, organizationId: ctx.orgId, number: await nextNumber(tx, ctx.orgId, "product", "PRD"), createdById: ctx.userId, modifiedById: ctx.userId },
    });
    await audit(tx, ctx, { entityType: "Product", entityId: product.id, action: "created", summary: `Created product ${product.sku} ${product.name}` });
    return product;
  });
}

export async function updateProduct(ctx: Ctx, input: unknown) {
  ctx.require("product.edit");
  const data = parseInput(productUpdateSchema, input);
  const existing = await prisma.product.findFirst({ where: productWhere(ctx, { id: data.id }) });
  if (!existing) throw new NotFoundError("Product");
  const cols = await columns(ctx, data);
  if (cols.skuNormalized !== existing.skuNormalized) await assertSkuFree(ctx, cols.skuNormalized, existing.id);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({ where: { id: existing.id }, data: { ...cols, modifiedById: ctx.userId } });
    const changes = diff(existing, updated, ["name", "sku", "categoryId", "listPrice", "currency", "taxRateId", "status", "unitOfMeasure"]);
    await audit(tx, ctx, { entityType: "Product", entityId: existing.id, action: "updated", summary: `Updated product ${existing.sku}`, changes });
    return updated;
  });
}

export async function setProductStatus(ctx: Ctx, id: string, status: ProductStatus) {
  ctx.require("product.edit");
  if (!PRODUCT_STATUSES.includes(status)) throw new ValidationError({ status: "Invalid status" });
  const existing = await prisma.product.findFirst({ where: productWhere(ctx, { id }) });
  if (!existing) throw new NotFoundError("Product");
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { status, modifiedById: ctx.userId } });
    await audit(tx, ctx, {
      entityType: "Product",
      entityId: id,
      action: status === "ACTIVE" ? "activated" : "status_changed",
      summary: `Product ${existing.sku} → ${status}`,
      changes: { status: { from: existing.status, to: status } },
    });
  });
}

export async function archiveProduct(ctx: Ctx, id: string) {
  ctx.require("product.delete");
  const existing = await prisma.product.findFirst({ where: productWhere(ctx, { id }) });
  if (!existing) throw new NotFoundError("Product");
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { deletedAt: new Date(), status: "DISCONTINUED", modifiedById: ctx.userId } });
    await audit(tx, ctx, { entityType: "Product", entityId: id, action: "archived", summary: `Archived product ${existing.sku}` });
  });
}

/** Products that can be put on an order (active only), with tax data for pricing previews. */
export async function orderableProducts(ctx: Ctx, includeIds: string[] = []) {
  return prisma.product.findMany({
    where: { organizationId: ctx.orgId, OR: [{ status: "ACTIVE", deletedAt: null }, ...(includeIds.length ? [{ id: { in: includeIds } }] : [])] },
    select: {
      id: true,
      name: true,
      sku: true,
      listPrice: true,
      currency: true,
      unitOfMeasure: true,
      shortDescription: true,
      status: true,
      taxRate: { select: { name: true, ratePercent: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function catalogOptions(ctx: Ctx) {
  const [categories, taxRates] = await Promise.all([
    prisma.productCategory.findMany({ where: { organizationId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.taxRate.findMany({ where: { organizationId: ctx.orgId }, orderBy: { name: "asc" } }),
  ]);
  return { categories, taxRates };
}
