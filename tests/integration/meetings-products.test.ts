import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addMinutes, createMeeting, getFollowUps, getMeeting, updateActionItemStatus } from "@/server/services/meetings";
import { createProduct, updateProduct } from "@/server/services/products";
import { createLead } from "@/server/services/leads";
import { createAccount } from "@/server/services/accounts";
import { createContact } from "@/server/services/contacts";
import { accountInput, createFixture, expectError, leadInput, resetDatabase, type Fixture } from "../helpers";

let f: Fixture;
beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
});
afterAll(() => prisma.$disconnect());

const meetingInput = (extra: Record<string, unknown>) => ({
  title: "Requirement discussion",
  scheduledAt: "2030-03-10T10:30",
  durationMins: "60",
  type: "VIDEO_CALL",
  status: "SCHEDULED",
  contactIds: [],
  assignedToId: f.users.rep.id,
  ...extra,
});

describe("meetings & MOM", () => {
  it("requires a customer link and stores the time in the organization timezone", async () => {
    await expectError(createMeeting(f.ctx.rep, meetingInput({})), "VALIDATION");
    const acc = await createAccount(f.ctx.rep, accountInput(f));
    const m = await createMeeting(f.ctx.rep, meetingInput({ accountId: acc.id }));
    expect(m.scheduledAt.toISOString()).toBe("2030-03-10T10:30:00.000Z"); // fixture org is UTC
    expect(m.number).toBe("MTG-00001");
  });

  it("inherits the account from the lead and rejects contacts of other accounts", async () => {
    const acc = await createAccount(f.ctx.rep, accountInput(f, { name: "Lead Co", email: "l@l.example", phone: "+1 212 555 0170" }));
    const other = await createAccount(f.ctx.rep, accountInput(f, { name: "Other Co", email: "o@o.example", phone: "+1 212 555 0171" }));
    const lead = await createLead(f.ctx.rep, leadInput(f, { accountId: acc.id, companyName: "Lead Co" }));
    const stranger = await createContact(f.ctx.rep, { firstName: "S", lastName: "T", email: "s@o.example", ownerId: f.users.rep.id, preferredChannel: "EMAIL", status: "ACTIVE", marketingConsent: false, subscriptionStatus: "NOT_SUBSCRIBED", accountId: other.id });
    await expectError(createMeeting(f.ctx.rep, meetingInput({ leadId: lead.id, contactIds: [stranger.id] })), "VALIDATION");
    const m = await createMeeting(f.ctx.rep, meetingInput({ leadId: lead.id }));
    expect(m.accountId).toBe(acc.id);
  });

  it("records minutes with action items, notifies owners and tracks completion", async () => {
    const acc = await createAccount(f.ctx.rep, accountInput(f, { name: "MOM Co", email: "mom@m.example", phone: "+1 212 555 0172" }));
    const m = await createMeeting(f.ctx.rep, meetingInput({ accountId: acc.id }));
    await addMinutes(f.ctx.rep, {
      meetingId: m.id,
      summary: "Agreed on pilot",
      decisions: "Pilot of 5 units",
      markCompleted: true,
      actionItems: [
        { description: "Send pilot quote", ownerId: f.users.rep2.id, dueDate: "2020-01-01" },
        { description: "Arrange demo unit", ownerId: f.users.rep.id, dueDate: "" },
      ],
    });
    const full = await getMeeting(f.ctx.rep, m.id);
    expect(full.status).toBe("COMPLETED");
    expect(full.minutes[0]).toMatchObject({ summary: "Agreed on pilot", decisions: "Pilot of 5 units" });
    expect(full.actionItems).toHaveLength(2);
    expect(await prisma.notification.count({ where: { userId: f.users.rep2.id, type: "action_assigned" } })).toBe(1);

    const overdue = full.actionItems.find((a) => a.description === "Send pilot quote")!;
    const fu = await getFollowUps(f.ctx.rep2, { mine: true });
    expect(fu.actionItems.find((a) => a.id === overdue.id)?.overdue).toBe(true);

    // The action-item owner may update it; a user without meeting rights who doesn't own it may not.
    await updateActionItemStatus(f.ctx.rep2, { id: overdue.id, status: "DONE" });
    expect((await prisma.actionItem.findUniqueOrThrow({ where: { id: overdue.id } })).completedAt).not.toBeNull();
    await expectError(updateActionItemStatus(f.ctx.support, { id: overdue.id, status: "OPEN" }), "FORBIDDEN");
  });
});

describe("product catalogue", () => {
  const product = (extra: Record<string, unknown> = {}) => ({ name: "Widget", sku: "WID-100", unitOfMeasure: "Each", listPrice: "10.50", currency: "USD", status: "ACTIVE", ...extra });

  it("enforces SKU uniqueness case-insensitively", async () => {
    const p = await createProduct(f.ctx.admin, product());
    expect(p.skuNormalized).toBe("WID-100");
    const err = await expectError(createProduct(f.ctx.admin, product({ sku: "wid-100", name: "Copy" })), "CONFLICT");
    expect(err.fieldErrors?.sku).toMatch(/already used/);
    await updateProduct(f.ctx.admin, { ...product({ name: "Widget v2" }), id: p.id }); // same SKU on itself is fine
  });

  it("validates price, currency and tax class", async () => {
    const err = await expectError(createProduct(f.ctx.admin, product({ sku: "NEW-1", listPrice: "-1", currency: "US" })), "VALIDATION");
    expect(Object.keys(err.fieldErrors!)).toEqual(expect.arrayContaining(["listPrice", "currency"]));
    await expectError(createProduct(f.ctx.admin, product({ sku: "NEW-2", listPrice: "1.234" })), "VALIDATION");
    await expectError(createProduct(f.ctx.admin, product({ sku: "NEW-3", taxRateId: f.other.tax.id })), "VALIDATION");
  });

  it("is read-only for sales reps", async () => {
    await expectError(createProduct(f.ctx.rep, product({ sku: "REP-1" })), "FORBIDDEN");
  });
});

describe("meeting form contract", () => {
  it("treats the minutes section on creation as optional, but requires a summary for action items", async () => {
    const acc = await createAccount(f.ctx.rep, accountInput(f, { name: "Optional MOM Co", email: "om@om.example", phone: "+1 212 555 0190" }));
    const empty = { summary: "", requirements: "", decisions: "", notes: "", actionItems: [] };
    const m = await createMeeting(f.ctx.rep, meetingInput({ accountId: acc.id, minutes: empty }));
    expect((await getMeeting(f.ctx.rep, m.id)).minutes).toHaveLength(0);
    await expectError(
      createMeeting(f.ctx.rep, meetingInput({ accountId: acc.id, minutes: { ...empty, actionItems: [{ description: "x", ownerId: f.users.rep.id, dueDate: "" }] } })),
      "VALIDATION",
    );
  });
});
