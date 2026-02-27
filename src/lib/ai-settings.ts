// ============================================================
// AI Settings – load/save tone of voice & example emails
// Stored in Supabase ai_settings table (single "default" row)
// Falls back to config defaults if Supabase is unavailable
// ============================================================

import { supabase } from "./supabase";
import { config } from "./config";

export interface AISettings {
  toneOfVoice: string;
  exampleEmails: string;
  senderName: string;
}

const DEFAULT_SETTINGS: AISettings = {
  toneOfVoice: config.toneOfVoice,
  exampleEmails: config.exampleEmails,
  senderName: "Mads",
};

// 1-minute in-memory cache to avoid DB hit on every email generation
let _cache: AISettings | null = null;
let _cacheTs = 0;
const CACHE_TTL_MS = 60_000;

export function invalidateAISettingsCache() {
  _cache = null;
  _cacheTs = 0;
}

export async function getAISettings(): Promise<AISettings> {
  if (_cache && Date.now() - _cacheTs < CACHE_TTL_MS) return _cache;

  if (!supabase) return DEFAULT_SETTINGS;

  try {
    const { data, error } = await supabase
      .from("ai_settings")
      .select("tone_of_voice, example_emails, sender_name")
      .eq("id", "default")
      .single();

    if (error || !data) return DEFAULT_SETTINGS;

    _cache = {
      toneOfVoice: (data.tone_of_voice as string) || DEFAULT_SETTINGS.toneOfVoice,
      exampleEmails: (data.example_emails as string) || DEFAULT_SETTINGS.exampleEmails,
      senderName: (data.sender_name as string) || DEFAULT_SETTINGS.senderName,
    };
    _cacheTs = Date.now();
    return _cache;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveAISettings(settings: Partial<AISettings>): Promise<AISettings> {
  if (!supabase) return DEFAULT_SETTINGS;

  const patch: Record<string, string> = {
    id: "default",
    updated_at: new Date().toISOString(),
  };
  if (settings.toneOfVoice !== undefined) patch.tone_of_voice = settings.toneOfVoice;
  if (settings.exampleEmails !== undefined) patch.example_emails = settings.exampleEmails;
  if (settings.senderName !== undefined) patch.sender_name = settings.senderName;

  await supabase.from("ai_settings").upsert(patch);

  // Bust cache so next call loads fresh data
  invalidateAISettingsCache();
  return getAISettings();
}
