import { z } from "zod";
import type { TilbudLine } from "./types";

export const MONTERING_PER_SQM = 125;
export const PRODUKTION_PER_SQM = 150;

export const placementSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Placeringsnavn mangler"),
  areaSqm: z.number().positive("Areal skal være > 0"),
  listPricePerSqmPerWeek: z.number().nonnegative().default(0),
  kommunaleGebyr: z.number().nonnegative().default(0),
  notes: z.string().optional().default(""),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const placementUpsertSchema = placementSchema.partial().extend({
  id: z.string().optional(),
  name: z.string().min(1, "Placeringsnavn mangler"),
  areaSqm: z.number().positive("Areal skal være > 0"),
});

export type Placement = z.infer<typeof placementSchema>;
export type PlacementUpsertInput = z.infer<typeof placementUpsertSchema>;

export interface PlacementListResult {
  items: Placement[];
  total: number;
}

export function createDefaultPlacement(): Placement {
  const now = new Date().toISOString();
  return {
    id: `placement-${Date.now()}`,
    name: "",
    areaSqm: 0,
    listPricePerSqmPerWeek: 0,
    kommunaleGebyr: 0,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate the standard tilbud lines from a placement template.
 * Medievisning gets the per-m² list price; Produktion/Montering use global constants.
 */
export function placementToLines(
  placement: Placement,
  weeks: number
): TilbudLine[] {
  const ts = Date.now();
  const area = placement.areaSqm;
  const mediaListPrice = area * placement.listPricePerSqmPerWeek * Math.max(1, weeks);
  const produktionTotal = area * PRODUKTION_PER_SQM;
  const monteringTotal = area * MONTERING_PER_SQM;

  return [
    {
      id: `line-${ts}-1`,
      name: "Medievisning",
      description: placement.name,
      fromDate: "",
      toDate: "",
      fromWeek: undefined,
      toWeek: undefined,
      weeks,
      quantity: 1,
      listPrice: Number(mediaListPrice.toFixed(2)),
      discountPct: 0,
      widthMeters: 0,
      heightMeters: 0,
      unitPricePerSqmPerWeek: placement.listPricePerSqmPerWeek,
      production: 0,
      mounting: 0,
      lights: 0,
      notes: `${area} m² — ${placement.name}`,
    },
    {
      id: `line-${ts}-2`,
      name: "Produktion",
      description: "",
      fromDate: "",
      toDate: "",
      fromWeek: undefined,
      toWeek: undefined,
      weeks: 0,
      quantity: 1,
      listPrice: Number(produktionTotal.toFixed(2)),
      discountPct: 0,
      widthMeters: 0,
      heightMeters: 0,
      unitPricePerSqmPerWeek: 0,
      production: 0,
      mounting: 0,
      lights: 0,
      notes: `${area} m² × ${PRODUKTION_PER_SQM} DKK/m²`,
    },
    {
      id: `line-${ts}-3`,
      name: "Montering",
      description: "",
      fromDate: "",
      toDate: "",
      fromWeek: undefined,
      toWeek: undefined,
      weeks: 0,
      quantity: 1,
      listPrice: Number(monteringTotal.toFixed(2)),
      discountPct: 0,
      widthMeters: 0,
      heightMeters: 0,
      unitPricePerSqmPerWeek: 0,
      production: 0,
      mounting: 0,
      lights: 0,
      notes: `${area} m² × ${MONTERING_PER_SQM} DKK/m²`,
    },
    ...(placement.kommunaleGebyr > 0
      ? [
          {
            id: `line-${ts}-4`,
            name: "Kommunale gebyr",
            description: "",
            fromDate: "",
            toDate: "",
            fromWeek: undefined,
            toWeek: undefined,
            weeks: 0,
            quantity: 1,
            listPrice: placement.kommunaleGebyr,
            discountPct: 0,
            widthMeters: 0,
            heightMeters: 0,
            unitPricePerSqmPerWeek: 0,
            production: 0,
            mounting: 0,
            lights: 0,
            notes: "",
          },
        ]
      : []),
  ];
}
