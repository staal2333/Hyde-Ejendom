import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import type {
  BankCategory,
  BankCategoryAgg,
  BankMonthAgg,
  BankSummary,
  BankTransaction,
} from "./types";

const MONTH_NAMES_DA = [
  "Jan", "Feb", "Mar", "Apr", "Maj", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function txToRow(t: BankTransaction): Record<string, unknown> {
  return {
    id: t.id,
    posted_date: t.postedDate,
    posted_time: t.postedTime || "",
    title: t.title || "",
    amount: t.amount,
    balance: t.balance,
    fx_amount: t.fxAmount ?? null,
    fx_currency: t.fxCurrency ?? null,
    category: t.category,
    account: t.account || "",
  };
}

function rowToTx(row: Record<string, unknown>): BankTransaction {
  return {
    id: String(row.id),
    postedDate: String(row.posted_date || "").slice(0, 10),
    postedTime: String(row.posted_time || ""),
    title: String(row.title || ""),
    amount: Number(row.amount || 0),
    balance: Number(row.balance || 0),
    fxAmount: row.fx_amount != null ? Number(row.fx_amount) : null,
    fxCurrency: row.fx_currency != null ? String(row.fx_currency) : null,
    category: (row.category as BankCategory) || "andet",
    account: String(row.account || ""),
  };
}

/** Bulk-upsert transactions (dedup on id). Returns number inserted/updated. */
export async function saveBankTransactions(txs: BankTransaction[]): Promise<number> {
  if (!HAS_SUPABASE || !supabase) throw new Error("Supabase is not configured");
  if (txs.length === 0) return 0;

  // Upsert i batches for at undgå for store payloads
  const BATCH = 200;
  let saved = 0;
  for (let i = 0; i < txs.length; i += BATCH) {
    const batch = txs.slice(i, i + BATCH).map(txToRow);
    const { error } = await supabase
      .from("bank_transactions")
      .upsert(batch, { onConflict: "id" });
    if (error) throw error;
    saved += batch.length;
  }
  return saved;
}

export async function listBankTransactions(limit = 1000): Promise<BankTransaction[]> {
  if (!HAS_SUPABASE || !supabase) return [];
  try {
    const { data, error } = await supabase
      .from("bank_transactions")
      .select("*")
      .order("posted_date", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data || []).map(rowToTx);
  } catch (err) {
    logger.error(`[bank-store] list error: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

export async function getBankSummary(): Promise<BankSummary> {
  const empty: BankSummary = {
    transactionCount: 0,
    closingBalance: 0,
    closingBalanceDate: "",
    firstDate: "",
    lastDate: "",
    totalIncome: 0,
    totalExpense: 0,
    byMonth: [],
    byCategory: [],
  };
  if (!HAS_SUPABASE || !supabase) return empty;

  try {
    const txs = await listBankTransactions(5000);
    if (txs.length === 0) return empty;

    // Sorteret nyeste→ældste fra query
    const newest = txs[0];
    const oldest = txs[txs.length - 1];

    let totalIncome = 0;
    let totalExpense = 0;
    const monthMap = new Map<string, BankMonthAgg>();
    const catMap = new Map<BankCategory, BankCategoryAgg>();

    for (const t of txs) {
      if (t.amount >= 0) totalIncome += t.amount;
      else totalExpense += -t.amount;

      const mk = t.postedDate.slice(0, 7); // YYYY-MM
      let m = monthMap.get(mk);
      if (!m) {
        const [y, mm] = mk.split("-");
        m = {
          month: mk,
          monthLabel: `${MONTH_NAMES_DA[Number(mm) - 1]} ${y}`,
          income: 0,
          expense: 0,
          net: 0,
        };
        monthMap.set(mk, m);
      }
      if (t.amount >= 0) m.income += t.amount;
      else m.expense += -t.amount;
      m.net += t.amount;

      let c = catMap.get(t.category);
      if (!c) {
        c = { category: t.category, income: 0, expense: 0, count: 0 };
        catMap.set(t.category, c);
      }
      if (t.amount >= 0) c.income += t.amount;
      else c.expense += -t.amount;
      c.count++;
    }

    const byMonth = [...monthMap.values()]
      .map((m) => ({
        ...m,
        income: round2(m.income),
        expense: round2(m.expense),
        net: round2(m.net),
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const byCategory = [...catMap.values()]
      .map((c) => ({ ...c, income: round2(c.income), expense: round2(c.expense) }))
      .sort((a, b) => b.expense - a.expense);

    return {
      transactionCount: txs.length,
      closingBalance: newest.balance,
      closingBalanceDate: newest.postedDate,
      firstDate: oldest.postedDate,
      lastDate: newest.postedDate,
      totalIncome: round2(totalIncome),
      totalExpense: round2(totalExpense),
      byMonth,
      byCategory,
    };
  } catch (err) {
    logger.error(`[bank-store] summary error: ${err instanceof Error ? err.message : err}`);
    return empty;
  }
}
