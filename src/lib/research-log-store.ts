// ============================================================
// Research Log Store – persist workflow logs to Supabase
//
// Saves the result of every research run so logs survive
// Vercel cold starts and can be inspected for debugging.
// Gracefully no-ops if Supabase is not configured.
// ============================================================

import { supabase } from "./supabase";
import { logger } from "./logger";
import type { WorkflowRunLog, Contact } from "@/types";

export interface ResearchLogRecord {
  id: string;
  property_id: string;
  property_name: string | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  steps: WorkflowRunLog["steps"];
  cvr_found: string | null;
  emails_found: string[];
  contacts_found: Contact[] | null;
  error_message: string | null;
  created_at: string;
}

/**
 * Save a completed workflow run log to Supabase.
 * Silently no-ops if Supabase is not available.
 */
export async function saveResearchLog(
  run: WorkflowRunLog,
  extras?: {
    cvrFound?: string | null;
    emailsFound?: string[];
    contactsFound?: Contact[];
  }
): Promise<void> {
  if (!supabase) return;

  try {
    const { error } = await supabase.from("research_logs").insert({
      property_id: run.propertyId,
      property_name: run.propertyName || null,
      started_at: run.startedAt,
      finished_at: run.completedAt || new Date().toISOString(),
      status: run.status,
      steps: run.steps,
      cvr_found: extras?.cvrFound ?? null,
      emails_found: extras?.emailsFound ?? [],
      contacts_found: extras?.contactsFound ?? null,
      error_message: run.error || null,
    });

    if (error) {
      logger.warn(`[research-log-store] Failed to save log for ${run.propertyId}: ${error.message}`, {
        service: "research-log-store",
      });
    } else {
      logger.info(`[research-log-store] Saved research log for ${run.propertyId} (${run.status})`, {
        service: "research-log-store",
      });
    }
  } catch (err) {
    // Non-critical — never crash the pipeline due to logging failure
    logger.warn(`[research-log-store] Exception saving log: ${err instanceof Error ? err.message : String(err)}`, {
      service: "research-log-store",
    });
  }
}

/**
 * Fetch recent research logs for a property.
 */
export async function getResearchLogs(
  propertyId: string,
  limit = 10
): Promise<ResearchLogRecord[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("research_logs")
      .select("*")
      .eq("property_id", propertyId)
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn(`[research-log-store] Failed to fetch logs: ${error.message}`);
      return [];
    }

    return (data as ResearchLogRecord[]) || [];
  } catch {
    return [];
  }
}

/**
 * Fetch the N most recent research logs across all properties.
 */
export async function getRecentResearchLogs(limit = 20): Promise<ResearchLogRecord[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("research_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn(`[research-log-store] Failed to fetch recent logs: ${error.message}`);
      return [];
    }

    return (data as ResearchLogRecord[]) || [];
  } catch {
    return [];
  }
}
