import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { logger } from "@/lib/logger";
import {
  operatingExpenseSchema,
  type OperatingExpense,
  type OperatingExpenseUpsertInput,
} from "./types";

const STORE_FILE = join(process.cwd(), ".operating-expenses.json");

interface OpExGlobal {
  __opex_store: Map<string, OperatingExpense>;
  __opex_loaded: boolean;
}

const g = globalThis as unknown as Partial<OpExGlobal>;
if (!g.__opex_store) g.__opex_store = new Map<string, OperatingExpense>();
const opexStore = g.__opex_store;

function loadFromDisk() {
  if (g.__opex_loaded) return;
  g.__opex_loaded = true;
  try {
    if (!existsSync(STORE_FILE)) return;
    const raw = readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, OperatingExpense>;
    for (const [id, value] of Object.entries(parsed)) {
      const valid = operatingExpenseSchema.safeParse(value);
      if (valid.success) opexStore.set(id, valid.data);
    }
  } catch (error) {
    logger.warn(`[opex-store] Kunne ikke læse fra disk: ${error instanceof Error ? error.message : error}`);
  }
}

function saveToDisk() {
  if (process.env.VERCEL) return;
  try {
    writeFileSync(
      STORE_FILE,
      JSON.stringify(Object.fromEntries(opexStore.entries()), null, 2),
      "utf8"
    );
  } catch (error) {
    logger.warn(`[opex-store] Kunne ikke skrive til disk: ${error instanceof Error ? error.message : error}`);
  }
}

export function listOperatingExpenses(): OperatingExpense[] {
  loadFromDisk();
  return [...opexStore.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function getOperatingExpense(id: string): OperatingExpense | undefined {
  loadFromDisk();
  return opexStore.get(id);
}

export function upsertOperatingExpense(input: OperatingExpenseUpsertInput): OperatingExpense {
  loadFromDisk();
  const now = new Date().toISOString();
  const existing = input.id ? opexStore.get(input.id) : undefined;
  const base: OperatingExpense = existing ?? {
    id: input.id || `opex-${Date.now()}-${opexStore.size + 1}`,
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
  opexStore.set(parsed.data.id, parsed.data);
  saveToDisk();
  return parsed.data;
}

export function deleteOperatingExpense(id: string): boolean {
  loadFromDisk();
  const deleted = opexStore.delete(id);
  if (deleted) saveToDisk();
  return deleted;
}
