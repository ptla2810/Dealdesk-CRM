import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addTicketMessage, assignTicket, changeTicketPriority, changeTicketStatus, createTicket, getTicket } from "@/server/services/tickets";
import { createAccount } from "@/server/services/accounts";
import { createContact } from "@/server/services/contacts";
import { accountInput, createFixture, expectError, resetDatabase, type Fixture } from "../helpers";

let f: Fixture;
let accountId: string;
beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
  accountId = (await createAccount(f.ctx.manager, accountInput(f, { ownerId: f.users.manager.id }))).id;
});
afterAll(() => prisma.$disconnect());

const ticketInput = (extra: Record<string, unknown> = {}) => ({ subject: "Pump vibration", description: "Customer reports vibration.", accountId, category: "TECHNICAL", priority: "HIGH", ...extra });
const version = async (id: string) => (await prisma.ticket.findUniqueOrThrow({ where: { id } })).version;

describe("support tickets", () => {
  it("creates and assigns tickets, notifying the agent", async () => {
    const t = await createTicket(f.ctx.support, ticketInput({ assignedToId: f.users.support.id, internalNote: "Check warranty" }));
    expect(t).toMatchObject({ number: "TKT-00001", status: "OPEN", assignedToId: f.users.support.id });
    await assignTicket(f.ctx.support, { id: t.id, version: 0, assignedToId: f.users.manager.id });
    expect(await prisma.notification.count({ where: { userId: f.users.manager.id, type: "ticket_assigned" } })).toBe(1);
    const full = await getTicket(f.ctx.support, t.id);
    expect(full.events.map((e) => e.field)).toEqual(["assignedTo", "assignedTo"]);
    expect(full.messages[0]).toMatchObject({ kind: "INTERNAL_NOTE", delivery: "NOT_APPLICABLE" });
  });

  it("ignores assignees from users who may not assign", async () => {
    const t = await createTicket(f.ctx.rep, ticketInput({ assignedToId: f.users.support.id }));
    expect(t.assignedToId).toBeNull();
  });

  it("validates related records belong to the ticket's account", async () => {
    const otherAcc = await createAccount(f.ctx.manager, accountInput(f, { name: "Elsewhere", email: "e@e.example", phone: "+1 212 555 0180" }));
    const c = await createContact(f.ctx.manager, { firstName: "E", lastName: "W", email: "ew@e.example", ownerId: f.users.manager.id, preferredChannel: "EMAIL", status: "ACTIVE", marketingConsent: false, subscriptionStatus: "NOT_SUBSCRIBED", accountId: otherAcc.id });
    await expectError(createTicket(f.ctx.support, ticketInput({ contactId: c.id })), "VALIDATION");
  });

  it("enforces status transitions, resolution notes and timestamps", async () => {
    const t = await createTicket(f.ctx.support, ticketInput());
    await changeTicketStatus(f.ctx.support, { id: t.id, version: 0, status: "IN_PROGRESS" });
    await expectError(changeTicketStatus(f.ctx.support, { id: t.id, version: 1, status: "RESOLVED" }), "VALIDATION");
    await changeTicketStatus(f.ctx.support, { id: t.id, version: 1, status: "RESOLVED", resolutionNote: "Replaced bearing" });
    let row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.resolvedAt).not.toBeNull();
    await changeTicketStatus(f.ctx.support, { id: t.id, version: 2, status: "CLOSED" });
    await expectError(changeTicketStatus(f.ctx.support, { id: t.id, version: 3, status: "RESOLVED" }), "BUSINESS_RULE");
    await changeTicketStatus(f.ctx.support, { id: t.id, version: 3, status: "OPEN" });
    row = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({ status: "OPEN", resolvedAt: null, closedAt: null });
    await expectError(changeTicketPriority(f.ctx.support, { id: t.id, version: 0, priority: "URGENT" }), "CONFLICT");
    await changeTicketPriority(f.ctx.support, { id: t.id, version: await version(t.id), priority: "URGENT" });
  });

  it("keeps internal notes separate from customer replies, which need their own permission", async () => {
    const t = await createTicket(f.ctx.support, ticketInput());
    await addTicketMessage(f.ctx.support, { ticketId: t.id, kind: "INTERNAL_NOTE", body: "Looks like a bearing" });
    const reply = await addTicketMessage(f.ctx.support, { ticketId: t.id, kind: "CUSTOMER_REPLY", body: "We are on it" });
    expect(reply.delivery).toBe("RECORDED_ONLY"); // no email provider configured → never claimed as sent
    await expectError(addTicketMessage(f.ctx.rep, { ticketId: t.id, kind: "INTERNAL_NOTE", body: "x" }), "FORBIDDEN");
    const roleKeys = await prisma.rolePermission.findMany({ where: { roleId: f.roles.SALES_MANAGER!, permissionKey: "ticket.reply_customer" } });
    expect(roleKeys).toHaveLength(1);
    const full = await getTicket(f.ctx.support, t.id);
    expect(full.messages.map((m) => m.kind)).toEqual(["INTERNAL_NOTE", "CUSTOMER_REPLY"]);
  });
});
