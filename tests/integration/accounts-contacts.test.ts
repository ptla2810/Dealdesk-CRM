import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createAccount, updateAccount, getAccount } from "@/server/services/accounts";
import { campaignEligibility, createContact, updateContact } from "@/server/services/contacts";
import { accountInput, createFixture, expectError, resetDatabase, type Fixture } from "../helpers";

let f: Fixture;
beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

describe("account validation & duplicates", () => {
  it("validates required fields, email and phone (with country code support)", async () => {
    const err = await expectError(createAccount(f.ctx.rep, accountInput(f, { name: "", email: "bad", phone: "555" })), "VALIDATION");
    expect(Object.keys(err.fieldErrors!)).toEqual(expect.arrayContaining(["name", "email", "phone"]));
    const gb = await createAccount(f.ctx.rep, accountInput(f, { name: "London Works", email: "Sales@LondonWorks.example", phone: "020 7946 0958", country: "GB" }));
    expect(gb).toMatchObject({ phone: "+442079460958", email: "sales@londonworks.example", country: "GB", number: "ACC-00001" });
  });

  it("warns about duplicates by name, email or phone, case-insensitively", async () => {
    const base = await createAccount(f.ctx.rep, accountInput(f, { name: "Initech LLC", email: "hello@initech.example", phone: "+1 212 555 0110" }));
    for (const variant of [
      { name: "INITECH", email: "other@a.example", phone: "+1 212 555 0111" },
      { name: "Different Co", email: "HELLO@initech.example", phone: "+1 212 555 0112" },
      { name: "Another Co", email: "z@z.example", phone: "(212) 555-0110", country: "US" },
    ]) {
      const err = await expectError(createAccount(f.ctx.rep, accountInput(f, variant)), "DUPLICATE_WARNING");
      expect((err as unknown as { matches: { id: string }[] }).matches[0]!.id).toBe(base.id);
    }
  });

  it("lets only authorized users proceed, and never merges silently", async () => {
    await expectError(createAccount(f.ctx.rep, accountInput(f, { name: "Initech", email: "n@n.example", phone: "+1 212 555 0130", acknowledgeDuplicates: true })), "DUPLICATE_WARNING");
    const created = await createAccount(f.ctx.manager, accountInput(f, { name: "Initech", email: "n@n.example", phone: "+1 212 555 0130", acknowledgeDuplicates: true }));
    expect(created.duplicateOverride).toBe(true);
    expect(await prisma.account.count({ where: { nameNormalized: "initech" } })).toBe(2);
  });

  it("re-checks duplicates when identity fields change on update", async () => {
    const a = await createAccount(f.ctx.manager, accountInput(f, { name: "Unique One", email: "u1@u.example", phone: "+1 212 555 0140", ownerId: f.users.manager.id }));
    await expectError(updateAccount(f.ctx.manager, { ...accountInput(f), id: a.id, name: "Unique One", email: "hello@initech.example", phone: "+1 212 555 0140" }), "DUPLICATE_WARNING");
    await updateAccount(f.ctx.manager, { ...accountInput(f), id: a.id, name: "Unique One", email: "u1@u.example", phone: "+1 212 555 0140", industry: "Retail", ownerId: f.users.manager.id });
    expect((await getAccount(f.ctx.manager, a.id)).industry).toBe("Retail");
  });
});

describe("contacts", () => {
  it("creates contacts linked to an account, supporting several per account", async () => {
    const acc = await createAccount(f.ctx.rep, accountInput(f, { name: "Contacts Inc", email: "c@c.example", phone: "+1 212 555 0150" }));
    const base = { lastName: "Smith", ownerId: f.users.rep.id, preferredChannel: "EMAIL", status: "ACTIVE", marketingConsent: false, subscriptionStatus: "NOT_SUBSCRIBED", accountId: acc.id };
    await createContact(f.ctx.rep, { ...base, firstName: "Ann", email: "ann@c.example" });
    await createContact(f.ctx.rep, { ...base, firstName: "Bob", email: "bob@c.example", phone: "+1 212 555 0151" });
    const full = await getAccount(f.ctx.rep, acc.id);
    expect(full.contacts.map((c) => c.firstName)).toEqual(["Ann", "Bob"]);
    await expectError(createContact(f.ctx.rep, { ...base, firstName: "Dup", email: "ANN@c.example" }), "VALIDATION");
  });

  it("rejects linking to an account the user cannot access", async () => {
    const managers = await createAccount(f.ctx.manager, accountInput(f, { name: "Mgr Account", email: "m@m.example", phone: "+1 212 555 0160", ownerId: f.users.manager.id }));
    await expectError(
      createContact(f.ctx.rep, { firstName: "X", lastName: "Y", email: "xy@m.example", ownerId: f.users.rep.id, preferredChannel: "EMAIL", status: "ACTIVE", marketingConsent: false, subscriptionStatus: "NOT_SUBSCRIBED", accountId: managers.id }),
      "VALIDATION",
    );
  });

  it("tracks consent and unsubscribe for campaign readiness", async () => {
    const base = { firstName: "Cara", lastName: "Lee", email: "cara@c.example", ownerId: f.users.rep.id, preferredChannel: "EMAIL", status: "ACTIVE" };
    await expectError(createContact(f.ctx.rep, { ...base, marketingConsent: false, subscriptionStatus: "SUBSCRIBED" }), "VALIDATION");
    const c = await createContact(f.ctx.rep, { ...base, marketingConsent: true, consentSource: "Web form", subscriptionStatus: "SUBSCRIBED" });
    expect(c.consentAt).not.toBeNull();
    expect(campaignEligibility(c).eligible).toBe(true);
    const withdrawn = await updateContact(f.ctx.rep, { ...base, id: c.id, marketingConsent: false, subscriptionStatus: "NOT_SUBSCRIBED" });
    expect(withdrawn).toMatchObject({ marketingConsent: false, consentAt: null });
    expect(campaignEligibility(withdrawn)).toEqual({ eligible: false, reason: "No marketing consent" });
    const unsub = await updateContact(f.ctx.rep, { ...base, id: c.id, marketingConsent: true, subscriptionStatus: "UNSUBSCRIBED" });
    expect(unsub.unsubscribedAt).not.toBeNull();
    expect(campaignEligibility(unsub).eligible).toBe(false);
  });
});
