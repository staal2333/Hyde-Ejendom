import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { logger } from "@/lib/logger";
import type { Tilbud, TilbudListResult, TilbudStatus, TilbudUpsertInput } from "./types";
import { createDefaultTilbud, normalizeFixedCosts, tilbudSchema } from "./types";

const STORE_FILE = join(process.cwd(), ".tilbud-store.json");

interface TilbudStoreGlobal {
  __tilbud_store: Map<string, Tilbud>;
  __tilbud_loaded: boolean;
}

const g = globalThis as unknown as Partial<TilbudStoreGlobal>;
if (!g.__tilbud_store) g.__tilbud_store = new Map<string, Tilbud>();
const tilbudStore = g.__tilbud_store;

function loadFromDisk() {
  if (g.__tilbud_loaded) return;
  g.__tilbud_loaded = true;
  try {
    if (!existsSync(STORE_FILE)) return;
    const raw = readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Tilbud>;
    for (const [id, value] of Object.entries(parsed)) {
      const valid = tilbudSchema.safeParse(value);
      if (valid.success) {
        tilbudStore.set(id, {
          ...valid.data,
          fixedCosts: normalizeFixedCosts(valid.data.fixedCosts),
        });
      }
    }
  } catch (error) {
    logger.warn(`[tilbud-store] Kunne ikke læse fra disk: ${error instanceof Error ? error.message : error}`);
  }
}

function saveToDisk() {
  if (process.env.VERCEL) return;
  try {
    writeFileSync(
      STORE_FILE,
      JSON.stringify(Object.fromEntries(tilbudStore.entries()), null, 2),
      "utf8"
    );
  } catch (error) {
    logger.warn(`[tilbud-store] Kunne ikke skrive til disk: ${error instanceof Error ? error.message : error}`);
  }
}

function normalizeOfferNumber(input?: string): string {
  if (input && input.trim()) return input.trim();
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `T-${stamp}-${String(tilbudStore.size + 1).padStart(3, "0")}`;
}

export function listTilbud(opts?: {
  q?: string;
  status?: TilbudStatus;
  limit?: number;
  offset?: number;
}): TilbudListResult {
  loadFromDisk();
  let items = [...tilbudStore.values()]
    .map((item) => ({
      ...item,
      fixedCosts: normalizeFixedCosts(item.fixedCosts),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  if (opts?.status) {
    items = items.filter((x) => x.status === opts.status);
  }
  if (opts?.q) {
    const q = opts.q.toLowerCase();
    items = items.filter((x) =>
      x.clientName.toLowerCase().includes(q) ||
      x.offerNumber.toLowerCase().includes(q) ||
      x.campaignName.toLowerCase().includes(q)
    );
  }
  const total = items.length;
  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? 30;
  return { items: items.slice(offset, offset + limit), total };
}

export function getTilbud(id: string): Tilbud | undefined {
  loadFromDisk();
  const item = tilbudStore.get(id);
  return item
    ? { ...item, fixedCosts: normalizeFixedCosts(item.fixedCosts) }
    : undefined;
}

export function upsertTilbud(input: TilbudUpsertInput): Tilbud {
  loadFromDisk();
  const now = new Date().toISOString();
  const existing = input.id ? tilbudStore.get(input.id) : undefined;
  const base = existing ?? createDefaultTilbud(tilbudStore.size + 1);
  const merged: Tilbud = {
    ...base,
    ...input,
    id: input.id ?? base.id,
    offerNumber: normalizeOfferNumber(input.offerNumber ?? base.offerNumber),
    clientName: input.clientName ?? base.clientName,
    lines: input.lines ?? base.lines,
    fixedCosts: normalizeFixedCosts(input.fixedCosts ?? base.fixedCosts),
    status: input.status ?? base.status,
    createdAt: existing?.createdAt ?? base.createdAt ?? now,
    updatedAt: now,
  };

  const parsed = tilbudSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((x) => x.message).join(", "));
  }

  tilbudStore.set(parsed.data.id, parsed.data);
  saveToDisk();
  return parsed.data;
}

export function deleteTilbud(id: string): boolean {
  loadFromDisk();
  const deleted = tilbudStore.delete(id);
  if (deleted) saveToDisk();
  return deleted;
}
