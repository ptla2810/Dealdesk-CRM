import { describe, expect, it } from "vitest";
import { normalizeCompanyName, normalizeEmail, normalizePhone, normalizeSku } from "@/lib/normalize";
import { parseDateOnly, parseLocalDateTime, resolvePeriod, toDateTimeInput } from "@/lib/dates";

describe("normalization", () => {
  it("normalizes emails", () => expect(normalizeEmail("  John.DOE@Example.COM ")).toBe("john.doe@example.com"));
  it("normalizes phones to E.164 with country-code support", () => {
    expect(normalizePhone("+1 (415) 555-0142")).toBe("+14155550142");
    expect(normalizePhone("020 7946 0958", "GB")).toBe("+442079460958");
    expect(normalizePhone("12345")).toBeNull();
  });
  it("makes company names comparable regardless of case, punctuation and legal suffix", () => {
    expect(normalizeCompanyName("Acme Industrial, Inc.")).toBe(normalizeCompanyName("ACME industrial"));
    expect(normalizeCompanyName("Smith & Sons Pvt. Ltd")).toBe("smith and sons");
  });
  it("upper-cases SKUs", () => expect(normalizeSku(" ab-12 ")).toBe("AB-12"));
});

describe("dates", () => {
  it("parses date-only values as UTC midnight", () => {
    expect(parseDateOnly("2026-03-05")?.toISOString()).toBe("2026-03-05T00:00:00.000Z");
    expect(parseDateOnly("2026-13-45")).toBeNull();
    expect(parseDateOnly("2026-02-30")).toBeNull();
  });
  it("round-trips wall-clock times in the organization timezone", () => {
    const d = parseLocalDateTime("2026-10-12T09:30", "Asia/Kolkata")!;
    expect(d.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(toDateTimeInput(d, "Asia/Kolkata")).toBe("2026-10-12T09:30");
  });
  const now = new Date("2026-08-20T10:00:00Z");
  it("resolves period presets in the organization timezone", () => {
    const m = resolvePeriod("month", { timeZone: "UTC", now });
    expect([m.from.toISOString(), m.to.toISOString()]).toEqual(["2026-08-01T00:00:00.000Z", "2026-08-31T23:59:59.999Z"]);
    const q = resolvePeriod("quarter", { timeZone: "UTC", now });
    expect(q.from.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    const h = resolvePeriod("half", { timeZone: "UTC", now });
    expect([h.from.toISOString(), h.to.toISOString()]).toEqual(["2026-07-01T00:00:00.000Z", "2026-12-31T23:59:59.999Z"]);
    const w = resolvePeriod("week", { timeZone: "UTC", now }); // Thursday → Monday start
    expect(w.from.toISOString()).toBe("2026-08-17T00:00:00.000Z");
    const k = resolvePeriod("month", { timeZone: "Asia/Kolkata", now });
    expect(k.from.toISOString()).toBe("2026-07-31T18:30:00.000Z");
  });
  it("supports custom ranges and falls back to this month for invalid input", () => {
    const c = resolvePeriod("custom", { timeZone: "UTC", from: "2026-01-01", to: "2026-01-31", now });
    expect([c.from.toISOString(), c.to.toISOString()]).toEqual(["2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.999Z"]);
    expect(resolvePeriod("custom", { timeZone: "UTC", from: "2026-02-01", to: "2026-01-01", now }).key).toBe("month");
  });
});
