import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import {
  costSettingsSchema,
  defaultCostSettings,
  type CostSettings,
  type KommuneRate,
} from "./types";

const SETTINGS_ID = "default";

function rowToSettings(row: Record<string, unknown>): CostSettings {
  const rawRates = Array.isArray(row.kommunale_rates) ? row.kommunale_rates : [];
  const kommunaleRates: KommuneRate[] = rawRates
    .map((r) => {
      const rate = r as Record<string, unknown>;
      // Accept both new "perSqmPerDag" and legacy "perSqm" keys
      const perDay = rate.perSqmPerDag != null ? Number(rate.perSqmPerDag) : Number(rate.perSqm || 0);
      return {
        kommune: String(rate.kommune || ""),
        perSqmPerDag: perDay,
      };
    })
    .filter((r) => r.kommune.length > 0);

  return {
    produktionKostPerSqm: Number(row.produktion_kost_per_sqm || 0),
    monteringKostPerSqm: Number(row.montering_kost_per_sqm || 0),
    defaultHydeSharePct: Number(row.default_hyde_share_pct || 40),
    defaultOverheadPerMonth: Number(row.default_overhead_per_month || 0),
    kommunaleRates,
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function settingsToRow(s: CostSettings) {
  return {
    id: SETTINGS_ID,
    produktion_kost_per_sqm: s.produktionKostPerSqm,
    montering_kost_per_sqm: s.monteringKostPerSqm,
    default_hyde_share_pct: s.defaultHydeSharePct,
    default_overhead_per_month: s.defaultOverheadPerMonth,
    kommunale_rates: s.kommunaleRates || [],
  };
}

export async function getCostSettings(): Promise<CostSettings> {
  if (!HAS_SUPABASE || !supabase) return defaultCostSettings();
  try {
    const { data, error } = await supabase
      .from("case_settings")
      .select("*")
      .eq("id", SETTINGS_ID)
      .maybeSingle();
    if (error) throw error;
    if (data) return rowToSettings(data);

    // Seed default row if missing
    const fallback = defaultCostSettings();
    await supabase.from("case_settings").upsert(settingsToRow(fallback), { onConflict: "id" });
    return fallback;
  } catch (err) {
    logger.error(`[case-settings] getCostSettings error: ${err instanceof Error ? err.message : err}`);
    return defaultCostSettings();
  }
}

export async function updateCostSettings(patch: Partial<CostSettings>): Promise<CostSettings> {
  if (!HAS_SUPABASE || !supabase) {
    throw new Error("Supabase is not configured");
  }
  const current = await getCostSettings();
  const merged: CostSettings = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const parsed = costSettingsSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((x) => x.message).join(", "));
  }

  const { data, error } = await supabase
    .from("case_settings")
    .upsert(settingsToRow(parsed.data), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Upsert returned no data");
  return rowToSettings(data);
}
