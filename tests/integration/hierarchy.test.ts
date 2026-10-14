import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { buildContext, type Ctx } from "@/server/context";
import { createLead, getLead, listLeads } from "@/server/services/leads";
import { globalSearch } from "@/server/services/search";
import { getKpis } from "@/server/services/dashboard";
import { adminSetPassword, listMyTeam, updateUser } from "@/server/services/users";
import { verifyCredentials } from "@/server/credentials";
import { resolvePeriod } from "@/lib/dates";
import { createFixture, expectError, leadInput, PASSWORD, resetDatabase, type Fixture } from "../helpers";

let f: Fixture;
let repLead: string;
let rep2Lead: string;
const ctxOf = async (id: string) => (await buildContext(id)) as Ctx;
const userInput = (u: { id: string; name: string; roleId: string }, managerId: string) => ({ id: u.id, name: u.name, roleId: u.roleId, jobTitle: "", managerId, isActive: true });

beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
  repLead = (await createLead(f.ctx.rep, leadInput(f))).id;
  rep2Lead = (await createLead(f.ctx.rep2, leadInput(f, { name: "Team Member Lead", email: "tm@example.com", ownerId: f.users.rep2.id }))).id;
  // RepTwo reports to Rep. Both roles have OWN data scope.
  await updateUser(f.ctx.admin, userInput(f.users.rep2, f.users.rep.id));
});
afterAll(() => prisma.$disconnect());

describe("reporting-manager visibility", () => {
  it("a manager with OWN scope sees records owned by their reports, but not the other way round", async () => {
    const lead = await ctxOf(f.users.rep.id);
    expect(lead.teamUserIds).toEqual(expect.arrayContaining([f.users.rep.id, f.users.rep2.id]));
    expect((await listLeads(lead, {})).total).toBe(2);
    expect((await getLead(lead, rep2Lead)).id).toBe(rep2Lead);
    expect((await globalSearch(lead, "Team Member")).map((h) => h.id)).toContain(rep2Lead);
    const kpis = await getKpis(lead, { range: resolvePeriod("year", { timeZone: "UTC" }) });
    expect(kpis.totalLeads).toBe(2);

    const member = await ctxOf(f.users.rep2.id);
    expect((await listLeads(member, {})).total).toBe(1);
    await expectError(getLead(member, repLead), "NOT_FOUND");
  });

  it("indirect reports are included", async () => {
    await updateUser(f.ctx.admin, userInput(f.users.support, f.users.rep2.id));
    const lead = await ctxOf(f.users.rep.id);
    expect(lead.teamUserIds).toContain(f.users.support.id);
    expect((await listMyTeam(lead)).map((u) => u.name).sort()).toEqual(["RepTwo", "Support"]);
    await updateUser(f.ctx.admin, userInput(f.users.support, ""));
  });

  it("an owner filter cannot widen the data scope", async () => {
    const member = await ctxOf(f.users.rep2.id);
    expect((await listLeads(member, { owner: f.users.rep.id })).total).toBe(0);
    // The dashboard ignores an out-of-scope owner filter and shows the caller's own figures.
    const kpis = await getKpis(member, { range: resolvePeriod("year", { timeZone: "UTC" }), ownerId: f.users.rep.id });
    expect(kpis.totalLeads).toBe(1);
  });

  it("rejects self-management, cycles and managers from another tenant", async () => {
    await expectError(updateUser(f.ctx.admin, userInput(f.users.rep, f.users.rep.id)), "VALIDATION");
    const cycle = await expectError(updateUser(f.ctx.admin, userInput(f.users.rep, f.users.rep2.id)), "VALIDATION");
    expect(cycle.fieldErrors?.managerId).toMatch(/reports to this user/);
    await expectError(updateUser(f.ctx.admin, userInput(f.users.rep, f.other.users.admin.id)), "VALIDATION");
  });
});

describe("administrator password reset", () => {
  const input = (id: string, pw = "NewPassw0rd!") => ({ id, newPassword: pw, confirmPassword: pw });

  it("is limited to administrators, even when another role can manage users", async () => {
    await prisma.rolePermission.create({ data: { roleId: f.roles.SALES_MANAGER!, permissionKey: "settings.manage_users" } });
    const manager = await ctxOf(f.users.manager.id);
    await expectError(adminSetPassword(manager, input(f.users.rep.id)), "FORBIDDEN");
    await expectError(adminSetPassword(f.ctx.rep, input(f.users.rep2.id)), "FORBIDDEN");
  });

  it("sets the password, signs the user out and is audited without the password", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: f.users.rep.id } });
    await adminSetPassword(f.ctx.admin, input(f.users.rep.id));
    const after = await prisma.user.findUniqueOrThrow({ where: { id: f.users.rep.id } });
    expect(after.sessionVersion).toBe(before.sessionVersion + 1);
    expect((await verifyCredentials(f.users.rep.email, "NewPassw0rd!")).ok).toBe(true);
    expect((await verifyCredentials(f.users.rep.email, PASSWORD)).ok).toBe(false);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: f.users.rep.id, action: "password_set" } });
    expect(JSON.stringify(log)).not.toContain("NewPassw0rd!");
  });

  it("validates the new password and refuses the admin's own account and other tenants", async () => {
    await expectError(adminSetPassword(f.ctx.admin, input(f.users.rep.id, "short")), "VALIDATION");
    await expectError(adminSetPassword(f.ctx.admin, { id: f.users.rep.id, newPassword: "NewPassw0rd!", confirmPassword: "different" }), "VALIDATION");
    await expectError(adminSetPassword(f.ctx.admin, input(f.users.admin.id)), "BUSINESS_RULE");
    await expectError(adminSetPassword(f.ctx.admin, input(f.other.users.rep.id)), "NOT_FOUND");
  });
});
