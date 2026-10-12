import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { assignLead, createLead, exportLeads, getLead, listLeads, archiveLead } from "@/server/services/leads";
import { createAccount, getAccount } from "@/server/services/accounts";
import { createOrder, getOrder } from "@/server/services/orders";
import { createTicket } from "@/server/services/tickets";
import { globalSearch } from "@/server/services/search";
import { updateRolePermissions } from "@/server/services/settings";
import { createUser } from "@/server/services/users";
import { buildContext } from "@/server/context";
import { accountInput, createFixture, expectError, leadInput, resetDatabase, type Fixture } from "../helpers";

let f: Fixture;
let repLeadId: string;
let accountId: string;
beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
  repLeadId = (await createLead(f.ctx.rep, leadInput(f))).id;
  accountId = (await createAccount(f.ctx.manager, accountInput(f, { ownerId: f.users.manager.id }))).id;
});
afterAll(() => prisma.$disconnect());

describe("role-based permissions (server-enforced)", () => {
  it("blocks actions a role does not hold", async () => {
    await expectError(assignLead(f.ctx.rep, { id: repLeadId, version: 0, ownerId: f.users.rep2.id }), "FORBIDDEN");
    await expectError(exportLeads(f.ctx.rep, {}), "FORBIDDEN");
    await expectError(archiveLead(f.ctx.rep, repLeadId), "FORBIDDEN");
    await expectError(createLead(f.ctx.support, leadInput(f)), "FORBIDDEN");
    await expectError(createOrder(f.ctx.support, {}), "FORBIDDEN");
    await expectError(createUser(f.ctx.manager, {}), "FORBIDDEN");
  });

  it("ignores client-supplied owner ids from users who may not assign", async () => {
    const lead = await createLead(f.ctx.rep, leadInput(f, { ownerId: f.users.manager.id, email: "x@y.example" }));
    expect(lead.ownerId).toBe(f.users.rep.id);
  });

  it("applies OWN data scope to sales reps", async () => {
    await expectError(getLead(f.ctx.rep2, repLeadId), "NOT_FOUND");
    const list = await listLeads(f.ctx.rep2, {});
    expect(list.rows.every((l) => l.ownerId === f.users.rep2.id)).toBe(true);
    expect((await getLead(f.ctx.manager, repLeadId)).id).toBe(repLeadId);
    await expectError(getAccount(f.ctx.rep, accountId), "NOT_FOUND"); // owned by manager
  });

  it("takes effect immediately when an administrator changes a role", async () => {
    const before = await buildContext(f.users.rep.id);
    expect(before!.can("lead.export")).toBe(false);
    const role = await prisma.role.findUniqueOrThrow({ where: { id: f.roles.SALES_REP! }, include: { permissions: true } });
    await updateRolePermissions(f.ctx.admin, { roleId: role.id, dataScope: "OWN", permissions: [...role.permissions.map((p) => p.permissionKey), "lead.export"] });
    const after = await buildContext(f.users.rep.id);
    expect(after!.can("lead.export")).toBe(true);
    await expectError(updateRolePermissions(f.ctx.admin, { roleId: f.roles.ADMIN!, dataScope: "ALL", permissions: [] }), "BUSINESS_RULE");
  });
});

describe("privilege escalation guards", () => {
  it("stops non-administrators from granting admin rights or editing their own role", async () => {
    const mgrRole = await prisma.role.findUniqueOrThrow({ where: { id: f.roles.SALES_MANAGER! }, include: { permissions: true } });
    await prisma.rolePermission.createMany({ data: ["settings.manage_users", "settings.manage_roles"].map((permissionKey) => ({ roleId: mgrRole.id, permissionKey })) });
    const mgr = (await buildContext(f.users.manager.id))!;
    await expectError(createUser(mgr, { name: "Sneaky", email: "sneaky@alpha.test", roleId: f.roles.ADMIN!, password: "Sneaky-Pass1" }), "FORBIDDEN");
    await expectError(updateRolePermissions(mgr, { roleId: mgrRole.id, dataScope: "ALL", permissions: ["audit.view"] }), "FORBIDDEN");
    // Managing other non-admin roles remains possible.
    await updateRolePermissions(mgr, { roleId: f.roles.SUPPORT_AGENT!, dataScope: "ALL", permissions: ["ticket.view"] });
  });
});

describe("tenant isolation", () => {
  it("cannot read another tenant's records by id", async () => {
    const beta = f.other.ctx.admin;
    await expectError(getLead(beta, repLeadId), "NOT_FOUND");
    await expectError(getAccount(beta, accountId), "NOT_FOUND");
    expect((await listLeads(beta, {})).total).toBe(0);
    expect(await globalSearch(beta, "Jane")).toEqual([]);
  });

  it("rejects cross-tenant references in writes", async () => {
    const beta = f.other.ctx.admin;
    // Owner from tenant alpha
    await expectError(createLead(beta, leadInput(f.other, { ownerId: f.users.rep.id })), "VALIDATION");
    // Source from tenant alpha
    await expectError(createLead(beta, leadInput(f.other, { sourceId: f.sources[0]!.id, ownerId: f.other.users.admin.id })), "VALIDATION");
    // Account from tenant alpha
    await expectError(createLead(beta, leadInput(f.other, { accountId, ownerId: f.other.users.admin.id })), "VALIDATION");
    await expectError(
      createTicket(beta, { subject: "x", description: "y", accountId, category: "OTHER", priority: "LOW" }),
      "VALIDATION",
    );
  });

  it("cannot reach another tenant's order", async () => {
    const order = await createOrder(f.ctx.manager, {
      accountId,
      ownerId: f.users.manager.id,
      orderDate: "2030-01-01",
      billingAddress: "A",
      shippingAddress: "A",
      currency: "USD",
      lines: [{ productId: f.products.valve.id, quantity: "1", unitPrice: "19.99", discountPercent: "0" }],
    });
    await expectError(getOrder(f.other.ctx.admin, order.id), "NOT_FOUND");
  });
});
