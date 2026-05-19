import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import {
  caseSchema,
  createDefaultCase,
  type Case,
  type CaseListResult,
  type CaseSale,
  type CaseStatus,
  type CaseUpsertInput,
} from "./types";

// ─── Row mapping ────────────────────────────────────────────

function rowToCase(row: Record<string, unknown>): Case {
  const sales = (Array.isArray(row.sales) ? row.sales : []) as CaseSale[];
  const costs = (typeof row.costs === "object" && row.costs ? row.costs : {}) as Case["costs"];
  return {
    id: String(row.id),
    caseNumber: String(row.case_number || ""),
    title: String(row.title || "Case"),
    tilbudId: String(row.tilbud_id || ""),
    placementId: String(row.placement_id || ""),
    address: String(row.address || ""),
    kommune: String(row.kommune || ""),
    bygherreNavn: String(row.bygherre_navn || ""),
    bygherreContactId: String(row.bygherre_contact_id || ""),
    startDate: String(row.start_date || ""),
    endDate: String(row.end_date || ""),
    varighedMaaneder: Number(row.varighed_maaneder || 1),
    areaSqm: Number(row.area_sqm || 0),
    hydeSharePct: Number(row.hyde_share_pct || 40),
    bygherreSharePct: Number(row.bygherre_share_pct || 60),
    sales,
    costs: {
      produktionSalg: Number(costs.produktionSalg || 0),
      monteringSalg: Number(costs.monteringSalg || 0),
      kommunaleSalg: Number(costs.kommunaleSalg || costs.kommunaleGebyr || 0),
      produktionKost: Number(costs.produktionKost || 0),
      monteringKost: Number(costs.monteringKost || 0),
      kommunaleKost: Number(costs.kommunaleKost || costs.kommunaleGebyr || 0),
      medieSalg: Number(costs.medieSalg || 0),
      kommunaleGebyr: Number(costs.kommunaleGebyr || 0),
      internalOverhead: Number(costs.internalOverhead || 0),
    },
    status: (row.status as CaseStatus) || "tilbud_sendt",
    notes: String(row.notes || ""),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function caseToRow(c: Case): Record<string, unknown> {
  return {
    id: c.id,
    case_number: c.caseNumber,
    title: c.title,
    tilbud_id: c.tilbudId || "",
    placement_id: c.placementId || "",
    address: c.address || "",
    kommune: c.kommune || "",
    bygherre_navn: c.bygherreNavn || "",
    bygherre_contact_id: c.bygherreContactId || "",
    start_date: c.startDate || "",
    end_date: c.endDate || "",
    varighed_maaneder: c.varighedMaaneder,
    area_sqm: c.areaSqm,
    hyde_share_pct: c.hydeSharePct,
    bygherre_share_pct: c.bygherreSharePct,
    sales: c.sales || [],
    costs: c.costs,
    status: c.status,
    notes: c.notes || "",
  };
}

// ─── Helpers ────────────────────────────────────────────────

function normalizeCaseNumber(input: string | undefined, fallbackIndex: number): string {
  if (input && input.trim()) return input.trim();
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `C-${stamp}-${String(fallbackIndex).padStart(3, "0")}`;
}

// ─── Public API (async) ─────────────────────────────────────

export async function listCases(opts?: {
  q?: string;
  status?: CaseStatus;
  limit?: number;
  offset?: number;
}): Promise<CaseListResult> {
  if (!HAS_SUPABASE || !supabase) {
    return { items: [], total: 0 };
  }
  try {
    let query = supabase
      .from("cases")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false });

    if (opts?.status) query = query.eq("status", opts.status);
    if (opts?.q) {
      const q = opts.q.replace(/[%_]/g, "");
      query = query.or(
        `title.ilike.%${q}%,case_number.ilike.%${q}%,address.ilike.%${q}%,bygherre_navn.ilike.%${q}%`
      );
    }
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    const items = (data || []).map(rowToCase);
    return { items, total: count ?? items.length };
  } catch (err) {
    logger.error(`[case-store] listCases error: ${err instanceof Error ? err.message : err}`);
    return { items: [], total: 0 };
  }
}

export async function getCase(id: string): Promise<Case | undefined> {
  if (!HAS_SUPABASE || !supabase) return undefined;
  try {
    const { data, error } = await supabase.from("cases").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? rowToCase(data) : undefined;
  } catch (err) {
    logger.error(`[case-store] getCase error: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

export async function listAllCases(): Promise<Case[]> {
  const { items } = await listCases({ limit: 1000 });
  return items;
}

export async function upsertCase(input: CaseUpsertInput): Promise<Case> {
  if (!HAS_SUPABASE || !supabase) {
    throw new Error("Supabase is not configured");
  }

  // Load existing if id provided, so we can merge partial updates
  const existing = input.id ? await getCase(input.id) : undefined;
  const base = existing ?? createDefaultCase(Date.now());

  // Determine fallback index for case-number generation
  let fallbackIndex = 1;
  if (!existing) {
    const { count } = await supabase
      .from("cases")
      .select("id", { count: "exact", head: true });
    fallbackIndex = (count || 0) + 1;
  }

  const merged: Case = {
    ...base,
    ...input,
    id: input.id ?? base.id,
    caseNumber: normalizeCaseNumber(input.caseNumber ?? base.caseNumber, fallbackIndex),
    sales: input.sales ?? base.sales ?? [],
    costs: { ...base.costs, ...(input.costs || {}) },
    createdAt: existing?.createdAt ?? base.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const parsed = caseSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((x) => x.message).join(", "));
  }

  const row = caseToRow(parsed.data);
  const { data, error } = await supabase
    .from("cases")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Upsert returned no data");
  return rowToCase(data);
}

export async function deleteCase(id: string): Promise<boolean> {
  if (!HAS_SUPABASE || !supabase) return false;
  try {
    const { error } = await supabase.from("cases").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    logger.error(`[case-store] deleteCase error: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
