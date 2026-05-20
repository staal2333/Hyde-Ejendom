import { effectiveMedieSalg, netMedieForSale, type Case, type OperatingExpense } from "./types";
import type { PlannedPayment } from "./planned-payments";

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

// ─── Likviditet / runway ────────────────────────────────────

export interface LiquidityMonth {
  month: string;
  monthLabel: string;
  dbIn: number;         // forventet DB fra cases
  opexOut: number;      // faste driftsudgifter
  momsOut: number;      // moms-afregning (kun ved kvartalsslut)
  net: number;          // dbIn − opexOut − momsOut
  cashEnd: number;      // kassebeholdning ved månedens udgang
  negative: boolean;
}

export interface LiquidityForecast {
  startingCash: number;
  months: LiquidityMonth[];
  /** Antal hele måneder med positiv kasse før den går negativ. null = positiv hele horisonten. */
  runwayMonths: number | null;
  runwayEndLabel: string | null;
  avgMonthlyNet: number;
  lowestCash: number;
  totalMomsHorizon: number;
}

/**
 * Projektér kassebeholdning måned for måned:
 *   kasse += DB fra cases − faste driftsudgifter − moms-afregning
 * Moms estimeres som momsPct% af DB og afregnes ved kalenderkvartal
 * (marts/juni/sep/dec). Runway = måneden hvor kassen først går negativ.
 */
export function calcLiquidityForecast(
  cases: Case[],
  monthlyOpEx: number,
  startingCash: number,
  momsPct: number,
  horizonMonths = 12
): LiquidityForecast {
  const forecast = calcMonthlyForecast(cases, horizonMonths);
  const months: LiquidityMonth[] = [];
  let cash = startingCash;
  let momsAccrued = 0;
  let runwayMonths: number | null = null;
  let runwayEndLabel: string | null = null;
  let lowestCash = startingCash;
  let netSum = 0;
  let totalMoms = 0;

  forecast.forEach((f, i) => {
    const dbIn = f.expectedDB;
    const opexOut = monthlyOpEx;
    momsAccrued += dbIn * (Math.max(0, momsPct) / 100);

    // Kalenderkvartal-slut: marts(2), juni(5), sep(8), dec(11)
    const monthIdx = Number(f.month.slice(5, 7)) - 1;
    let momsOut = 0;
    if ([2, 5, 8, 11].includes(monthIdx)) {
      momsOut = Math.max(0, round2(momsAccrued));
      momsAccrued = 0;
    }
    totalMoms += momsOut;

    const net = round2(dbIn - opexOut - momsOut);
    netSum += net;
    cash = round2(cash + net);
    if (cash < lowestCash) lowestCash = cash;
    if (runwayMonths === null && cash < 0) {
      runwayMonths = i;
      runwayEndLabel = f.monthLabel;
    }

    months.push({
      month: f.month,
      monthLabel: f.monthLabel,
      dbIn: round2(dbIn),
      opexOut: round2(opexOut),
      momsOut,
      net,
      cashEnd: cash,
      negative: cash < 0,
    });
  });

  return {
    startingCash: round2(startingCash),
    months,
    runwayMonths,
    runwayEndLabel,
    avgMonthlyNet: months.length ? round2(netSum / months.length) : 0,
    lowestCash: round2(lowestCash),
    totalMomsHorizon: round2(totalMoms),
  };
}

// ─── Cash-prognose drevet af planlagte betalinger ───────────

export interface CashProjectionMonth {
  month: string;
  monthLabel: string;
  ind: number;          // planlagte indbetalinger
  ud: number;           // planlagte udbetalinger
  burn: number;         // fast månedligt burn
  net: number;          // ind − ud − burn
  cashEnd: number;
  negative: boolean;
}

export interface CashProjection {
  startingCash: number;
  monthlyBurn: number;
  months: CashProjectionMonth[];
  runwayMonths: number | null;
  runwayEndLabel: string | null;
  lowestCash: number;
  totalIn: number;
  totalOut: number;
}

/**
 * Projektér kassebeholdning ud fra planlagte betalinger + fast burn.
 * Kun betalinger med status "forventet" tæller (modtaget/betalt er
 * allerede i saldoen). Forfaldne (dato før indeværende måned) lægges
 * i første måned.
 */
export function calcCashProjection(
  startingCash: number,
  plannedPayments: PlannedPayment[],
  monthlyBurn: number,
  horizonMonths = 12
): CashProjection {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const months: CashProjectionMonth[] = [];
  const buckets = new Map<string, CashProjectionMonth>();
  for (let i = 0; i < horizonMonths; i++) {
    const d = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + i, 1);
    const m: CashProjectionMonth = {
      month: monthKey(d),
      monthLabel: `${MONTH_NAMES_DA[d.getMonth()]} ${d.getFullYear()}`,
      ind: 0,
      ud: 0,
      burn: Math.max(0, monthlyBurn),
      net: 0,
      cashEnd: 0,
      negative: false,
    };
    months.push(m);
    buckets.set(m.month, m);
  }
  const firstKey = months[0]?.month || "";

  for (const p of plannedPayments) {
    if (p.status !== "forventet") continue;
    const key = p.expectedDate.slice(0, 7);
    let m = buckets.get(key);
    if (!m && firstKey && key < firstKey) m = buckets.get(firstKey); // forfalden → første måned
    if (!m) continue; // uden for horisonten
    if (p.direction === "ind") m.ind += p.amount;
    else m.ud += p.amount;
  }

  let cash = startingCash;
  let lowest = startingCash;
  let runwayMonths: number | null = null;
  let runwayEndLabel: string | null = null;
  let totalIn = 0;
  let totalOut = 0;

  months.forEach((m, i) => {
    m.ind = round2(m.ind);
    m.ud = round2(m.ud);
    m.net = round2(m.ind - m.ud - m.burn);
    cash = round2(cash + m.net);
    m.cashEnd = cash;
    m.negative = cash < 0;
    totalIn += m.ind;
    totalOut += m.ud + m.burn;
    if (cash < lowest) lowest = cash;
    if (runwayMonths === null && cash < 0) {
      runwayMonths = i;
      runwayEndLabel = m.monthLabel;
    }
  });

  return {
    startingCash: round2(startingCash),
    monthlyBurn: round2(monthlyBurn),
    months,
    runwayMonths,
    runwayEndLabel,
    lowestCash: round2(lowest),
    totalIn: round2(totalIn),
    totalOut: round2(totalOut),
  };
}
