import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { logger } from "@/lib/logger";
import {
  caseSchema,
  createDefaultCase,
  type Case,
  type CaseListResult,
  type CaseStatus,
  type CaseUpsertInput,
} from "./types";

/**
 * Migrate legacy cases (created before sales[] existed) by converting
 * any non-zero costs.medieSalg into a single placeholder sale entry.
 */
function normalizeCase(c: Case): Case {
  if (c.sales && c.sales.length > 0) return c;
  const legacy = c.costs?.medieSalg || 0;
  if (legacy <= 0) return c;
  return {
    ...c,
    sales: [
      {
        id: `sale-legacy-${c.id}`,
        annoncør: c.bygherreNavn || "Ukendt annoncør",
        fromDate: c.startDate || "",
        toDate: c.endDate || "",
        salgspris: legacy,
        notes: "Migreret fra legacy medieSalg",
      },
    ],
    costs: { ...c.costs, medieSalg: 0 },
  };
}

const STORE_FILE = join(process.cwd(), ".case-store.json");

interface CaseStoreGlobal {
  __case_store: Map<string, Case>;
  __case_loaded: boolean;
}

const g = globalThis as unknown as Partial<CaseStoreGlobal>;
if (!g.__case_store) g.__case_store = new Map<string, Case>();
const caseStore = g.__case_store;

function loadFromDisk() {
  if (g.__case_loaded) return;
  g.__case_loaded = true;
  try {
    if (!existsSync(STORE_FILE)) return;
    const raw = readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Case>;
    for (const [id, value] of Object.entries(parsed)) {
      const valid = caseSchema.safeParse(value);
      if (valid.success) {
        caseStore.set(id, normalizeCase(valid.data));
      }
    }
  } catch (error) {
    logger.warn(`[case-store] Kunne ikke læse fra disk: ${error instanceof Error ? error.message : error}`);
  }
}

function saveToDisk() {
  if (process.env.VERCEL) return;
  try {
    writeFileSync(
      STORE_FILE,
      JSON.stringify(Object.fromEntries(caseStore.entries()), null, 2),
      "utf8"
    );
  } catch (error) {
    logger.warn(`[case-store] Kunne ikke skrive til disk: ${error instanceof Error ? error.message : error}`);
  }
}

function normalizeCaseNumber(input?: string): string {
  if (input && input.trim()) return input.trim();
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `C-${stamp}-${String(caseStore.size + 1).padStart(3, "0")}`;
}

export function listCases(opts?: {
  q?: string;
  status?: CaseStatus;
  limit?: number;
  offset?: number;
}): CaseListResult {
  loadFromDisk();
  let items = [...caseStore.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (opts?.status) {
    items = items.filter((x) => x.status === opts.status);
  }
  if (opts?.q) {
    const q = opts.q.toLowerCase();
    items = items.filter(
      (x) =>
        x.title.toLowerCase().includes(q) ||
        x.caseNumber.toLowerCase().includes(q) ||
        x.address.toLowerCase().includes(q) ||
        x.bygherreNavn.toLowerCase().includes(q)
    );
  }
  const total = items.length;
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 100;
  return { items: items.slice(offset, offset + limit), total };
}

export function getCase(id: string): Case | undefined {
  loadFromDisk();
  return caseStore.get(id);
}

export function upsertCase(input: CaseUpsertInput): Case {
  loadFromDisk();
  const now = new Date().toISOString();
  const existing = input.id ? caseStore.get(input.id) : undefined;
  const base = existing ?? createDefaultCase(caseStore.size + 1);
  const merged: Case = {
    ...base,
    ...input,
    id: input.id ?? base.id,
    caseNumber: normalizeCaseNumber(input.caseNumber ?? base.caseNumber),
    sales: input.sales ?? base.sales ?? [],
    costs: { ...base.costs, ...(input.costs || {}) },
    createdAt: existing?.createdAt ?? base.createdAt ?? now,
    updatedAt: now,
  };

  const parsed = caseSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((x) => x.message).join(", "));
  }

  caseStore.set(parsed.data.id, parsed.data);
  saveToDisk();
  return parsed.data;
}

export function deleteCase(id: string): boolean {
  loadFromDisk();
  const deleted = caseStore.delete(id);
  if (deleted) saveToDisk();
  return deleted;
}

export function listAllCases(): Case[] {
  loadFromDisk();
  return [...caseStore.values()];
}
