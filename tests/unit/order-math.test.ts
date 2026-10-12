import { describe, expect, it } from "vitest";
import { computeLine, computeOrder } from "@/lib/order-math";

describe("order math", () => {
  it("computes subtotal, discount, tax and total per line with half-up rounding", () => {
    const l = computeLine({ quantity: "3", unitPrice: "19.99", discountPercent: "10", taxRatePercent: "18" });
    expect(l.lineSubtotal.toFixed(2)).toBe("59.97");
    expect(l.discountAmount.toFixed(2)).toBe("6.00"); // 5.997 → 6.00
    expect(l.taxAmount.toFixed(2)).toBe("9.71"); // 53.97 × 18% = 9.7146
    expect(l.lineTotal.toFixed(2)).toBe("63.68");
  });

  it("handles fractional quantities and zero tax/discount", () => {
    const l = computeLine({ quantity: "2.5", unitPrice: "10.10" });
    expect(l.lineSubtotal.toFixed(2)).toBe("25.25");
    expect(l.lineTotal.toFixed(2)).toBe("25.25");
  });

  it("sums rounded line values into order totals without float drift", () => {
    const o = computeOrder([
      { quantity: "1", unitPrice: "0.10" },
      { quantity: "1", unitPrice: "0.20" },
      { quantity: "3", unitPrice: "33.33", taxRatePercent: "5" },
    ]);
    expect(o.subtotal.toFixed(2)).toBe("100.29");
    expect(o.taxTotal.toFixed(2)).toBe("5.00"); // 99.99 × 5% = 4.9995 → 5.00
    expect(o.total.toFixed(2)).toBe("105.29");
  });

  it("returns zero totals for an empty order", () => {
    expect(computeOrder([]).total.toFixed(2)).toBe("0.00");
  });
});
