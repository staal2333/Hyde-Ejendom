import { effectiveMedieSalg, type Case, type OperatingExpense } from "./types";

export interface CaseEconomics {
  // Salgspriser
  totalSalg: number;
  medieSalg: number;
  produktionSalg: number;
  monteringSalg: number;
  kommunaleGebyr: number;

  // Split af medie-omsætning
  hydeMedieRevenue: number;
  bygherreMedieRevenue: number;

  // Kostpriser
  produktionKost: number;
  monteringKost: number;
  totalKost: number;

  // Hyde's reelle indtjening
  hydeRevenue: number;          // hyde's share af medie + salgsmargin på prod/mont
  productionMargin: number;     // produktionSalg - produktionKost
  monteringMargin: number;      // monteringSalg - monteringKost

  // Dækningsbidrag (profit før faste omkostninger)
  dækningsbidrag: number;
  dækningsbidragPct: number;    // DB / hydeRevenue (excl. overhead)
  dækningsbidragPerMonth: number;

  // ROI
  roi: number;                  // DB / totalKost × 100

  // Overhead
  internalOverhead: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcCaseEconomics(c: Case): CaseEconomics {
  const costs = c.costs;
  const months = Math.max(1, c.varighedMaaneder || 1);

  const medieSalg = Math.max(0, effectiveMedieSalg(c.sales || [], costs.medieSalg || 0));
  const produktionSalg = Math.max(0, costs.produktionSalg || 0);
  const monteringSalg = Math.max(0, costs.monteringSalg || 0);
  const kommunaleGebyr = Math.max(0, costs.kommunaleGebyr || 0);
  const produktionKost = Math.max(0, costs.produktionKost || 0);
  const monteringKost = Math.max(0, costs.monteringKost || 0);
  const internalOverhead = Math.max(0, costs.internalOverhead || 0);

  const totalSalg = medieSalg + produktionSalg + monteringSalg + kommunaleGebyr;

  const hydePct = Math.max(0, Math.min(100, c.hydeSharePct || 0)) / 100;
  const bygherrePct = Math.max(0, Math.min(100, c.bygherreSharePct || 0)) / 100;

  const hydeMedieRevenue = medieSalg * hydePct;
  const bygherreMedieRevenue = medieSalg * bygherrePct;

  const productionMargin = produktionSalg - produktionKost;
  const monteringMargin = monteringSalg - monteringKost;

  // Hyde's effektive revenue: andel af medie + fakturerede prod/mont (som de selv afholder)
  const hydeRevenue = hydeMedieRevenue + produktionSalg + monteringSalg;

  const totalKost = produktionKost + monteringKost + kommunaleGebyr + internalOverhead;

  // DB = hyde-andel + produktionsmargin + monteringsmargin − kommunale − overhead
  const dækningsbidrag =
    hydeMedieRevenue + productionMargin + monteringMargin - kommunaleGebyr - internalOverhead;

  const dækningsbidragPct = hydeRevenue > 0 ? (dækningsbidrag / hydeRevenue) * 100 : 0;
  const dækningsbidragPerMonth = dækningsbidrag / months;
  const roi = totalKost > 0 ? (dækningsbidrag / totalKost) * 100 : 0;

  return {
    totalSalg: round2(totalSalg),
    medieSalg: round2(medieSalg),
    produktionSalg: round2(produktionSalg),
    monteringSalg: round2(monteringSalg),
    kommunaleGebyr: round2(kommunaleGebyr),

    hydeMedieRevenue: round2(hydeMedieRevenue),
    bygherreMedieRevenue: round2(bygherreMedieRevenue),

    produktionKost: round2(produktionKost),
    monteringKost: round2(monteringKost),
    totalKost: round2(totalKost),

    hydeRevenue: round2(hydeRevenue),
    productionMargin: round2(productionMargin),
    monteringMargin: round2(monteringMargin),

    dækningsbidrag: round2(dækningsbidrag),
    dækningsbidragPct: round2(dækningsbidragPct),
    dækningsbidragPerMonth: round2(dækningsbidragPerMonth),

    roi: round2(roi),
    internalOverhead: round2(internalOverhead),
  };
}

export interface PortfolioKPIs {
  totalCases: number;
  activeCases: number;
  pipelineDB: number;          // DB i tilbud_sendt + godkendt
  driftDB: number;             // DB i opsat + i_drift
  realiseretDB: number;        // DB i afsluttet
  tabtDB: number;              // DB tabt
  avgDBPct: number;
  totalOmsætning: number;      // total salg for ALL non-tabt
  byStatus: Record<string, number>;
}

const PIPELINE_STATUSES = new Set(["tilbud_sendt", "godkendt"]);
const DRIFT_STATUSES = new Set(["opsat", "i_drift", "nedtaget"]);
const REALISERET_STATUSES = new Set(["afsluttet"]);
const TABT_STATUSES = new Set(["tabt"]);

export function calcPortfolioKPIs(cases: Case[]): PortfolioKPIs {
  const byStatus: Record<string, number> = {};
  let pipelineDB = 0;
  let driftDB = 0;
  let realiseretDB = 0;
  let tabtDB = 0;
  let totalOmsætning = 0;
  let activeCases = 0;
  let dbPctSum = 0;
  let dbPctCount = 0;

  for (const c of cases) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    const e = calcCaseEconomics(c);

    if (PIPELINE_STATUSES.has(c.status)) {
      pipelineDB += e.dækningsbidrag;
      activeCases++;
    } else if (DRIFT_STATUSES.has(c.status)) {
      driftDB += e.dækningsbidrag;
      activeCases++;
    } else if (REALISERET_STATUSES.has(c.status)) {
      realiseretDB += e.dækningsbidrag;
    } else if (TABT_STATUSES.has(c.status)) {
      tabtDB += e.dækningsbidrag;
    }

    if (!TABT_STATUSES.has(c.status)) {
      totalOmsætning += e.totalSalg;
      if (e.hydeRevenue > 0) {
        dbPctSum += e.dækningsbidragPct;
        dbPctCount++;
      }
    }
  }

  return {
    totalCases: cases.length,
    activeCases,
    pipelineDB: round2(pipelineDB),
    driftDB: round2(driftDB),
    realiseretDB: round2(realiseretDB),
    tabtDB: round2(tabtDB),
    avgDBPct: dbPctCount > 0 ? round2(dbPctSum / dbPctCount) : 0,
    totalOmsætning: round2(totalOmsætning),
    byStatus,
  };
}

export interface MonthlyForecastEntry {
  month: string;               // "2026-05"
  monthLabel: string;          // "Maj 2026"
  expectedDB: number;
  caseCount: number;
}

const MONTH_NAMES_DA = [
  "Jan", "Feb", "Mar", "Apr", "Maj", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseDateLoose(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function countMonthsBetween(start: Date, end: Date): number {
  return Math.max(
    1,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  );
}

/**
 * Forecast forventet DB pr. måned for de næste N måneder.
 *
 * Distribuerer en case's økonomi over kalendermånederne:
 *  - Produktion/montering-margin og kommunale gebyrer + overhead fordeles
 *    ligeligt over case-perioden (startDate..endDate eller varighedMaaneder).
 *  - Hver sale's Hyde-andel fordeles ligeligt over salgs-perioden (sale.fromDate..toDate).
 *    Hvis et salg mangler datoer, falder det tilbage til case-perioden.
 *
 * Cases med status "tabt" indgår ikke.
 */
export function calcMonthlyForecast(cases: Case[], horizonMonths = 12): MonthlyForecastEntry[] {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const buckets: MonthlyForecastEntry[] = [];
  for (let i = 0; i < horizonMonths; i++) {
    const d = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + i, 1);
    buckets.push({
      month: monthKey(d),
      monthLabel: `${MONTH_NAMES_DA[d.getMonth()]} ${d.getFullYear()}`,
      expectedDB: 0,
      caseCount: 0,
    });
  }
  const bucketByKey = new Map(buckets.map((b) => [b.month, b]));

  function distribute(amountPerMonth: number, start: Date, end: Date, countTowardsCase: boolean) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const endOfMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= endOfMonth) {
      const bucket = bucketByKey.get(monthKey(cursor));
      if (bucket) {
        bucket.expectedDB = round2(bucket.expectedDB + amountPerMonth);
        if (countTowardsCase) bucket.caseCount++;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  for (const c of cases) {
    if (c.status === "tabt") continue;

    const e = calcCaseEconomics(c);
    const months = Math.max(1, c.varighedMaaneder || 1);

    // Case-window dates for cost distribution
    const caseStart = parseDateLoose(c.startDate) || parseDateLoose(c.createdAt) || new Date();
    const caseEnd =
      parseDateLoose(c.endDate) ||
      new Date(caseStart.getFullYear(), caseStart.getMonth() + months - 1, caseStart.getDate());

    // Costs & margins distributed over case period
    const costsTotal =
      e.productionMargin + e.monteringMargin - e.kommunaleGebyr - e.internalOverhead;
    const caseMonths = countMonthsBetween(caseStart, caseEnd);
    distribute(costsTotal / caseMonths, caseStart, caseEnd, true);

    // Each sale's Hyde-share distributed over its own period
    const sales = c.sales || [];
    const hydePct = Math.max(0, Math.min(100, c.hydeSharePct || 0)) / 100;

    if (sales.length === 0) {
      // Legacy / no-sales case: distribute the medie hyde-share across full case window
      const hydeMedie = e.hydeMedieRevenue;
      if (hydeMedie > 0) {
        distribute(hydeMedie / caseMonths, caseStart, caseEnd, false);
      }
    } else {
      for (const sale of sales) {
        const saleStart = parseDateLoose(sale.fromDate) || caseStart;
        const saleEnd = parseDateLoose(sale.toDate) || caseEnd;
        const saleMonths = countMonthsBetween(saleStart, saleEnd);
        const hydeAmount = (sale.salgspris || 0) * hydePct;
        if (hydeAmount > 0) {
          distribute(hydeAmount / saleMonths, saleStart, saleEnd, false);
        }
      }
    }
  }

  return buckets;
}

export function totalMonthlyOperatingCost(expenses: OperatingExpense[]): number {
  return round2(
    expenses
      .filter((e) => e.enabled)
      .reduce((sum, e) => sum + (e.amountPerMonth || 0), 0)
  );
}

/**
 * Hyde's nettoindtjening per måned i forecast:
 * forventet DB fra cases − faste driftsudgifter
 */
export function applyOperatingExpenses(
  forecast: MonthlyForecastEntry[],
  monthlyOperatingCost: number
): MonthlyForecastEntry[] {
  return forecast.map((entry) => ({
    ...entry,
    expectedDB: round2(entry.expectedDB - monthlyOperatingCost),
  }));
}
