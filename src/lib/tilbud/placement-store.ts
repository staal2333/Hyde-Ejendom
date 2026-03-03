import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import type { Placement, PlacementListResult, PlacementUpsertInput } from "./placement-types";

function rowToPlacement(row: Record<string, unknown>): Placement {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    areaSqm: Number(row.area_sqm || 0),
    listPricePerSqmPerWeek: Number(row.list_price_per_sqm_per_week || 0),
    kommunaleGebyr: Number(row.kommunale_gebyr || 0),
    notes: String(row.notes || ""),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function placementToRow(p: PlacementUpsertInput) {
  return {
    ...(p.id ? { id: p.id } : {}),
    name: p.name,
    area_sqm: p.areaSqm,
    ...(p.listPricePerSqmPerWeek != null ? { list_price_per_sqm_per_week: p.listPricePerSqmPerWeek } : {}),
    ...(p.kommunaleGebyr != null ? { kommunale_gebyr: p.kommunaleGebyr } : {}),
    ...(p.notes != null ? { notes: p.notes } : {}),
    updated_at: new Date().toISOString(),
  };
}

export async function listPlacements(): Promise<PlacementListResult> {
  if (!HAS_SUPABASE || !supabase) {
    return { items: [], total: 0 };
  }
  try {
    const { data, error, count } = await supabase
      .from("placements")
      .select("*", { count: "exact" })
      .order("name", { ascending: true });

    if (error) throw error;
    const items = (data || []).map(rowToPlacement);
    return { items, total: count ?? items.length };
  } catch (err) {
    logger.error(`[placement-store] listPlacements error: ${err instanceof Error ? err.message : err}`);
    return { items: [], total: 0 };
  }
}

export async function getPlacement(id: string): Promise<Placement | null> {
  if (!HAS_SUPABASE || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from("placements")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data ? rowToPlacement(data) : null;
  } catch (err) {
    logger.error(`[placement-store] getPlacement error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function upsertPlacement(input: PlacementUpsertInput): Promise<Placement | null> {
  if (!HAS_SUPABASE || !supabase) return null;
  try {
    const row = placementToRow(input);
    const { data, error } = await supabase
      .from("placements")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();

    if (error) throw error;
    return data ? rowToPlacement(data) : null;
  } catch (err) {
    logger.error(`[placement-store] upsertPlacement error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function deletePlacement(id: string): Promise<boolean> {
  if (!HAS_SUPABASE || !supabase) return false;
  try {
    const { error } = await supabase
      .from("placements")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  } catch (err) {
    logger.error(`[placement-store] deletePlacement error: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
