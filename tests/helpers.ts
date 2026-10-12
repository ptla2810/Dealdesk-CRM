/**
 * Test fixtures for integration tests. Each test file calls `resetDatabase()` and
 * `createFixture()` to get a fresh tenant with the four system roles and a second
 * tenant for isolation checks.
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db";
import { buildContext, type Ctx } from "@/server/context";
import { ALL_PERMISSIONS, DEFAULT_ROLE_GRANTS, PERMISSIONS } from "@/lib/permissions";
import { DEFAULT_LEAD_SOURCES } from "@/lib/constants";
import { DEFAULT_ORDER_TRANSITIONS } from "@/lib/settings";
import type { Prisma } from "@prisma/client";

export const PASSWORD = "Test@123456";

export async function resetDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/test/i.test(new URL(url).pathname)) throw new Error("Refusing to truncate a non-test database");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

let hash: string | undefined;

async function createTenant(slug: string, settings: Prisma.InputJsonValue = {}) {
  hash ??= await bcrypt.hash(PASSWORD, 4); // low cost: tests only
  const org = await prisma.organization.create({
    data: {
      name: `Org ${slug}`,
      slug,
      baseCurrency: "USD",
      timezone: "UTC",
      settings: {
        leadWorkflow: { allowSkipStages: false, allowBackward: true, allowReopenConverted: false },
        orderWorkflow: { transitions: DEFAULT_ORDER_TRANSITIONS },
        pricing: { discountsEnabled: true, maxDiscountPercent: 30, taxEnabled: true },
        tickets: { requireResolutionNote: true },
        ...(settings as object),
      },
    },
  });
  const roles: Record<string, string> = {};
  for (const [key, def] of Object.entries(DEFAULT_ROLE_GRANTS)) {
    const role = await prisma.role.create({
      data: { organizationId: org.id, key, name: def.name, isSystem: true, dataScope: def.dataScope, permissions: { create: [...new Set(def.permissions)].map((permissionKey) => ({ permissionKey })) } },
    });
    roles[key] = role.id;
  }
  const user = (name: string, role: string, extra: Partial<Prisma.UserUncheckedCreateInput> = {}) =>
    prisma.user.create({ data: { organizationId: org.id, roleId: roles[role]!, name, email: `${name.toLowerCase()}@${slug}.test`, username: `${name.toLowerCase()}_${slug}`, passwordHash: hash, ...extra } });
  const users = {
    admin: await user("Admin", "ADMIN"),
    manager: await user("Manager", "SALES_MANAGER"),
    rep: await user("Rep", "SALES_REP"),
    rep2: await user("RepTwo", "SALES_REP"),
    support: await user("Support", "SUPPORT_AGENT"),
  };
  const sources = await Promise.all(DEFAULT_LEAD_SOURCES.map((name, i) => prisma.leadSource.create({ data: { organizationId: org.id, name, isSystem: true, sortOrder: i } })));
  const tax = await prisma.taxRate.create({ data: { organizationId: org.id, name: "GST 18%", ratePercent: "18" } });
  const product = (sku: string, price: string, extra: Partial<Prisma.ProductUncheckedCreateInput> = {}) =>
    prisma.product.create({
      data: { organizationId: org.id, number: `PRD-${sku}`, name: `Product ${sku}`, sku, skuNormalized: sku.toUpperCase(), listPrice: price, currency: "USD", unitOfMeasure: "Each", createdById: users.admin.id, modifiedById: users.admin.id, ...extra },
    });
  const products = {
    pump: await product("PUMP-1", "100.00", { taxRateId: tax.id }),
    valve: await product("VALVE-1", "19.99"),
    inactive: await product("OLD-1", "50.00", { status: "INACTIVE" }),
    euro: await product("EUR-1", "200.00", { currency: "EUR" }),
  };
  const ctx = async (u: { id: string }) => (await buildContext(u.id))!;
  return {
    org,
    roles,
    users,
    sources,
    tax,
    products,
    ctx: {
      admin: await ctx(users.admin),
      manager: await ctx(users.manager),
      rep: await ctx(users.rep),
      rep2: await ctx(users.rep2),
      support: await ctx(users.support),
    } as Record<keyof typeof users, Ctx>,
  };
}

export async function createFixture(settings?: Prisma.InputJsonValue) {
  for (const key of ALL_PERMISSIONS) {
    const [module, action] = key.split(".") as [string, string];
    await prisma.permission.upsert({ where: { key }, create: { key, module, action, description: PERMISSIONS[key] }, update: {} });
  }
  const a = await createTenant("alpha", settings);
  const b = await createTenant("beta");
  return { ...a, other: b };
}

export type Tenant = Awaited<ReturnType<typeof createTenant>>;
export type Fixture = Awaited<ReturnType<typeof createFixture>>;

export const leadInput = (f: Tenant, extra: Record<string, unknown> = {}) => ({
  name: "Jane Buyer",
  email: "Jane.Buyer@Example.com",
  phone: "+1 415 555 0142",
  companyName: "Acme Industrial Inc.",
  sourceId: f.sources[0]!.id,
  ownerId: f.users.rep.id,
  stage: "QUALIFIED",
  estimatedValue: "15000",
  description: "Needs 20 pumps for a new plant.",
  nextFollowUpAt: "2030-01-15",
  ...extra,
});

export const accountInput = (f: Tenant, extra: Record<string, unknown> = {}) => ({
  name: "Globex Corporation",
  email: "buyer@globex.example",
  phone: "+1 212 555 0100",
  ownerId: f.users.rep.id,
  status: "ACTIVE",
  country: "US",
  ...extra,
});

/** Expects a promise to reject with an AppError of the given class name / code. */
export async function expectError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    const err = e as { code?: string; name?: string; fieldErrors?: Record<string, string> };
    if (err.code !== code) throw new Error(`Expected ${code} but got ${err.code ?? err.name}: ${(e as Error).message}`);
    return err;
  }
  throw new Error(`Expected ${code} but the call succeeded`);
}
