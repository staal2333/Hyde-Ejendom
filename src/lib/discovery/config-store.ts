// ============================================================
// Discovery Config – Supabase data layer
// CRUD for auto-discovery configuration (streets + scaffolding)
// ============================================================

import { supabase, HAS_SUPABASE } from "../supabase";
import { logger } from "../logger";

export type DiscoveryType = "scaffolding" | "street";

export interface DiscoveryConfig {
  id: string;
  type: DiscoveryType;
  city: string;
  street: string | null;
  minScore: number;
  minTraffic: number;
  isActive: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToConfig(r: any): DiscoveryConfig {
  return {
    id: r.id,
    type: r.type,
    city: r.city,
    street: r.street ?? null,
    minScore: Number(r.min_score ?? 6),
    minTraffic: Number(r.min_traffic ?? 10000),
    isActive: r.is_active ?? true,
    lastRunAt: r.last_run_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

let tableEnsured = false;

async function ensureTable(): Promise<boolean> {
  if (!HAS_SUPABASE) return false;
  if (tableEnsured) return true;

  const { error } = await supabase!
    .from("discovery_config")
    .select("id")
    .limit(1);

  if (error && error.message.includes("discovery_config")) {
    logger.warn("[discovery-config] Table does not exist yet. Create it in Supabase SQL editor.", {
      service: "discovery-config",
    });
    return false;
  }

  tableEnsured = true;
  return true;
}

export async function listDiscoveryConfigs(opts?: {
  activeOnly?: boolean;
  type?: DiscoveryType;
}): Promise<DiscoveryConfig[]> {
  if (!(await ensureTable())) return [];

  let query = supabase!
    .from("discovery_config")
    .select("*")
    .order("created_at", { ascending: false });

  if (opts?.activeOnly) query = query.eq("is_active", true);
  if (opts?.type) query = query.eq("type", opts.type);

  const { data, error } = await query;
  if (error) {
    logger.error(`[discovery-config] list error: ${error.message}`);
    return [];
  }
  return (data || []).map(rowToConfig);
}

export async function getDiscoveryConfig(id: string): Promise<DiscoveryConfig | null> {
  if (!(await ensureTable())) return null;

  const { data, error } = await supabase!
    .from("discovery_config")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return rowToConfig(data);
}

export async function upsertDiscoveryConfig(config: {
  id?: string;
  type: DiscoveryType;
  city: string;
  street?: string | null;
  minScore?: number;
  minTraffic?: number;
  isActive?: boolean;
}): Promise<DiscoveryConfig | null> {
  if (!(await ensureTable())) return null;

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    type: config.type,
    city: config.city,
    street: config.street ?? null,
    min_score: config.minScore ?? 6,
    min_traffic: config.minTraffic ?? 10000,
    is_active: config.isActive ?? true,
    updated_at: now,
  };

  if (config.id) {
    row.id = config.id;
  }

  const { data, error } = await supabase!
    .from("discovery_config")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    logger.error(`[discovery-config] upsert error: ${error.message}`);
    return null;
  }
  return rowToConfig(data);
}

export async function deleteDiscoveryConfig(id: string): Promise<boolean> {
  if (!(await ensureTable())) return false;

  const { error } = await supabase!
    .from("discovery_config")
    .delete()
    .eq("id", id);

  return !error;
}

export async function markConfigRun(id: string): Promise<void> {
  if (!(await ensureTable())) return;

  await supabase!
    .from("discovery_config")
    .update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
}
