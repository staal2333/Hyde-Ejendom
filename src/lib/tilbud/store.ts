import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import type {
  FixedCost,
  Tilbud,
  TilbudLine,
  TilbudListResult,
  TilbudStatus,
  TilbudUpsertInput,
} from "./types";
import { createDefaultTilbud, normalizeFixedCosts, tilbudSchema } from "./types";

// ─── Row mapping ────────────────────────────────────────────

function rowToTilbud(row: Record<string, unknown>): Tilbud {
  const lines = (Array.isArray(row.lines) ? row.lines : []) as TilbudLine[];
  const fixedCosts = (Array.isArray(row.fixed_costs) ? row.fixed_costs : []) as FixedCost[];
  return {
    id: String(row.id),
    offerNumber: String(row.offer_number || ""),
    title: String(row.title || "Tilbud"),
    offerDate: String(row.offer_date || ""),
    validUntil: String(row.valid_until || ""),
    ourReference: String(row.our_reference || ""),
    yourReference: String(row.your_reference || ""),
    clientName: String(row.client_name || ""),
    mediaAgency: String(row.media_agency || ""),
    campaignName: String(row.campaign_name || ""),
    currency: String(row.currency || "DKK"),
    vatPct: Number(row.vat_pct ?? 25),
    infoCompensationPct: Number(row.info_compensation_pct ?? 1.5),
    securityPct: Number(row.security_pct ?? 1),
    comments: String(row.comments || ""),
    terms: String(row.terms || ""),
    status: (row.status as TilbudStatus) || "draft",
    lines,
    fixedCosts: normalizeFixedCosts(fixedCosts),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function tilbudToRow(t: Tilbud): Record<string, unknown> {
  return {
    id: t.id,
    offer_number: t.offerNumber,
    title: t.title,
    offer_date: t.offerDate,
    valid_until: t.validUntil || "",
    our_reference: t.ourReference || "",
    your_reference: t.yourReference || "",
    client_name: t.clientName || "",
    media_agency: t.mediaAgency || "",
    campaign_name: t.campaignName || "",
    currency: t.currency || "DKK",
    vat_pct: t.vatPct,
    info_compensation_pct: t.infoCompensationPct,
    security_pct: t.securityPct,
    comments: t.comments || "",
    terms: t.terms || "",
    status: t.status,
    lines: t.lines || [],
    fixed_costs: t.fixedCosts || [],
  };
}

function normalizeOfferNumber(input: string | undefined, fallbackIndex: number): string {
  if (input && input.trim()) return input.trim();
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `T-${stamp}-${String(fallbackIndex).padStart(3, "0")}`;
}

// ─── Public API (async) ─────────────────────────────────────

export async function listTilbud(opts?: {
  q?: string;
  status?: TilbudStatus;
  limit?: number;
  offset?: number;
}): Promise<TilbudListResult> {
  if (!HAS_SUPABASE || !supabase) return { items: [], total: 0 };
  try {
    let query = supabase
      .from("tilbud")
      .select("*", { count: "exact" })
      .order("updated_at", { ascending: false });

    if (opts?.status) query = query.eq("status", opts.status);
    if (opts?.q) {
      const q = opts.q.replace(/[%_]/g, "");
      query = query.or(
        `client_name.ilike.%${q}%,offer_number.ilike.%${q}%,campaign_name.ilike.%${q}%`
      );
    }
    const limit = opts?.limit ?? 30;
    const offset = opts?.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    const items = (data || []).map(rowToTilbud);
    return { items, total: count ?? items.length };
  } catch (err) {
    logger.error(`[tilbud-store] listTilbud error: ${err instanceof Error ? err.message : err}`);
    return { items: [], total: 0 };
  }
}

export async function getTilbudSummary(): Promise<{
  total: number;
  draft: number;
  final: number;
  totalValue: number;
}> {
  if (!HAS_SUPABASE || !supabase) {
    return { total: 0, draft: 0, final: 0, totalValue: 0 };
  }
  try {
    const { data, error } = await supabase.from("tilbud").select("status,lines,fixed_costs");
    if (error) throw error;
    const all = data || [];
    let totalValue = 0;
    for (const row of all) {
      const lines = (Array.isArray(row.lines) ? row.lines : []) as Array<{
        quantity?: number;
        listPrice?: number;
        discountPct?: number;
      }>;
      const lineTotal = lines.reduce((s, l) => {
        const price = l.listPrice ?? 0;
        const disc = l.discountPct ?? 0;
        return s + (l.quantity ?? 1) * price * (1 - disc / 100);
      }, 0);
      const fixed = (Array.isArray(row.fixed_costs) ? row.fixed_costs : []).reduce(
        (s: number, f: { amount?: number; enabled?: boolean }) =>
          f.enabled !== false ? s + (f.amount ?? 0) : s,
        0
      );
      totalValue += lineTotal + fixed;
    }
    return {
      total: all.length,
      draft: all.filter((t) => t.status === "draft").length,
      final: all.filter((t) => t.status === "final").length,
      totalValue,
    };
  } catch (err) {
    logger.error(`[tilbud-store] getTilbudSummary error: ${err instanceof Error ? err.message : err}`);
    return { total: 0, draft: 0, final: 0, totalValue: 0 };
  }
}

export async function getTilbud(id: string): Promise<Tilbud | undefined> {
  if (!HAS_SUPABASE || !supabase) return undefined;
  try {
    const { data, error } = await supabase.from("tilbud").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? rowToTilbud(data) : undefined;
  } catch (err) {
    logger.error(`[tilbud-store] getTilbud error: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

export async function upsertTilbud(input: TilbudUpsertInput): Promise<Tilbud> {
  if (!HAS_SUPABASE || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const existing = input.id ? await getTilbud(input.id) : undefined;
  const base = existing ?? createDefaultTilbud(Date.now());

  let fallbackIndex = 1;
  if (!existing) {
    const { count } = await supabase.from("tilbud").select("id", { count: "exact", head: true });
    fallbackIndex = (count || 0) + 1;
  }

  const merged: Tilbud = {
    ...base,
    ...input,
    id: input.id ?? base.id,
    offerNumber: normalizeOfferNumber(input.offerNumber ?? base.offerNumber, fallbackIndex),
    clientName: input.clientName ?? base.clientName,
    lines: input.lines ?? base.lines,
    fixedCosts: normalizeFixedCosts(input.fixedCosts ?? base.fixedCosts),
    status: input.status ?? base.status,
    createdAt: existing?.createdAt ?? base.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const parsed = tilbudSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((x) => x.message).join(", "));
  }

  const { data, error } = await supabase
    .from("tilbud")
    .upsert(tilbudToRow(parsed.data), { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Upsert returned no data");
  return rowToTilbud(data);
}

export async function deleteTilbud(id: string): Promise<boolean> {
  if (!HAS_SUPABASE || !supabase) return false;
  try {
    const { error } = await supabase.from("tilbud").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    logger.error(`[tilbud-store] deleteTilbud error: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
