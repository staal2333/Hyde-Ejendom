// ============================================================
// Mail thread → property mapping
// In-memory + optional Supabase persistence (table: mail_thread_property)
// ============================================================

import { supabase, HAS_SUPABASE } from "./supabase";

const threadToProperty = new Map<string, string>();

export function recordThreadProperty(threadId: string, propertyId: string): void {
  if (!threadId || !propertyId) return;
  threadToProperty.set(threadId, propertyId);
  if (HAS_SUPABASE && supabase) {
    supabase
      .from("mail_thread_property")
      .upsert(
        { thread_id: threadId, property_id: propertyId },
        { onConflict: "thread_id" }
      )
      .then(({ error }) => {
        if (error) console.warn("[mail-threads] Supabase upsert failed:", error);
      });
  }
}

export function getPropertyIdForThread(threadId: string): string | undefined {
  return threadToProperty.get(threadId);
}

/** Load mapping from Supabase into memory (call once at startup or when listing inbox). */
export async function loadThreadPropertiesFromDb(): Promise<void> {
  if (!HAS_SUPABASE || !supabase) return;
  const { data, error } = await supabase
    .from("mail_thread_property")
    .select("thread_id, property_id");
  if (error) {
    console.warn("[mail-threads] Supabase load failed:", error);
    return;
  }
  for (const row of data || []) {
    if (row.thread_id && row.property_id) {
      threadToProperty.set(row.thread_id, row.property_id);
    }
  }
}

export function getAllThreadProperties(): Array<{ threadId: string; propertyId: string }> {
  return Array.from(threadToProperty.entries()).map(([threadId, propertyId]) => ({
    threadId,
    propertyId,
  }));
}
