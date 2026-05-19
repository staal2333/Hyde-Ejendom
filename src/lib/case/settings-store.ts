import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { logger } from "@/lib/logger";
import {
  costSettingsSchema,
  defaultCostSettings,
  type CostSettings,
} from "./types";

const STORE_FILE = join(process.cwd(), ".case-settings.json");

interface SettingsGlobal {
  __case_settings: CostSettings | null;
  __case_settings_loaded: boolean;
}

const g = globalThis as unknown as Partial<SettingsGlobal>;

function loadFromDisk(): CostSettings {
  if (g.__case_settings_loaded && g.__case_settings) return g.__case_settings;
  g.__case_settings_loaded = true;

  try {
    if (existsSync(STORE_FILE)) {
      const raw = readFileSync(STORE_FILE, "utf8");
      const parsed = costSettingsSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        g.__case_settings = parsed.data;
        return parsed.data;
      }
    }
  } catch (error) {
    logger.warn(`[case-settings] Kunne ikke læse fra disk: ${error instanceof Error ? error.message : error}`);
  }

  const fallback = defaultCostSettings();
  g.__case_settings = fallback;
  return fallback;
}

function saveToDisk(settings: CostSettings) {
  if (process.env.VERCEL) return;
  try {
    writeFileSync(STORE_FILE, JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    logger.warn(`[case-settings] Kunne ikke skrive til disk: ${error instanceof Error ? error.message : error}`);
  }
}

export function getCostSettings(): CostSettings {
  return loadFromDisk();
}

export function updateCostSettings(patch: Partial<CostSettings>): CostSettings {
  const current = loadFromDisk();
  const merged: CostSettings = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const parsed = costSettingsSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((x) => x.message).join(", "));
  }
  g.__case_settings = parsed.data;
  saveToDisk(parsed.data);
  return parsed.data;
}
