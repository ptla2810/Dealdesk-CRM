import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createLead } from "@/server/services/leads";
import { assistantTools, toToolJson } from "@/server/assistant/tools";
import { runAssistant } from "@/server/assistant/chat";
import type { Ctx } from "@/server/context";
import { createFixture, expectError, leadInput, resetDatabase, type Fixture } from "../helpers";

let f: Fixture;
let repLeadId: string;

type AnyTool = { name: string; parse: (input: unknown) => unknown; run: (input: unknown) => Promise<unknown> };
const toolsFor = (ctx: Ctx) => assistantTools(ctx) as unknown as AnyTool[];

/** Runs one assistant tool the way the tool runner does: validate the input, then run. */
async function call(ctx: Ctx, name: string, input: unknown) {
  const tool = toolsFor(ctx).find((t) => t.name === name)!;
  return JSON.parse((await tool.run(tool.parse(input))) as string);
}

beforeAll(async () => {
  await resetDatabase();
  f = await createFixture();
  repLeadId = (await createLead(f.ctx.rep, leadInput(f))).id;
  await createLead(f.ctx.rep2, leadInput(f, { name: "Other Rep Lead", email: "other@example.com", ownerId: f.users.rep2.id }));
});
afterAll(() => prisma.$disconnect());

describe("assistant tools", () => {
  it("search and list respect data scope and return in-app links", async () => {
    const hits = await call(f.ctx.rep, "search_records", { query: "Jane" });
    expect(hits).toEqual([expect.objectContaining({ type: "lead", id: repLeadId, href: `/leads/${repLeadId}` })]);

    const mine = await call(f.ctx.rep, "list_records", { entity: "lead", filters: { stage: "QUALIFIED" } });
    expect(mine.total).toBe(1);
    expect(mine.rows[0]).toMatchObject({ id: repLeadId, href: `/leads/${repLeadId}` });

    const all = await call(f.ctx.manager, "list_records", { entity: "lead" });
    expect(all.total).toBe(2);
  });

  it("never crosses tenants", async () => {
    expect(await call(f.other.ctx.admin, "search_records", { query: "Jane" })).toEqual([]);
    await expect(call(f.other.ctx.admin, "get_record", { entity: "lead", id: repLeadId })).rejects.toThrow(/not found/i);
  });

  it("reports permission errors as user-safe messages", async () => {
    await expect(call(f.ctx.rep2, "get_record", { entity: "lead", id: repLeadId })).rejects.toThrow(/not found or you do not have access/);
    await expect(call(f.ctx.support, "get_follow_ups", {})).rejects.toThrow(/do not have permission/);
  });

  it("returns record details and sales metrics", async () => {
    const lead = await call(f.ctx.rep, "get_record", { entity: "lead", id: repLeadId });
    expect(lead).toMatchObject({ id: repLeadId, name: "Jane Buyer", href: `/leads/${repLeadId}` });
    expect(lead.organizationId).toBeUndefined();

    const metrics = await call(f.ctx.manager, "get_sales_metrics", { period: "year" });
    expect(metrics.kpis.totalLeads).toBe(2);
    expect(metrics.period.label).toBe("This Year");
  });

  it("rejects malformed tool input before running", async () => {
    const tool = toolsFor(f.ctx.rep).find((t) => t.name === "get_record")!;
    expect(() => tool.parse({ entity: "lead", id: "not-a-uuid" })).toThrow();
    expect(() => tool.parse({ entity: "user", id: repLeadId })).toThrow();
  });

  it("searches meeting minutes and action items within the caller's scope", async () => {
    const meeting = await prisma.meeting.create({
      data: {
        organizationId: f.org.id, number: "MTG-T1", title: "Pricing review", scheduledAt: new Date(), leadId: repLeadId,
        assignedToId: f.users.rep.id, createdById: f.users.rep.id, modifiedById: f.users.rep.id,
        minutes: { create: { summary: "Discussed volume pricing", decisions: "Offer 5% discount on 50+ pumps", authorId: f.users.rep.id } },
        actionItems: { create: { description: "Send revised discount quote", ownerId: f.users.rep.id } },
      },
    });
    const mine = await call(f.ctx.rep, "search_meeting_minutes", { query: "discount" });
    expect(mine.minutes).toHaveLength(1);
    expect(mine.minutes[0]).toMatchObject({ decisions: "Offer 5% discount on 50+ pumps", href: `/meetings/${meeting.id}` });
    expect(mine.actionItems).toHaveLength(1);

    // Another rep (OWN scope, not in the same team) and another tenant see nothing.
    expect((await call(f.ctx.rep2, "search_meeting_minutes", { query: "discount" })).minutes).toHaveLength(0);
    expect((await call(f.other.ctx.admin, "search_meeting_minutes", { query: "discount" })).minutes).toHaveLength(0);
  });

  it("drops nulls and caps large results", () => {
    expect(toToolJson({ a: null, b: 1, organizationId: "x" })).toBe('{"b":1}');
    expect(toToolJson({ s: "x".repeat(40_000) })).toMatch(/truncated/);
  });
});

describe("assistant request validation", () => {
  it("rejects empty or malformed conversations before calling the model", async () => {
    const emit = () => {};
    await expectError(runAssistant(f.ctx.rep, { messages: [] }, emit), "VALIDATION");
    await expectError(runAssistant(f.ctx.rep, { messages: [{ role: "system", content: "x" }] }, emit), "VALIDATION");
    await expectError(runAssistant(f.ctx.rep, { messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }] }, emit), "VALIDATION");
  });
});
