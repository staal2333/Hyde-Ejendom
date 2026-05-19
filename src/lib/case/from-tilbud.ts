import type { Tilbud, TilbudLine } from "@/lib/tilbud/types";
import { calcLineTotals } from "@/lib/tilbud/calculations";
import { MONTERING_PER_SQM, PRODUKTION_PER_SQM } from "@/lib/tilbud/placement-types";
import type { CaseSale, CaseUpsertInput, CostSettings } from "./types";
import { createDefaultCase, lookupKommuneRate } from "./types";

function findLine(lines: TilbudLine[], name: string): TilbudLine | undefined {
  const target = name.trim().toLowerCase();
  return lines.find((l) => l.name.trim().toLowerCase() === target);
}

function lineNet(line?: TilbudLine): number {
  if (!line) return 0;
  return calcLineTotals(line).lineTotal;
}

function inferAreaSqm(lines: TilbudLine[]): number {
  // Prefer Medievisning's notes "N m² — Placering" pattern, then fall back to its widthMeters×heightMeters
  const media = findLine(lines, "Medievisning");
  if (media) {
    const match = media.notes?.match(/(\d+(?:[.,]\d+)?)\s*m²/);
    if (match) return Number(match[1].replace(",", "."));
    const totals = calcLineTotals(media);
    if (totals.areaSqm > 0) return totals.areaSqm;
  }
  // Fall back to Produktion line: salgspris / PRODUKTION_PER_SQM
  const prod = findLine(lines, "Produktion");
  if (prod) {
    const total = lineNet(prod);
    if (total > 0) return total / PRODUKTION_PER_SQM;
  }
  return 0;
}

function inferDurationMonths(lines: TilbudLine[]): number {
  const media = findLine(lines, "Medievisning");
  if (!media) return 1;
  const weeks = media.fromWeek != null && media.toWeek != null
    ? Math.max(0, (media.toWeek - media.fromWeek) + 1)
    : media.weeks || 0;
  if (weeks <= 0) return 1;
  return Math.min(12, Math.max(1, Math.round(weeks / 4.33)));
}

/**
 * Translate a Tilbud + cost-settings into a Case-input that can be saved.
 * Salgspriser = what's in the tilbud lines (net of discount).
 * Kostpriser = areaSqm × kostpris/m² from settings.
 */
export function caseFromTilbud(tilbud: Tilbud, settings: CostSettings): CaseUpsertInput {
  const base = createDefaultCase(1);

  const medieLine = findLine(tilbud.lines, "Medievisning");
  const produktionLine = findLine(tilbud.lines, "Produktion");
  const monteringLine = findLine(tilbud.lines, "Montering");
  const gebyrLine = findLine(tilbud.lines, "Kommunale gebyr");

  const medieSalg = lineNet(medieLine);
  const produktionSalg = lineNet(produktionLine);
  const monteringSalg = lineNet(monteringLine);
  const kommunaleGebyr = lineNet(gebyrLine);

  const areaSqm = inferAreaSqm(tilbud.lines);
  const months = inferDurationMonths(tilbud.lines);

  const produktionKost = areaSqm * settings.produktionKostPerSqm;
  const monteringKost = areaSqm * settings.monteringKostPerSqm;
  const internalOverhead = months * (settings.defaultOverheadPerMonth || 0);

  // Seed a single sale from the tilbud's medie-line. Tilbuddet allerede har
  // medieSalg som "netto efter rabat", så vi sætter listpris=medieSalg og rabat=0.
  // Brugeren kan opdele i listpris + rabatPct senere hvis ønsket.
  const initialSale: CaseSale = {
    id: `sale-${Date.now()}-1`,
    annoncør: tilbud.clientName || "",
    fromDate: "",
    toDate: "",
    listpris: medieSalg,
    rabatPct: 0,
    salgspris: 0,
    notes: tilbud.campaignName ? `Kampagne: ${tilbud.campaignName}` : "",
  };

  return {
    ...base,
    id: undefined,
    title: tilbud.title || tilbud.offerNumber || "Case",
    tilbudId: tilbud.id,
    address: tilbud.campaignName || "",
    bygherreNavn: tilbud.clientName || "",
    varighedMaaneder: months,
    areaSqm,
    hydeSharePct: settings.defaultHydeSharePct,
    bygherreSharePct: 100 - settings.defaultHydeSharePct,
    sales: medieSalg > 0 ? [initialSale] : [],
    costs: {
      produktionSalg,
      produktionKost,
      monteringSalg,
      monteringKost,
      kommunaleSalg: kommunaleGebyr,
      kommunaleKost: kommunaleGebyr, // passthrough
      medieSalg: 0,                  // legacy
      kommunaleGebyr,                // legacy
      internalOverhead,
    },
    status: "tilbud_sendt",
  };
}

// Re-export so consumers don't need to know about placement-types
export { MONTERING_PER_SQM, PRODUKTION_PER_SQM };
