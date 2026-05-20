import { z } from "zod";

export const BANK_CATEGORIES = [
  "indtaegt",      // fakturaindbetalinger, kunde-betalinger
  "leverandoer",   // stillads/print-leverandører (Monsterprint, Liftservice, etc.)
  "software",      // SaaS-abonnementer
  "loen",          // løn
  "skat_moms",     // SKAT, moms, kommunale gebyrer
  "overfoersel",   // interne overførsler / neutralt
  "andet",         // alt andet
] as const;

export const bankCategorySchema = z.enum(BANK_CATEGORIES);
export type BankCategory = z.infer<typeof bankCategorySchema>;

export const BANK_CATEGORY_LABEL: Record<BankCategory, string> = {
  indtaegt: "Indtægt",
  leverandoer: "Leverandører",
  software: "Software/abonnement",
  loen: "Løn",
  skat_moms: "Skat & moms",
  overfoersel: "Overførsler",
  andet: "Andet",
};

export const BANK_CATEGORY_COLOR: Record<BankCategory, string> = {
  indtaegt: "text-emerald-700 bg-emerald-50 border-emerald-200",
  leverandoer: "text-amber-700 bg-amber-50 border-amber-200",
  software: "text-blue-700 bg-blue-50 border-blue-200",
  loen: "text-violet-700 bg-violet-50 border-violet-200",
  skat_moms: "text-rose-700 bg-rose-50 border-rose-200",
  overfoersel: "text-slate-600 bg-slate-50 border-slate-200",
  andet: "text-slate-600 bg-slate-50 border-slate-200",
};

export const bankTransactionSchema = z.object({
  id: z.string().min(1),
  postedDate: z.string().min(1),     // YYYY-MM-DD
  postedTime: z.string().optional().default(""),
  title: z.string().default(""),
  amount: z.number(),
  balance: z.number(),
  fxAmount: z.number().nullable().optional(),
  fxCurrency: z.string().nullable().optional(),
  category: bankCategorySchema.default("andet"),
  account: z.string().optional().default(""),
});

export type BankTransaction = z.infer<typeof bankTransactionSchema>;

export interface BankMonthAgg {
  month: string;        // YYYY-MM
  monthLabel: string;
  income: number;       // sum positive
  expense: number;      // sum negative (positivt tal)
  net: number;
}

export interface BankCategoryAgg {
  category: BankCategory;
  income: number;
  expense: number;
  count: number;
}

export interface BankSummary {
  transactionCount: number;
  closingBalance: number;
  closingBalanceDate: string;
  firstDate: string;
  lastDate: string;
  totalIncome: number;
  totalExpense: number;
  byMonth: BankMonthAgg[];
  byCategory: BankCategoryAgg[];
  /** Gns. månedligt fast burn (software + løn + andet) — baseline til cash-prognose */
  monthlyBurnBaseline: number;
}
