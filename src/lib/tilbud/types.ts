import { z } from "zod";

export const tilbudLineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Linjenavn mangler"),
  description: z.string().optional().default(""),
  fromDate: z.string().optional().default(""),
  toDate: z.string().optional().default(""),
  fromWeek: z.number().int().nonnegative().optional(),
  toWeek: z.number().int().nonnegative().optional(),
  weeks: z.number().int().nonnegative().default(0),
  quantity: z.number().int().positive().default(1),
  listPrice: z.number().nonnegative().default(0),
  discountPct: z.number().min(0).max(100).default(0),
  widthMeters: z.number().nonnegative().default(0),
  heightMeters: z.number().nonnegative().default(0),
  unitPricePerSqmPerWeek: z.number().nonnegative().default(0),
  production: z.number().nonnegative().default(0),
  mounting: z.number().nonnegative().default(0),
  lights: z.number().nonnegative().default(0),
  netPrice: z.number().nonnegative().optional(),
  notes: z.string().optional().default(""),
});

export const fixedCostSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, "Navn mangler"),
  amount: z.number().nonnegative().default(0),
  enabled: z.boolean().default(true),
});

export const REQUIRED_FIXED_COST_LABELS: string[] = [];

export const REQUIRED_LINE_NAMES = [
  "Medievisning",
  "Produktion",
  "Montering",
  "Lys",
  "Kommunale gebyr",
] as const;

export const tilbudStatusSchema = z.enum(["draft", "final"]);

export const tilbudSchema = z.object({
  id: z.string().min(1),
  offerNumber: z.string().min(1),
  title: z.string().min(1).default("Tilbud"),
  offerDate: z.string().min(1),
  validUntil: z.string().optional().default(""),
  ourReference: z.string().optional().default(""),
  yourReference: z.string().optional().default(""),
  clientName: z.string().min(1, "Kundenavn mangler"),
  mediaAgency: z.string().optional().default(""),
  campaignName: z.string().optional().default(""),
  currency: z.string().default("DKK"),
  vatPct: z.number().min(0).default(25),
  infoCompensationPct: z.number().min(0).default(1.5),
  securityPct: z.number().min(0).default(1),
  comments: z.string().optional().default(""),
  terms: z.string().optional().default("Alle priser er eksklusive moms. Standardbestemmelser gælder."),
  status: tilbudStatusSchema.default("draft"),
  lines: z.array(tilbudLineSchema).default([]),
  fixedCosts: z.array(fixedCostSchema).default([]),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const tilbudUpsertInputSchema = tilbudSchema.partial().extend({
  id: z.string().optional(),
  lines: z.array(tilbudLineSchema).optional(),
  status: tilbudStatusSchema.optional(),
  clientName: z.string().optional(),
});

export type TilbudLine = z.infer<typeof tilbudLineSchema>;
export type FixedCost = z.infer<typeof fixedCostSchema>;
export type Tilbud = z.infer<typeof tilbudSchema>;
export type TilbudStatus = z.infer<typeof tilbudStatusSchema>;
export type TilbudUpsertInput = z.infer<typeof tilbudUpsertInputSchema>;

export interface TilbudListResult {
  items: Tilbud[];
  total: number;
}

export function createDefaultTilbudLine(seed = 1, name = ""): TilbudLine {
  return {
    id: `line-${Date.now()}-${seed}`,
    name,
    description: "",
    fromDate: "",
    toDate: "",
    fromWeek: undefined,
    toWeek: undefined,
    weeks: 0,
    quantity: 1,
    listPrice: 0,
    discountPct: 0,
    widthMeters: 0,
    heightMeters: 0,
    unitPricePerSqmPerWeek: 0,
    production: 0,
    mounting: 0,
    lights: 0,
    notes: "",
  };
}

export function createRequiredLines(seed = 1): TilbudLine[] {
  return REQUIRED_LINE_NAMES.map((name, index) => createDefaultTilbudLine(seed + index, name));
}

export function isRequiredLineName(name?: string): boolean {
  const value = (name || "").trim().toLowerCase();
  return REQUIRED_LINE_NAMES.some((required) => required.toLowerCase() === value);
}

export function normalizeLines(lines?: TilbudLine[]): TilbudLine[] {
  return lines || [];
}

export function createDefaultFixedCost(seed = 1): FixedCost {
  return {
    id: `cost-${Date.now()}-${seed}`,
    label: "",
    amount: 0,
    enabled: true,
  };
}

export function createRequiredFixedCosts(seed = 1): FixedCost[] {
  return REQUIRED_FIXED_COST_LABELS.map((label, index) => ({
    id: `cost-${Date.now()}-${seed}-${index + 1}`,
    label,
    amount: 0,
    enabled: false,
  }));
}

export function normalizeFixedCosts(costs?: FixedCost[]): FixedCost[] {
  const source = costs || [];
  const normalizedRequired = REQUIRED_FIXED_COST_LABELS.map((label, index) => {
    const existing = source.find((cost) => cost.label.trim().toLowerCase() === label.toLowerCase());
    if (existing) {
      return { ...existing, label };
    }
    return {
      id: `cost-${Date.now()}-required-${index + 1}`,
      label,
      amount: 0,
      enabled: false,
    };
  });

  const custom = source.filter(
    (cost) =>
      !REQUIRED_FIXED_COST_LABELS.some(
        (label) => label.toLowerCase() === cost.label.trim().toLowerCase()
      )
  );

  return [...normalizedRequired, ...custom];
}

export function createDefaultTilbud(seed = 1): Tilbud {
  const now = new Date().toISOString();
  const short = now.slice(0, 10).replace(/-/g, "");
  return {
    id: `tilbud-${Date.now()}-${seed}`,
    offerNumber: `T-${short}-${seed}`,
    title: "Tilbud",
    offerDate: now.slice(0, 10),
    validUntil: "",
    ourReference: "",
    yourReference: "",
    clientName: "",
    mediaAgency: "",
    campaignName: "",
    currency: "DKK",
    vatPct: 25,
    infoCompensationPct: 1.5,
    securityPct: 1,
    comments: "",
    terms: "Alle priser er eksklusive moms. Standardbestemmelser gælder.",
    status: "draft",
    lines: createRequiredLines(seed),
    fixedCosts: [],
    createdAt: now,
    updatedAt: now,
  };
}
