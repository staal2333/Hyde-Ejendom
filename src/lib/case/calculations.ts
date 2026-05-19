import { effectiveMedieSalg, netMedieForSale, type Case, type OperatingExpense } from "./types";

export interface CaseEconomics {
  // ─── Salgspriser (hvad bygherre faktureres) ─────
  netMedieRevenue: number;       // sum af (listpris − rabat) for alle salg
  produktionSalg: number;
  monteringSalg: number;
  kommunaleSalg: number;
  fakturaTotal: number;          // hvad bygherre samlet betaler Hyde

  // ─── Kostpriser (hvad Hyde reelt betaler ud) ────
  produktionKost: number;
  monteringKost: number;
  kommunaleKost: number;
  internalOverhead: number;
  totalKost: number;

  // ─── Split af medievisning ──────────────────────
  hydeMediaShare: number;        // netMedieRevenue × hydeSharePct
  bygherreMediaShare: number;    // netMedieRevenue × bygherreSharePct

  // ─── Margins på services ────────────────────────
  produktionMargin: number;      // produktionSalg − produktionKost
  monteringMargin: number;       // monteringSalg − monteringKost
  kommunaleMargin: number;       // kommunaleSalg − kommunaleKost (typisk 0)

  // ─── Hyde's bottom line ─────────────────────────
  dækningsbidrag: number;        // = hydeMediaShare + alle marginer − overhead
  dækningsbidragPct: number;     // DB / fakturaTotal × 100
  dækningsbidragPerMonth: number;
  roi: number;                   // DB / Hyde's eksponering × 100
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcCaseEconomics(c: Case): CaseEconomics {
  const costs = c.costs;
  const months = Math.max(1, c.varighedMaaneder || 1);

  // Net medievisning fra salg (efter rabat). Falder tilbage til legacy medieSalg hvis sales[] er tom.
  const netMedieRevenue = Math.max(0, effectiveMedieSalg(c.sales || [], costs.medieSalg || 0));

  // Salgspriser (hvad bygherre faktureres) — kommunaleGebyr behandles som kommunaleSalg ved fallback
  const produktionSalg = Math.max(0, costs.produktionSalg || 0);
  const monteringSalg = Math.max(0, costs.monteringSalg || 0);
  const kommunaleSalg = Math.max(0, costs.kommunaleSalg || costs.kommunaleGebyr || 0);

  // Kostpriser — kommunaleKost falder tilbage til kommunaleSalg (passthrough)
  const produktionKost = Math.max(0, costs.produktionKost || 0);
  const monteringKost = Math.max(0, costs.monteringKost || 0);
  const kommunaleKost = Math.max(0, costs.kommunaleKost || kommunaleSalg);
  const internalOverhead = Math.max(0, costs.internalOverhead || 0);

  const fakturaTotal = netMedieRevenue + produktionSalg + monteringSalg + kommunaleSalg;
  const totalKost = produktionKost + monteringKost + kommunaleKost + internalOverhead;

  // Split af medie-omsætning
  const hydePct = Math.max(0, Math.min(100, c.hydeSharePct || 0)) / 100;
  const bygherrePct = Math.max(0, Math.min(100, c.bygherreSharePct || 0)) / 100;
  const hydeMediaShare = netMedieRevenue * hydePct;
  const bygherreMediaShare = netMedieRevenue * bygherrePct;

  // Margins på services (Hyde tjener differencen mellem salgspris og kostpris)
  const produktionMargin = produktionSalg - produktionKost;
  const monteringMargin = monteringSalg - monteringKost;
  const kommunaleMargin = kommunaleSalg - kommunaleKost;

  // Hyde's DB: andel af medie + alle service-marginer − overhead
  const dækningsbidrag =
    hydeMediaShare + produktionMargin + monteringMargin + kommunaleMargin - internalOverhead;
  const dækningsbidragPct = fakturaTotal > 0 ? (dækningsbidrag / fakturaTotal) * 100 : 0;
  const dækningsbidragPerMonth = dækningsbidrag / months;

  // ROI: DB / Hyde's eksponering (kostpriser Hyde reelt har betalt for produktion+montering+overhead)
  const hydeExposure = produktionKost + monteringKost + internalOverhead;
  const roi = hydeExposure > 0 ? (dækningsbidrag / hydeExposure) * 100 : 0;

  return {
    netMedieRevenue: round2(netMedieRevenue),
    produktionSalg: round2(produktionSalg),
    monteringSalg: round2(monteringSalg),
    kommunaleSalg: round2(kommunaleSalg),
    fakturaTotal: round2(fakturaTotal),

    produktionKost: round2(produktionKost),
    monteringKost: round2(monteringKost),
    kommunaleKost: round2(kommunaleKost),
    internalOverhead: round2(internalOverhead),
    totalKost: round2(totalKost),

    hydeMediaShare: round2(hydeMediaShare),
    bygherreMediaShare: round2(bygherreMediaShare),

    produktionMargin: round2(produktionMargin),
    monteringMargin: round2(monteringMargin),
    kommunaleMargin: round2(kommunaleMargin),

    dækningsbidrag: round2(dækningsbidrag),
    dækningsbidragPct: round2(dækningsbidragPct),
    dækningsbidragPerMonth: round2(dækningsbidragPerMonth),

    roi: round2(roi),
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
      totalOmsætning += e.fakturaTotal;
      if (e.fakturaTotal > 0) {
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
 * Hyde's DB = (medieSalg − totalKost) × hydeSharePct.
 * Distribueres pr. måned:
 *  - Hver sale's Hyde-andel af salgspris fordeles over sale-perioden.
 *  - Costs × hydeSharePct fordeles (negativt) over case-perioden.
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

    const hydePct = Math.max(0, Math.min(100, c.hydeSharePct || 0)) / 100;
    const caseMonths = countMonthsBetween(caseStart, caseEnd);

    // Service-marginer + overhead − fordelt over case-perioden
    const serviceContrib =
      e.produktionMargin + e.monteringMargin + e.kommunaleMargin - e.internalOverhead;
    distribute(serviceContrib / caseMonths, caseStart, caseEnd, true);

    // Hver sales Hyde-andel af netto-medie fordeles over salgs-perioden
    const sales = c.sales || [];
    if (sales.length === 0) {
      // Legacy: ingen salg — brug netMedieRevenue × Hyde-andel fordelt over case-perioden
      const medieHyde = e.netMedieRevenue * hydePct;
      if (medieHyde > 0) {
        distribute(medieHyde / caseMonths, caseStart, caseEnd, false);
      }
    } else {
      for (const sale of sales) {
        const saleStart = parseDateLoose(sale.fromDate) || caseStart;
        const saleEnd = parseDateLoose(sale.toDate) || caseEnd;
        const saleMonths = countMonthsBetween(saleStart, saleEnd);
        const hydeAmount = netMedieForSale(sale) * hydePct;
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
