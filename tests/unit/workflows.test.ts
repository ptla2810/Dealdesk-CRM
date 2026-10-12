import { describe, expect, it } from "vitest";
import { allowedLeadStageTargets, checkLeadConversion, checkLeadStageChange, checkOrderTransition, checkTicketTransition } from "@/lib/workflows";
import { DEFAULT_ORDER_TRANSITIONS } from "@/lib/settings";

const strict = { allowSkipStages: false, allowBackward: true, allowReopenConverted: false };

describe("lead stage rules", () => {
  it("allows moving forward one stage at a time", () => {
    expect(checkLeadStageChange("QUALIFIED", "IN_DISCUSSION", strict).ok).toBe(true);
    expect(checkLeadStageChange("IN_DISCUSSION", "MATURE", strict).ok).toBe(true);
  });
  it("rejects skipping stages unless configured", () => {
    expect(checkLeadStageChange("QUALIFIED", "MATURE", strict).ok).toBe(false);
    expect(checkLeadStageChange("QUALIFIED", "MATURE", { ...strict, allowSkipStages: true }).ok).toBe(true);
  });
  it("rejects moving back when disabled", () => {
    expect(checkLeadStageChange("MATURE", "QUALIFIED", strict).ok).toBe(true);
    expect(checkLeadStageChange("MATURE", "QUALIFIED", { ...strict, allowBackward: false }).ok).toBe(false);
  });
  it("never converts through a plain stage change", () => {
    expect(checkLeadStageChange("MATURE", "CONVERTED", { ...strict, allowSkipStages: true }).ok).toBe(false);
  });
  it("controls reopening converted leads by configuration", () => {
    expect(checkLeadStageChange("CONVERTED", "MATURE", strict).ok).toBe(false);
    expect(checkLeadStageChange("CONVERTED", "MATURE", { ...strict, allowReopenConverted: true }).ok).toBe(true);
  });
  it("rejects a no-op change", () => {
    expect(checkLeadStageChange("MATURE", "MATURE", strict).ok).toBe(false);
  });
  it("only converts mature leads by default, and never twice", () => {
    expect(checkLeadConversion("MATURE", strict).ok).toBe(true);
    expect(checkLeadConversion("IN_DISCUSSION", strict).ok).toBe(false);
    expect(checkLeadConversion("IN_DISCUSSION", { ...strict, allowSkipStages: true }).ok).toBe(true);
    expect(checkLeadConversion("CONVERTED", { ...strict, allowSkipStages: true }).ok).toBe(false);
  });
  it("lists allowed targets", () => {
    expect(allowedLeadStageTargets("IN_DISCUSSION", strict)).toEqual(["QUALIFIED", "MATURE"]);
  });
});

describe("order & ticket transitions", () => {
  const wf = { transitions: DEFAULT_ORDER_TRANSITIONS };
  it("follows the default order workflow", () => {
    expect(checkOrderTransition("DRAFT", "CONFIRMED", wf).ok).toBe(true);
    expect(checkOrderTransition("DRAFT", "SHIPPED", wf).ok).toBe(false);
    expect(checkOrderTransition("SHIPPED", "CANCELLED", wf).ok).toBe(false);
    expect(checkOrderTransition("DELIVERED", "CANCELLED", wf).ok).toBe(false);
    expect(checkOrderTransition("CONFIRMED", "CONFIRMED", wf).ok).toBe(false);
  });
  it("allows ticket reopen only from closed to open", () => {
    expect(checkTicketTransition("CLOSED", "OPEN").ok).toBe(true);
    expect(checkTicketTransition("CLOSED", "RESOLVED").ok).toBe(false);
    expect(checkTicketTransition("OPEN", "RESOLVED").ok).toBe(true);
  });
});
