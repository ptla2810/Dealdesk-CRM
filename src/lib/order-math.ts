/**
 * Order pricing arithmetic. The server is the source of truth (it recomputes every
 * total before saving); the order form imports the same functions for a live preview.
 *
 * Per line:
 *   subtotal = round2(quantity × unitPrice)
 *   discount = round2(subtotal × discount% / 100)
 *   tax      = round2((subtotal − discount) × tax% / 100)
 *   total    = subtotal − discount + tax
 * Order totals are the sums of the rounded line values (half-up rounding to 2 dp).
 */
import Decimal from "decimal.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type LineInput = {
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
  discountPercent?: Decimal.Value;
  taxRatePercent?: Decimal.Value;
};

export type LineTotals = {
  lineSubtotal: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  lineTotal: Decimal;
};

const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function computeLine(line: LineInput): LineTotals {
  const qty = new Decimal(line.quantity || 0);
  const price = new Decimal(line.unitPrice || 0);
  const disc = new Decimal(line.discountPercent || 0);
  const tax = new Decimal(line.taxRatePercent || 0);
  const lineSubtotal = round2(qty.mul(price));
  const discountAmount = round2(lineSubtotal.mul(disc).div(100));
  const taxAmount = round2(lineSubtotal.minus(discountAmount).mul(tax).div(100));
  return { lineSubtotal, discountAmount, taxAmount, lineTotal: lineSubtotal.minus(discountAmount).plus(taxAmount) };
}

export function computeOrder(lines: LineInput[]) {
  const computed = lines.map(computeLine);
  const sum = (k: keyof LineTotals) => computed.reduce((acc, l) => acc.plus(l[k]), new Decimal(0));
  return {
    lines: computed,
    subtotal: sum("lineSubtotal"),
    discountTotal: sum("discountAmount"),
    taxTotal: sum("taxAmount"),
    total: sum("lineTotal"),
  };
}

export { Decimal };
