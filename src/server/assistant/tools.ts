/**
 * Read-only tools for the CRM assistant. Every tool calls the existing service layer with the
 * caller's Ctx, so permissions, tenant isolation and data scope apply exactly as in the UI.
 * The assistant cannot create, change or delete anything.
 */
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Ctx } from "../context";
import { AppError } from "../errors";
import type { SearchParams } from "../list";
import { globalSearch } from "../services/search";
import { getLead, listLeads } from "../services/leads";
import { getAccount, listAccounts } from "../services/accounts";
import { getContact, listContacts } from "../services/contacts";
import { getFollowUps, getMeeting, listMeetings, meetingWhere } from "../services/meetings";
import { prisma } from "../db";
import { contains } from "../list";
import { getProduct, listProducts } from "../services/products";
import { getTicket, listTickets } from "../services/tickets";
import { getOrder, listOrders } from "../services/orders";
import { getKpis, getLeadsByStage, getSalespersonPerformance } from "../services/dashboard";
import { readDashboardFilters } from "@/lib/period";

const ENTITIES = ["lead", "account", "contact", "meeting", "product", "ticket", "order"] as const;
type Entity = (typeof ENTITIES)[number];

const HREF: Record<Entity, string> = {
  lead: "/leads",
  account: "/accounts",
  contact: "/contacts",
  meeting: "/meetings",
  product: "/products",
  ticket: "/tickets",
  order: "/orders",
};

const LIST: Record<Entity, (ctx: Ctx, sp: SearchParams) => Promise<{ rows: { id: string }[]; total: number; page: number; pageCount: number }>> = {
  lead: listLeads,
  account: listAccounts,
  contact: listContacts,
  meeting: listMeetings,
  product: listProducts,
  ticket: listTickets,
  order: listOrders,
};

const GET: Record<Entity, (ctx: Ctx, id: string) => Promise<unknown>> = {
  lead: getLead,
  account: getAccount,
  contact: getContact,
  meeting: getMeeting,
  product: getProduct,
  ticket: getTicket,
  order: getOrder,
};

/** Keys that are noise for the model (tenant ids, normalized lookup columns). */
const OMIT = new Set(["organizationId", "passwordHash", "nameNormalized", "skuNormalized", "emailNormalized", "phoneNormalized"]);
const MAX_RESULT_CHARS = 30_000;

/** Compact JSON for tool results: drops nulls and internal columns, caps the size. */
export function toToolJson(value: unknown): string {
  const json = JSON.stringify(value, (key, v) => (v === null || OMIT.has(key) ? undefined : v));
  if (json.length <= MAX_RESULT_CHARS) return json;
  return `${json.slice(0, MAX_RESULT_CHARS)}… [truncated: result too large; narrow the request]`;
}

/**
 * User-safe errors (permission, not found, validation) go back to the model verbatim so it can
 * explain them. Anything unexpected is logged and replaced with a generic message.
 */
async function safely(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw new Error(err.message);
    console.error("[assistant] tool failed", err instanceof Error ? err.message : err);
    throw new Error("The lookup failed because of an internal error.");
  }
}

const withHref = (entity: Entity, rows: { id: string }[]) => rows.map((r) => ({ ...r, href: `${HREF[entity]}/${r.id}` }));

const filtersSchema = z
  .object({
    q: z.string().max(100).optional().describe("Free-text search within this entity"),
    status: z.string().optional().describe("Status enum value, e.g. OPEN, IN_PROGRESS, CONFIRMED, SHIPPED, ACTIVE"),
    stage: z.enum(["QUALIFIED", "IN_DISCUSSION", "MATURE", "CONVERTED"]).optional().describe("Leads only"),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional().describe("Tickets only"),
    open: z.literal("1").optional().describe("Tickets only: '1' = open, in progress or waiting for customer"),
    active: z.literal("1").optional().describe("Orders only: '1' = confirmed, processing or shipped"),
    overdue: z.literal("1").optional().describe("Leads only: '1' = open leads whose follow-up date has passed"),
    when: z.enum(["upcoming", "past"]).optional().describe("Meetings only"),
    assignee: z.string().optional().describe("Tickets: 'me', 'unassigned' or a user id. Meetings: a user id"),
    owner: z.string().uuid().optional().describe("Owner user id"),
    account: z.string().uuid().optional().describe("Account id"),
    createdFrom: z.string().optional().describe("YYYY-MM-DD (leads, accounts, tickets)"),
    createdTo: z.string().optional().describe("YYYY-MM-DD (leads, accounts, tickets)"),
    from: z.string().optional().describe("YYYY-MM-DD (orders: order date; meetings: scheduled date)"),
    to: z.string().optional().describe("YYYY-MM-DD (orders: order date; meetings: scheduled date)"),
  })
  .optional();

export function assistantTools(ctx: Ctx) {
  return [
    betaZodTool({
      name: "search_records",
      description:
        "Search leads, accounts, contacts, products, tickets and orders by name, number, email, SKU or tracking number. Use this first when the user names a specific record. Returns up to 5 hits per type with ids and links.",
      inputSchema: z.object({ query: z.string().min(2).max(100) }),
      run: ({ query }) => safely(async () => toToolJson(await globalSearch(ctx, query))),
    }),

    betaZodTool({
      name: "list_records",
      description:
        "List records of one entity type with optional filters, sorting and paging (25 per page). Use it to answer questions like 'my open tickets', 'leads in discussion', 'orders shipped this month'. Only filters relevant to the entity are applied; others are ignored.",
      inputSchema: z.object({
        entity: z.enum(ENTITIES),
        filters: filtersSchema,
        sort: z.string().optional().describe("Column, e.g. createdAt, updatedAt, estimatedValue, orderDate, total, scheduledAt, priority"),
        dir: z.enum(["asc", "desc"]).optional(),
        page: z.number().int().min(1).optional(),
      }),
      run: ({ entity, filters, sort, dir, page }) =>
        safely(async () => {
          const sp: SearchParams = { ...filters, sort, dir, page: page ? String(page) : undefined };
          const res = await LIST[entity](ctx, sp);
          return toToolJson({ total: res.total, page: res.page, pageCount: res.pageCount, rows: withHref(entity, res.rows) });
        }),
    }),

    betaZodTool({
      name: "get_record",
      description:
        "Get full details of one record by id: a lead with stage history and discussions, an account with its leads/contacts/orders/tickets, a meeting with minutes and action items, a ticket with its messages, an order with lines and delivery events, etc.",
      inputSchema: z.object({ entity: z.enum(ENTITIES), id: z.string().uuid() }),
      run: ({ entity, id }) =>
        safely(async () => toToolJson({ ...(await GET[entity](ctx, id) as object), href: `${HREF[entity]}/${id}` })),
    }),

    betaZodTool({
      name: "get_sales_metrics",
      description:
        "Dashboard KPIs for a period: total/active/qualified/converted leads, conversion rate (cohort), pipeline value (a forecast, not revenue), sales volume (confirmed+ orders in base currency, not cash collected), orders in progress, leads by stage and per-salesperson performance.",
      inputSchema: z.object({
        period: z.enum(["today", "week", "month", "quarter", "half", "year", "custom"]).describe("Calendar period in the organization timezone"),
        from: z.string().optional().describe("YYYY-MM-DD, required when period is custom"),
        to: z.string().optional().describe("YYYY-MM-DD, required when period is custom"),
      }),
      run: ({ period, from, to }) =>
        safely(async () => {
          const f = readDashboardFilters({ period, from, to }, ctx.org.timezone);
          const [kpis, leadsByStage, salespeople] = await Promise.all([
            getKpis(ctx, f),
            getLeadsByStage(ctx, f),
            getSalespersonPerformance(ctx, f),
          ]);
          return toToolJson({ period: { label: f.range.label, from: f.range.from, to: f.range.to }, kpis, leadsByStage, salespeople });
        }),
    }),

    betaZodTool({
      name: "search_meeting_minutes",
      description:
        "Full-text search of minutes of meeting (MoM) — summaries, requirements, decisions and notes — and of meeting action items. Use it for questions like 'what did we agree with Acme?', 'which meetings discussed pricing?' or 'open action items about samples'. Optionally narrow to one account or lead. Returns matching minutes and action items with their meeting, date and link.",
      inputSchema: z.object({
        query: z.string().min(2).max(100).describe("Words to look for in the minutes"),
        account: z.string().uuid().optional().describe("Only meetings with this account"),
        lead: z.string().uuid().optional().describe("Only meetings for this lead"),
      }),
      run: ({ query, account, lead }) =>
        safely(async () => {
          ctx.require("meeting.view");
          const meeting = meetingWhere(ctx, { ...(account ? { accountId: account } : {}), ...(lead ? { leadId: lead } : {}) });
          const meetingSelect = { id: true, number: true, title: true, scheduledAt: true, account: { select: { name: true } }, lead: { select: { name: true } } } as const;
          const [minutes, actionItems] = await Promise.all([
            prisma.meetingMinute.findMany({
              where: { meeting, OR: [{ summary: contains(query) }, { requirements: contains(query) }, { decisions: contains(query) }, { notes: contains(query) }] },
              select: { summary: true, requirements: true, decisions: true, notes: true, createdAt: true, author: { select: { name: true } }, meeting: { select: meetingSelect } },
              orderBy: { createdAt: "desc" },
              take: 15,
            }),
            prisma.actionItem.findMany({
              where: { meeting, description: contains(query) },
              select: { description: true, status: true, dueDate: true, owner: { select: { name: true } }, meeting: { select: meetingSelect } },
              orderBy: { createdAt: "desc" },
              take: 15,
            }),
          ]);
          const link = <T extends { meeting: { id: string } }>(rows: T[]) => rows.map((r) => ({ ...r, href: `/meetings/${r.meeting.id}` }));
          return toToolJson({ minutes: link(minutes), actionItems: link(actionItems) });
        }),
    }),

    betaZodTool({
      name: "get_follow_ups",
      description: "Open action items, lead follow-ups and upcoming meetings within the next N days, with overdue items flagged.",
      inputSchema: z.object({
        mine: z.boolean().optional().describe("Only the current user's items (default true)"),
        days: z.number().int().min(1).max(90).optional().describe("Look-ahead window in days (default 14)"),
      }),
      run: ({ mine, days }) => safely(async () => toToolJson(await getFollowUps(ctx, { mine: mine ?? true, days }))),
    }),
  ];
}
