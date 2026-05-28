import { z } from "zod";
import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export const PLANNED_CATEGORIES = [
  "faktura",
  "moms",
  "leverandoer",
  "loen",
  "drift",
  "andet",
] as const;

export const PLANNED_CATEGORY_LABEL: Record<string, string> = {
  faktura: "Faktura",
  moms: "Moms",
  leverandoer: "Leverandør",
  loen: "Løn",
  drift: "Drift",
  andet: "Andet",
};

export const plannedPaymentSchema = z.object({
  id: z.string().min(1),
  label: z.string().default(""),
  direction: z.enum(["ind", "ud"]).default("ind"),
  amount: z.number().nonnegative().default(0),
  expectedDate: z.string().min(1), // YYYY-MM-DD
  category: z.enum(PLANNED_CATEGORIES).default("andet"),
  status: z.enum(["forventet", "modtaget", "betalt"]).default("forventet"),
  notes: z.string().optional().default(""),
});

export const plannedPaymentUpsertSchema = plannedPaymentSchema.partial().extend({
  id: z.string().optional(),
  expectedDate: z.string().min(1, "Dato mangler"),
});

export type PlannedPayment = z.infer<typeof plannedPaymentSchema>;
export type PlannedPaymentUpsertInput = z.infer<typeof plannedPaymentUpsertSchema>;

function rowToPayment(row: Record<string, unknown>): PlannedPayment {
  return {
    id: String(row.id),
    label: String(row.label || ""),
    direction: (row.direction as "ind" | "ud") || "ind",
    amount: Number(row.amount || 0),
    expectedDate: String(row.expected_date || "").slice(0, 10),
    category: (row.category as PlannedPayment["category"]) || "andet",
    status: (row.status as PlannedPayment["status"]) || "forventet",
    notes: String(row.notes || ""),
  };
}

function paymentToRow(p: PlannedPayment): Record<string, unknown> {
  return {
    id: p.id,
    label: p.label,
    direction: p.direction,
    amount: p.amount,
    expected_date: p.expectedDate,
    category: p.category,
    status: p.status,
    notes: p.notes || "",
  };
}

export async function listPlannedPayments(): Promise<PlannedPayment[]> {
  if (!HAS_SUPABASE || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("planned_payments")
      .select("*")
      .order("expected_date", { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToPayment);
  } catch (err) {
    logger.error(`[planned-payments] list error: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function getPlannedPayment(id: string): Promise<PlannedPayment | null> {
  if (!HAS_SUPABASE || !supabase) return null;
  try {
    const { data, error } = await supabase
      .from("planned_payments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToPayment(data) : null;
  } catch (err) {
    logger.error(`[planned-payments] get error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Match bankrækker mod planlagte 'forventet'-rækker og sæt status til 'modtaget'/'betalt'.
 * Match-kriterier:
 *   - direction "ind" ↔ positiv transaktion, "ud" ↔ negativ
 *   - beløb matcher inden for 0,5 kr (rounding)
 *   - dato inden for ±14 dage af expected_date (bank-bogføring lagger ofte ift. fakturadato)
 *   - hver planlagt kan kun matches én gang per import
 *   - hvis flere planlagte matcher samme transaktion → spring over (ambiguøst)
 */
export interface MatchedPayment {
  id: string;
  label: string;
  newStatus: "modtaget" | "betalt";
  matchedTransactionTitle: string;
  matchedTransactionDate: string;
}

export async function autoMatchToPlannedPayments(
  txs: Array<{ postedDate: string; title: string; amount: number }>
): Promise<MatchedPayment[]> {
  if (!HAS_SUPABASE || !supabase) return [];
  const planned = await listPlannedPayments();
  const pending = planned.filter((p) => p.status === "forventet");
  if (pending.length === 0) return [];

  const AMOUNT_TOLERANCE = 0.5;
  const DAYS_TOLERANCE = 14;

  const dayMs = 24 * 60 * 60 * 1000;
  const matched: MatchedPayment[] = [];
  const usedPlannedIds = new Set<string>();

  for (const tx of txs) {
    const txAbs = Math.abs(tx.amount);
    const txSignIn = tx.amount > 0; // ind = positiv
    const candidates = pending.filter((p) => {
      if (usedPlannedIds.has(p.id)) return false;
      if (p.direction === "ind" && !txSignIn) return false;
      if (p.direction === "ud" && txSignIn) return false;
      if (Math.abs(p.amount - txAbs) > AMOUNT_TOLERANCE) return false;
      const dDiff = Math.abs(
        (new Date(p.expectedDate).getTime() - new Date(tx.postedDate).getTime()) / dayMs
      );
      return dDiff <= DAYS_TOLERANCE;
    });

    if (candidates.length !== 1) continue; // 0 = no match, >1 = ambiguous

    const winner = candidates[0];
    const newStatus = winner.direction === "ind" ? "modtaget" : "betalt";
    const { error } = await supabase
      .from("planned_payments")
      .update({ status: newStatus })
      .eq("id", winner.id);
    if (error) {
      logger.warn(`[planned-payments] auto-match update failed for ${winner.id}: ${error.message}`);
      continue;
    }
    usedPlannedIds.add(winner.id);
    matched.push({
      id: winner.id,
      label: winner.label,
      newStatus,
      matchedTransactionTitle: tx.title,
      matchedTransactionDate: tx.postedDate,
    });
  }

  return matched;
}

export async function upsertPlannedPayment(
  input: PlannedPaymentUpsertInput
): Promise<PlannedPayment> {
  if (!HAS_SUPABASE || !supabase) throw new Error("Supabase is not configured");
  const now = new Date().toISOString();
  const base: PlannedPayment = {
    id: input.id || `pp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    direction: "ind",
    amount: 0,
    expectedDate: now.slice(0, 10),
    category: "andet",
    status: "forventet",
    notes: "",
  };
  const merged: PlannedPayment = { ...base, ...input, id: base.id };
  const parsed = plannedPaymentSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((x) => x.message).join(", "));
  }
  const { data, error } = await supabase
    .from("planned_payments")
    .upsert(paymentToRow(parsed.data), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Upsert returned no data");
  return rowToPayment(data);
}

export async function deletePlannedPayment(id: string): Promise<boolean> {
  if (!HAS_SUPABASE || !supabase) return false;
  try {
    const { error } = await supabase.from("planned_payments").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    logger.error(`[planned-payments] delete error: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
