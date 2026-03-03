import type { Tilbud, TilbudLine } from "./types";

export interface TilbudLineTotals {
  areaSqm: number;
  unitListPricePerWeek: number;
  mediaPrice: number;
  discountAmount: number;
  netMediaPrice: number;
  extrasTotal: number;
  lineTotal: number;
}

export interface TilbudTotals {
  linesSubtotal: number;
  fixedCostsTotal: number;
  subtotal: number;
  infoCompensationAmount: number;
  securityAmount: number;
  totalBeforeVat: number;
  vatAmount: number;
  grandTotal: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcLineTotals(line: TilbudLine): TilbudLineTotals {
  const hasWeekRange = Number.isFinite(line.fromWeek) && Number.isFinite(line.toWeek);
  const weekSpan = hasWeekRange
    ? Math.max(0, (line.toWeek || 0) - (line.fromWeek || 0) + 1)
    : line.weeks || 0;
  const weeks = Math.max(1, weekSpan);
  const quantity = Math.max(1, line.quantity || 0);
  const areaSqm = Math.max(0, (line.widthMeters || 0) * (line.heightMeters || 0));
  const unitListPricePerWeek = line.listPrice > 0
    ? Math.max(0, line.listPrice || 0)
    : areaSqm > 0
      ? Math.max(0, line.unitPricePerSqmPerWeek || 0) * areaSqm
      : 0;
  const mediaPrice = unitListPricePerWeek * weeks * quantity;
  const discountAmount = mediaPrice * (Math.max(0, Math.min(100, line.discountPct || 0)) / 100);
  const netMediaPrice = mediaPrice - discountAmount;
  const extrasBase = (line.production || 0) + (line.mounting || 0) + (line.lights || 0);
  const extrasTotal = extrasBase * quantity;
  const computedTotal = netMediaPrice + extrasTotal;
  const lineTotal = line.netPrice != null ? Math.max(0, line.netPrice) : computedTotal;
  return {
    areaSqm: round2(areaSqm),
    unitListPricePerWeek: round2(unitListPricePerWeek),
    mediaPrice: round2(mediaPrice),
    discountAmount: round2(discountAmount),
    netMediaPrice: round2(netMediaPrice),
    extrasTotal: round2(extrasTotal),
    lineTotal: round2(lineTotal),
  };
}

export function calcTilbudTotals(tilbud: Tilbud): TilbudTotals {
  const linesSubtotal = round2(tilbud.lines.reduce((sum, line) => sum + calcLineTotals(line).lineTotal, 0));
  const fixedCostsTotal = round2(
    (tilbud.fixedCosts || [])
      .filter((cost) => cost.enabled)
      .reduce((sum, cost) => sum + (cost.amount || 0), 0)
  );
  const subtotal = round2(linesSubtotal + fixedCostsTotal);
  const infoCompensationAmount = round2(subtotal * ((tilbud.infoCompensationPct || 0) / 100));
  const securityAmount = round2(subtotal * ((tilbud.securityPct || 0) / 100));
  const totalBeforeVat = round2(subtotal + infoCompensationAmount + securityAmount);
  const vatAmount = round2(totalBeforeVat * ((tilbud.vatPct || 0) / 100));
  const grandTotal = round2(totalBeforeVat + vatAmount);
  return {
    linesSubtotal,
    fixedCostsTotal,
    subtotal,
    infoCompensationAmount,
    securityAmount,
    totalBeforeVat,
    vatAmount,
    grandTotal,
  };
}
