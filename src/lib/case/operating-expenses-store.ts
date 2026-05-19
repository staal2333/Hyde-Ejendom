import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import {
  operatingExpenseSchema,
  type OperatingExpense,
  type OperatingExpenseCategory,
  type OperatingExpenseUpsertInput,
} from "./types";

function rowToExpense(row: Record<string, unknown>): OperatingExpense {
  return {
    id: String(row.id),
    label: String(row.label || ""),
    category: (row.category as OperatingExpenseCategory) || "andet",
    amountPerMonth: Number(row.amount_per_month || 0),
    enabled: row.enabled !== false,
    notes: String(row.notes || ""),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  };
}

function expenseToRow(e: OperatingExpense) {
  return {
    id: e.id,
    label: e.label,
    category: e.category,
    amount_per_month: e.amountPerMonth,
    enabled: e.enabled,
    notes: e.notes || "",
  };
}

export async function listOperatingExpenses(): Promise<OperatingExpense[]> {
  if (!HAS_SUPABASE || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("operating_expenses")
      .select("*")
      .order("label", { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToExpense);
  } catch (err) {
    logger.error(`[opex-store] list error: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function getOperatingExpense(id: string): Promise<OperatingExpense | undefined> {
  if (!HAS_SUPABASE || !supabase) return undefined;
  try {
    const { data, error } = await supabase
      .from("operating_expenses")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToExpense(data) : undefined;
  } catch (err) {
    logger.error(`[opex-store] get error: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

export async function upsertOperatingExpense(
  input: OperatingExpenseUpsertInput
): Promise<OperatingExpense> {
  if (!HAS_SUPABASE || !supabase) {
    throw new Error("Supabase is not configured");
  }

  const existing = input.id ? await getOperatingExpense(input.id) : undefined;
  const now = new Date().toISOString();
  const base: OperatingExpense = existing ?? {
    id: input.id || `opex-${Date.now()}`,
    label: "",
    category: "andet",
    amountPerMonth: 0,
    enabled: true,
    notes: "",
    createdAt: now,
    updatedAt: now,
  };

  const merged: OperatingExpense = {
    ...base,
    ...input,
    id: base.id,
    label: input.label || base.label,
    createdAt: existing?.createdAt ?? base.createdAt,
    updatedAt: now,
  };

  const parsed = operatingExpenseSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((x) => x.message).join(", "));
  }

  const { data, error } = await supabase
    .from("operating_expenses")
    .upsert(expenseToRow(parsed.data), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Upsert returned no data");
  return rowToExpense(data);
}

export async function deleteOperatingExpense(id: string): Promise<boolean> {
  if (!HAS_SUPABASE || !supabase) return false;
  try {
    const { error } = await supabase.from("operating_expenses").delete().eq("id", id);
    if (error) throw error;
    return true;
  } catch (err) {
    logger.error(`[opex-store] delete error: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
