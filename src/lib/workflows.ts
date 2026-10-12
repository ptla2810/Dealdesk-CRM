/**
 * Workflow rules as pure functions so they are shared by server validation,
 * UI affordances (which buttons to show) and unit tests.
 */
import type { LeadStage, OrderStatus, TicketStatus } from "@prisma/client";
import { LEAD_STAGES } from "./constants";
import type { OrgSettings } from "./settings";

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

const stageIndex = (s: LeadStage) => LEAD_STAGES.indexOf(s);

/**
 * Stage changes through the generic "change stage" action.
 * Conversion (→ CONVERTED) has its own action because it links an account.
 */
export function checkLeadStageChange(from: LeadStage, to: LeadStage, wf: OrgSettings["leadWorkflow"]): TransitionCheck {
  if (from === to) return { ok: false, reason: "The lead is already in this stage." };
  if (to === "CONVERTED") return { ok: false, reason: "Use “Convert lead” to convert a lead so the account is linked." };
  if (from === "CONVERTED") {
    if (!wf.allowReopenConverted) return { ok: false, reason: "Reopening converted leads is disabled in workflow settings." };
    return { ok: true };
  }
  const delta = stageIndex(to) - stageIndex(from);
  if (delta > 1 && !wf.allowSkipStages) return { ok: false, reason: "Leads must move one stage at a time." };
  if (delta < 0 && !wf.allowBackward) return { ok: false, reason: "Moving leads back to an earlier stage is disabled." };
  return { ok: true };
}

export function checkLeadConversion(from: LeadStage, wf: OrgSettings["leadWorkflow"]): TransitionCheck {
  if (from === "CONVERTED") return { ok: false, reason: "This lead has already been converted." };
  if (from !== "MATURE" && !wf.allowSkipStages) return { ok: false, reason: "Only leads in “Lead Mature” can be converted." };
  return { ok: true };
}

export function allowedLeadStageTargets(from: LeadStage, wf: OrgSettings["leadWorkflow"]): LeadStage[] {
  return LEAD_STAGES.filter((s) => checkLeadStageChange(from, s, wf).ok);
}

export function checkOrderTransition(from: OrderStatus, to: OrderStatus, wf: OrgSettings["orderWorkflow"]): TransitionCheck {
  if (from === to) return { ok: false, reason: `The order is already ${to.toLowerCase()}.` };
  const allowed = wf.transitions[from] ?? [];
  if (!allowed.includes(to)) return { ok: false, reason: `An order cannot move from ${from.toLowerCase()} to ${to.toLowerCase()}.` };
  return { ok: true };
}

export function allowedOrderTargets(from: OrderStatus, wf: OrgSettings["orderWorkflow"]): OrderStatus[] {
  return wf.transitions[from] ?? [];
}

const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"],
  WAITING_FOR_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"], // reopen or close
  CLOSED: ["OPEN"], // explicit reopen
};

export function checkTicketTransition(from: TicketStatus, to: TicketStatus): TransitionCheck {
  if (from === to) return { ok: false, reason: "The ticket already has this status." };
  if (!TICKET_TRANSITIONS[from].includes(to)) return { ok: false, reason: `A ticket cannot move from ${from} to ${to}.` };
  return { ok: true };
}

export function allowedTicketTargets(from: TicketStatus): TicketStatus[] {
  return TICKET_TRANSITIONS[from];
}
