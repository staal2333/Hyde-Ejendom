import { z } from "zod";

export const CASE_STATUSES = [
  "tilbud_sendt",
  "godkendt",
  "opsat",
  "i_drift",
  "nedtaget",
  "afsluttet",
  "tabt",
] as const;

export const caseStatusSchema = z.enum(CASE_STATUSES);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  tilbud_sendt: "Tilbud sendt",
  godkendt: "Godkendt",
  opsat: "Opsat",
  i_drift: "I drift",
  nedtaget: "Nedtaget",
  afsluttet: "Afsluttet",
  tabt: "Tabt",
};

export const CASE_STATUS_COLOR: Record<CaseStatus, string> = {
  tilbud_sendt: "bg-slate-100 text-slate-700 border-slate-300",
  godkendt: "bg-blue-50 text-blue-700 border-blue-300",
  opsat: "bg-violet-50 text-violet-700 border-violet-300",
  i_drift: "bg-emerald-50 text-emerald-700 border-emerald-300",
  nedtaget: "bg-amber-50 text-amber-700 border-amber-300",
  afsluttet: "bg-green-50 text-green-700 border-green-300",
  tabt: "bg-rose-50 text-rose-700 border-rose-300",
};

/**
 * A single sale/booking within a case — one advertiser renting the
 * scaffolding's media space for a given period. Multiple sales can
 * stack up over a case's 1-12 month duration as advertisers rotate.
 */
export const caseSaleSchema = z.object({
  id: z.string().min(1),
  annoncør: z.string().default(""),
  fromDate: z.string().optional().default(""),
  toDate: z.string().optional().default(""),
  salgspris: z.number().nonnegative().default(0),
  notes: z.string().optional().default(""),
});

export type CaseSale = z.infer<typeof caseSaleSchema>;

/**
 * Costs are split into salgspris (what the bygherre pays in tilbud)
 * and kostpris (what it actually costs Hyde to deliver).
 * Margin per cost-line = salgspris - kostpris.
 * medieSalg is kept as a legacy field — derived from sum(sales.salgspris)
 * when sales array is populated.
 */
export const caseCostsSchema = z.object({
  produktionSalg: z.number().nonnegative().default(0),
  produktionKost: z.number().nonnegative().default(0),
  monteringSalg: z.number().nonnegative().default(0),
  monteringKost: z.number().nonnegative().default(0),
  medieSalg: z.number().nonnegative().default(0),
  kommunaleGebyr: z.number().nonnegative().default(0),
  internalOverhead: z.number().nonnegative().default(0),
});

export type CaseCosts = z.infer<typeof caseCostsSchema>;

export function createDefaultCaseSale(seed = 1): CaseSale {
  return {
    id: `sale-${Date.now()}-${seed}`,
    annoncør: "",
    fromDate: "",
    toDate: "",
    salgspris: 0,
    notes: "",
  };
}

/**
 * Returns the effective medieSalg: sum of sales when present,
 * else the legacy costs.medieSalg value.
 */
export function effectiveMedieSalg(sales: CaseSale[], legacyMedieSalg = 0): number {
  if (sales && sales.length > 0) {
    return sales.reduce((sum, s) => sum + (s.salgspris || 0), 0);
  }
  return legacyMedieSalg;
}

export const caseSchema = z.object({
  id: z.string().min(1),
  caseNumber: z.string().min(1),
  title: z.string().min(1).default("Case"),

  // Relations to existing entities (optional)
  tilbudId: z.string().optional().default(""),
  placementId: z.string().optional().default(""),

  // Address / bygherre
  address: z.string().default(""),
  bygherreNavn: z.string().default(""),
  bygherreContactId: z.string().optional().default(""),

  // Timeline
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  varighedMaaneder: z.number().int().min(1).max(12).default(1),

  // Area (used for default cost calculations)
  areaSqm: z.number().nonnegative().default(0),

  // Revenue split (between Hyde and bygherre on Medievisning)
  hydeSharePct: z.number().min(0).max(100).default(40),
  bygherreSharePct: z.number().min(0).max(100).default(60),

  // Sales — one entry per advertiser booking within the case window.
  // Total medieSalg = sum(sales.salgspris).
  sales: z.array(caseSaleSchema).default([]),

  // Costs (salgspris + kostpris)
  costs: caseCostsSchema.default({
    produktionSalg: 0,
    produktionKost: 0,
    monteringSalg: 0,
    monteringKost: 0,
    medieSalg: 0,
    kommunaleGebyr: 0,
    internalOverhead: 0,
  }),

  status: caseStatusSchema.default("tilbud_sendt"),
  notes: z.string().optional().default(""),

  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const caseUpsertInputSchema = caseSchema.partial().extend({
  id: z.string().optional(),
});

export type Case = z.infer<typeof caseSchema>;
export type CaseUpsertInput = z.infer<typeof caseUpsertInputSchema>;

export interface CaseListResult {
  items: Case[];
  total: number;
}

export function createDefaultCase(seed = 1): Case {
  const now = new Date().toISOString();
  const stamp = now.slice(0, 10).replace(/-/g, "");
  return {
    id: `case-${Date.now()}-${seed}`,
    caseNumber: `C-${stamp}-${String(seed).padStart(3, "0")}`,
    title: "Case",
    tilbudId: "",
    placementId: "",
    address: "",
    bygherreNavn: "",
    bygherreContactId: "",
    startDate: "",
    endDate: "",
    varighedMaaneder: 6,
    areaSqm: 0,
    hydeSharePct: 40,
    bygherreSharePct: 60,
    sales: [],
    costs: {
      produktionSalg: 0,
      produktionKost: 0,
      monteringSalg: 0,
      monteringKost: 0,
      medieSalg: 0,
      kommunaleGebyr: 0,
      internalOverhead: 0,
    },
    status: "tilbud_sendt",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Cost settings (global default kostpriser) ──────────────

export const costSettingsSchema = z.object({
  produktionKostPerSqm: z.number().nonnegative().default(90),
  monteringKostPerSqm: z.number().nonnegative().default(70),
  defaultHydeSharePct: z.number().min(0).max(100).default(40),
  defaultOverheadPerMonth: z.number().nonnegative().default(0),
  updatedAt: z.string().min(1),
});

export type CostSettings = z.infer<typeof costSettingsSchema>;

export function defaultCostSettings(): CostSettings {
  return {
    produktionKostPerSqm: 90,
    monteringKostPerSqm: 70,
    defaultHydeSharePct: 40,
    defaultOverheadPerMonth: 0,
    updatedAt: new Date().toISOString(),
  };
}

// ─── Operating expenses (faste driftsudgifter) ──────────────

export const operatingExpenseCategorySchema = z.enum([
  "loen",
  "leje",
  "forsikring",
  "transport",
  "marketing",
  "software",
  "andet",
]);

export type OperatingExpenseCategory = z.infer<typeof operatingExpenseCategorySchema>;

export const OPERATING_EXPENSE_LABEL: Record<OperatingExpenseCategory, string> = {
  loen: "Løn",
  leje: "Leje",
  forsikring: "Forsikring",
  transport: "Transport/Kørsel",
  marketing: "Marketing",
  software: "Software/Abonnement",
  andet: "Andet",
};

export const operatingExpenseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: operatingExpenseCategorySchema.default("andet"),
  amountPerMonth: z.number().nonnegative().default(0),
  enabled: z.boolean().default(true),
  notes: z.string().optional().default(""),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const operatingExpenseUpsertSchema = operatingExpenseSchema.partial().extend({
  id: z.string().optional(),
  label: z.string().min(1, "Navn mangler"),
});

export type OperatingExpense = z.infer<typeof operatingExpenseSchema>;
export type OperatingExpenseUpsertInput = z.infer<typeof operatingExpenseUpsertSchema>;
