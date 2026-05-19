import { effectiveMedieSalg, type Case, type OperatingExpense } from "./types";

export interface CaseEconomics {
  // Annoncør-betaling (sum af alle salg)
  medieSalg: number;
  kommunaleGebyr: number;

  // Kostpriser (alt Hyde betaler ud)
  produktionKost: number;
  monteringKost: number;
  internalOverhead: number;
  totalKost: number;

  // Til deling efter omkostninger (= medieSalg − totalKost)
  netTilDeling: number;

  // Split af netTilDeling
  hydeGebyr: number;            // Hyde's andel (= DB)
  bygherreAndel: number;        // bygherrens andel

  // DB = hydeGebyr (Hyde's egentlige overskud)
  dækningsbidrag: number;
  dækningsbidragPct: number;    // DB / medieSalg × 100
  dækningsbidragPerMonth: number;

  // ROI relativ til Hyde's andel af omkostninger
  roi: number;                  // DB / (totalKost × hydeSharePct) × 100
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcCaseEconomics(c: Case): CaseEconomics {
  const costs = c.costs;
  const months = Math.max(1, c.varighedMaaneder || 1);

  const medieSalg = Math.max(0, effectiveMedieSalg(c.sales || [], costs.medieSalg || 0));
  const kommunaleGebyr = Math.max(0, costs.kommunaleGebyr || 0);
  const produktionKost = Math.max(0, costs.produktionKost || 0);
  const monteringKost = Math.max(0, costs.monteringKost || 0);
  const internalOverhead = Math.max(0, costs.internalOverhead || 0);

  const hydePct = Math.max(0, Math.min(100, c.hydeSharePct || 0)) / 100;
  const bygherrePct = Math.max(0, Math.min(100, c.bygherreSharePct || 0)) / 100;

  const totalKost = produktionKost + monteringKost + kommunaleGebyr + internalOverhead;

  // Annoncør betaler én pris (medieSalg). Hyde trækker omkostninger fra, og resten deles 40/60.
  const netTilDeling = medieSalg - totalKost;
  const hydeGebyr = netTilDeling * hydePct;
  const bygherreAndel = netTilDeling * bygherrePct;

  const dækningsbidrag = hydeGebyr;
  const dækningsbidragPct = medieSalg > 0 ? (dækningsbidrag / medieSalg) * 100 : 0;
  const dækningsbidragPerMonth = dækningsbidrag / months;
  // ROI: DB / (Hyde's andel af omkostninger). Bygherre bærer 60% af omkostningerne via deres mindre andel.
  const hydeCostShare = totalKost * hydePct;
  const roi = hydeCostShare > 0 ? (dækningsbidrag / hydeCostShare) * 100 : 0;

  return {
    medieSalg: round2(medieSalg),
    kommunaleGebyr: round2(kommunaleGebyr),

    produktionKost: round2(produktionKost),
    monteringKost: round2(monteringKost),
    internalOverhead: round2(internalOverhead),
    totalKost: round2(totalKost),

    netTilDeling: round2(netTilDeling),
    hydeGebyr: round2(hydeGebyr),
    bygherreAndel: round2(bygherreAndel),

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
      totalOmsætning += e.medieSalg;
      if (e.medieSalg > 0) {
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

    // Costs × Hyde's andel distributed (negativt) over case-perioden
    const hydeCostShare = e.totalKost * hydePct;
    if (hydeCostShare > 0) {
      distribute(-hydeCostShare / caseMonths, caseStart, caseEnd, true);
    } else {
      // Sørg for at case'en stadig tæller selvom ingen costs
      distribute(0, caseStart, caseEnd, true);
    }

    // Hver sales Hyde-andel af salgspris fordeles over salgs-perioden
    const sales = c.sales || [];
    if (sales.length === 0) {
      // Legacy: ingen salg — brug medieSalg fordelt over hele case-perioden
      const medieHyde = e.medieSalg * hydePct;
      if (medieHyde > 0) {
        distribute(medieHyde / caseMonths, caseStart, caseEnd, false);
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
