import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addDiscussion, changeLeadStage, convertLead, createLead, getLead, updateLead } from "@/server/services/leads";
import { createAccount } from "@/server/services/accounts";
import { accountInput, createFixture, expectError, leadInput, resetDatabase, type Fixture } from "../helpers";

let f: Fixture;
beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

const advance = async (id: string, ctx: Fixture["ctx"]["rep"], to: string) => {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id } });
  await changeLeadStage(ctx, { id, version: lead.version, toStage: to });
};

describe("lead creation & editing", () => {
  it("creates a lead with normalized contact data, numbering, history and audit", async () => {
    const lead = await createLead(f.ctx.rep, leadInput(f));
    expect(lead).toMatchObject({ number: "LD-00001", email: "jane.buyer@example.com", phone: "+14155550142", stage: "QUALIFIED", createdById: f.users.rep.id, modifiedById: f.users.rep.id, currency: "USD" });
    expect(lead.estimatedValue.toString()).toBe("15000");
    const full = await getLead(f.ctx.rep, lead.id);
    expect(full.stageHistory).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { entityId: lead.id, action: "created" } })).toBe(1);
  });

  it("validates required fields, email, phone and amounts", async () => {
    const err = await expectError(createLead(f.ctx.rep, leadInput(f, { name: "", email: "not-an-email", phone: "123", estimatedValue: "-5", nextFollowUpAt: "" })), "VALIDATION");
    expect(Object.keys(err.fieldErrors!)).toEqual(expect.arrayContaining(["name", "email", "phone", "estimatedValue", "nextFollowUpAt"]));
    await expectError(createLead(f.ctx.rep, leadInput(f, { stage: "CONVERTED" })), "VALIDATION");
  });

  it("records the modifying user and rejects stale updates", async () => {
    const lead = await createLead(f.ctx.rep, leadInput(f, { email: "edit@x.example" }));
    await updateLead(f.ctx.manager, { ...leadInput(f), id: lead.id, version: 0, name: "Jane Updated", email: "edit@x.example" });
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after).toMatchObject({ name: "Jane Updated", modifiedById: f.users.manager.id, version: 1 });
    await expectError(updateLead(f.ctx.manager, { ...leadInput(f), id: lead.id, version: 0 }), "CONFLICT");
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: lead.id, action: "updated" } });
    expect(audit.changes).toMatchObject({ name: { from: "Jane Buyer", to: "Jane Updated" } });
  });
});

describe("stage transitions & discussions", () => {
  it("moves one stage at a time and keeps a history", async () => {
    const lead = await createLead(f.ctx.rep, leadInput(f, { email: "stages@x.example" }));
    await expectError(changeLeadStage(f.ctx.rep, { id: lead.id, version: 0, toStage: "MATURE" }), "BUSINESS_RULE");
    await expectError(changeLeadStage(f.ctx.rep, { id: lead.id, version: 0, toStage: "CONVERTED" }), "BUSINESS_RULE");
    await advance(lead.id, f.ctx.rep, "IN_DISCUSSION");
    await advance(lead.id, f.ctx.rep, "MATURE");
    await advance(lead.id, f.ctx.rep, "IN_DISCUSSION"); // moving back is allowed by default
    const full = await getLead(f.ctx.rep, lead.id);
    expect(full.stageHistory.map((h) => h.toStage)).toEqual(["IN_DISCUSSION", "MATURE", "IN_DISCUSSION", "QUALIFIED"]);
  });

  it("only accepts discussion updates while In Discussion, and rolls the follow-up date forward", async () => {
    const lead = await createLead(f.ctx.rep, leadInput(f, { email: "talk@x.example" }));
    const update = { leadId: lead.id, discussedAt: "2030-01-02", summary: "Pricing call", objections: "Too expensive", nextSteps: "Send revised quote", nextFollowUpAt: "2030-02-01", responsibleUserId: f.users.rep.id };
    await expectError(addDiscussion(f.ctx.rep, update), "BUSINESS_RULE");
    await advance(lead.id, f.ctx.rep, "IN_DISCUSSION");
    await addDiscussion(f.ctx.rep, update);
    const full = await getLead(f.ctx.rep, lead.id);
    expect(full.discussions).toHaveLength(1);
    expect(full.discussions[0]).toMatchObject({ summary: "Pricing call", objections: "Too expensive" });
    expect(full.nextFollowUpAt?.toISOString().slice(0, 10)).toBe("2030-02-01");
    await expectError(addDiscussion(f.ctx.rep, { ...update, discussedAt: "2030-02-31" }), "VALIDATION");
  });
});

describe("lead conversion", () => {
  const matureLead = async (extra: Record<string, unknown> = {}) => {
    const lead = await createLead(f.ctx.rep, leadInput(f, extra));
    await advance(lead.id, f.ctx.rep, "IN_DISCUSSION");
    await advance(lead.id, f.ctx.rep, "MATURE");
    return prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
  };

  it("refuses to convert leads that are not mature", async () => {
    const lead = await createLead(f.ctx.rep, leadInput(f, { email: "early@x.example" }));
    await expectError(convertLead(f.ctx.rep, { id: lead.id, version: 0, accountMode: "new" }), "BUSINESS_RULE");
  });

  it("creates the account and buyer contact in one transaction and preserves history", async () => {
    const lead = await matureLead({ email: "convert@newco.example", companyName: "NewCo Robotics", phone: "+1 415 555 0177" });
    const res = await convertLead(f.ctx.rep, { id: lead.id, version: lead.version, accountMode: "new", newAccount: { country: "US", industry: "Manufacturing" }, createContactFromLead: true });
    const full = await getLead(f.ctx.rep, lead.id);
    expect(full).toMatchObject({ stage: "CONVERTED", accountId: res.accountId, convertedById: f.users.rep.id });
    expect(full.convertedAt).not.toBeNull();
    expect(full.account?.name).toBe("NewCo Robotics");
    expect(full.contacts).toHaveLength(1);
    expect(full.contacts[0]!.contact).toMatchObject({ email: "convert@newco.example", accountId: res.accountId });
    expect(full.stageHistory[0]!.toStage).toBe("CONVERTED");
    expect(full.stageHistory.length).toBe(4);
  });

  it("prevents duplicate conversions", async () => {
    const lead = await matureLead({ email: "twice@x.example", companyName: "Twice Ltd" });
    await convertLead(f.ctx.rep, { id: lead.id, version: lead.version, accountMode: "new" });
    await expectError(convertLead(f.ctx.rep, { id: lead.id, version: lead.version, accountMode: "new" }), "CONFLICT");
    const fresh = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    await expectError(convertLead(f.ctx.rep, { id: lead.id, version: fresh.version, accountMode: "new" }), "BUSINESS_RULE");
    expect(await prisma.account.count({ where: { name: "Twice Ltd" } })).toBe(1);
  });

  it("is atomic: a duplicate-account warning leaves the lead untouched", async () => {
    await createAccount(f.ctx.manager, accountInput(f, { name: "Acme Industrial", email: "acme@acme.example", phone: "+1 212 555 0199", ownerId: f.users.rep.id }));
    const lead = await matureLead({ email: "dup@acme.example", companyName: "ACME Industrial, Inc." });
    const err = await expectError(convertLead(f.ctx.rep, { id: lead.id, version: lead.version, accountMode: "new" }), "DUPLICATE_WARNING");
    expect(err).toMatchObject({ canOverride: false });
    const unchanged = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(unchanged.stage).toBe("MATURE");
    // A manager may proceed after reviewing the warning.
    await convertLead(f.ctx.manager, { id: lead.id, version: lead.version, accountMode: "new", acknowledgeDuplicates: true });
    const account = await prisma.account.findFirstOrThrow({ where: { name: "ACME Industrial, Inc." } });
    expect(account.duplicateOverride).toBe(true);
  });

  it("links an existing account and its contacts", async () => {
    const acc = await createAccount(f.ctx.rep, accountInput(f, { name: "Existing Buyer Co", email: "eb@eb.example", phone: "+1 212 555 0123" }));
    const lead = await matureLead({ email: "eb2@eb.example", companyName: "Existing Buyer Co" });
    await convertLead(f.ctx.rep, { id: lead.id, version: lead.version, accountMode: "existing", accountId: acc.id, createContactFromLead: true });
    const full = await getLead(f.ctx.rep, lead.id);
    expect(full.accountId).toBe(acc.id);
    expect(await prisma.account.count({ where: { name: "Existing Buyer Co" } })).toBe(1);
  });
});
