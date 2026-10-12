import { NextResponse, type NextRequest } from "next/server";
import { getContext } from "@/server/context";
import { exportLeads } from "@/server/services/leads";
import { exportContacts } from "@/server/services/contacts";
import { exportOrders } from "@/server/services/orders";
import { listAccounts } from "@/server/services/accounts";
import { LEAD_STAGE_META, ORDER_STATUS_META, DELIVERY_STATUS_META, ACCOUNT_STATUS_META } from "@/lib/constants";
import { toDateInput } from "@/lib/dates";
import { campaignEligibility } from "@/server/services/contacts";
import { apiError } from "../../_helpers";
import { getGroupedLeadReport, getSalespersonPerformance, type GroupBy } from "@/server/services/dashboard";
import { readDashboardFilters } from "@/lib/period";

/** Escapes a CSV cell and neutralises spreadsheet formula injection. */
function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");

/** GET /api/export/{leads|accounts|contacts|orders}?<same filters as the list page> → CSV download. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  try {
    const { entity } = await params;
    const ctx = await getContext();
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    let body: string;
    if (entity === "leads") {
      const rows = await exportLeads(ctx, sp);
      body = csv(
        ["Lead ID", "Name", "Company", "Account", "Email", "Phone", "Source", "Owner", "Stage", "Estimated value", "Currency", "Next follow-up", "Created", "Modified", "Created by", "Modified by"],
        rows.map((l) => [l.number, l.name, l.companyName, l.account?.name, l.email, l.phone, l.source.name, l.owner.name, LEAD_STAGE_META[l.stage].label, l.estimatedValue.toFixed(2), l.currency, toDateInput(l.nextFollowUpAt), l.createdAt, l.updatedAt, l.createdBy.name, l.modifiedBy.name]),
      );
    } else if (entity === "contacts") {
      const rows = await exportContacts(ctx, sp);
      body = csv(
        ["Contact ID", "First name", "Last name", "Email", "Phone", "Designation", "Department", "Account", "Owner", "Status", "Marketing consent", "Consent at", "Subscription", "Campaign eligible"],
        rows.map((c) => [c.number, c.firstName, c.lastName, c.email, c.phone, c.designation, c.department, c.account?.name, c.owner.name, c.status, c.marketingConsent ? "Yes" : "No", c.consentAt, c.subscriptionStatus, campaignEligibility(c).eligible ? "Yes" : "No"]),
      );
    } else if (entity === "orders") {
      const rows = await exportOrders(ctx, sp);
      body = csv(
        ["Order number", "Account", "Related lead", "Order date", "Owner", "Subtotal", "Discount", "Tax", "Total", "Currency", "Status", "Expected delivery", "Actual delivery", "Delivery status"],
        rows.map((o) => [o.number, o.account.name, o.lead?.number, toDateInput(o.orderDate), o.owner.name, o.subtotal.toFixed(2), o.discountTotal.toFixed(2), o.taxTotal.toFixed(2), o.total.toFixed(2), o.currency, ORDER_STATUS_META[o.status].label, toDateInput(o.expectedDeliveryDate), toDateInput(o.actualDeliveryDate), DELIVERY_STATUS_META[o.deliveryStatus].label]),
      );
    } else if (entity === "accounts") {
      ctx.require("account.export");
      const page = await listAccounts(ctx, { ...sp, page: "1", pageSize: "100" });
      const all = [...page.rows];
      for (let p = 2; p <= Math.min(page.pageCount, 100); p++) all.push(...(await listAccounts(ctx, { ...sp, page: String(p), pageSize: "100" })).rows);
      body = csv(
        ["Account ID", "Company", "Email", "Phone", "Industry", "Owner", "Leads", "Contacts", "Orders", "Status", "Country", "City", "Created"],
        all.map((a) => [a.number, a.name, a.email, a.phone, a.industry, a.owner.name, a._count.leads, a._count.contacts, a._count.orders, ACCOUNT_STATUS_META[a.status].label, a.country, a.city, a.createdAt]),
      );
    } else if (entity === "report") {
      ctx.require("report.export");
      const f = readDashboardFilters(sp, ctx.org.timezone);
      const groupBy = (["owner", "source", "account", "stage"].includes(sp.groupBy ?? "") ? sp.groupBy : "owner") as GroupBy;
      const [rows, perf] = await Promise.all([getGroupedLeadReport(ctx, f, groupBy), getSalespersonPerformance(ctx, f)]);
      body = [
        `Lead report grouped by ${groupBy} — ${f.range.label} (${f.range.from.toISOString()} to ${f.range.to.toISOString()})`,
        csv(["Group", "Leads", "Open", "Converted", "Conversion %", `Open pipeline (${ctx.org.baseCurrency})`, `Converted est. value (${ctx.org.baseCurrency})`], rows.map((r) => [r.key, r.leads, r.open, r.converted, r.conversionRate?.toFixed(1) ?? "", r.pipeline.toFixed(2), r.won.toFixed(2)])),
        "",
        "Salesperson performance",
        csv(["Salesperson", "Leads created", "Converted", "Open pipeline", "Orders", `Sales volume (${ctx.org.baseCurrency})`], perf.map((p) => [p.name, p.leads, p.converted, p.pipeline.toFixed(2), p.orders, p.volume.toFixed(2)])),
      ].join("\r\n");
    } else {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Unknown export" } }, { status: 404 });
    }
    return new NextResponse(`﻿${body}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${entity}-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
