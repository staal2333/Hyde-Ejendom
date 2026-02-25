import { supabase, HAS_SUPABASE } from "./supabase";
import { logger } from "./logger";

export interface AnalyticsSnapshot {
  snapshotDate: string;
  discovered: number;
  staged: number;
  inHubspot: number;
  ready: number;
  sent: number;
  replied: number;
  meetings: number;
}

export async function saveAnalyticsSnapshot(data: Omit<AnalyticsSnapshot, "snapshotDate">): Promise<void> {
  if (!HAS_SUPABASE || !supabase) return;

  const today = new Date().toISOString().split("T")[0];
  const { error } = await supabase.from("analytics_daily").upsert(
    {
      snapshot_date: today,
      discovered: data.discovered,
      staged: data.staged,
      in_hubspot: data.inHubspot,
      ready: data.ready,
      sent: data.sent,
      replied: data.replied,
      meetings: data.meetings,
    },
    { onConflict: "snapshot_date" }
  );

  if (error) {
    logger.warn(`analytics_daily upsert failed: ${error.message}`, { service: "analytics" });
  }
}

export async function getAnalyticsTrend(days = 14): Promise<AnalyticsSnapshot[]> {
  if (!HAS_SUPABASE || !supabase) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from("analytics_daily")
    .select("*")
    .gte("snapshot_date", since.toISOString().split("T")[0])
    .order("snapshot_date", { ascending: true });

  if (error) {
    logger.warn(`analytics_daily fetch failed: ${error.message}`, { service: "analytics" });
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    snapshotDate: String(row.snapshot_date),
    discovered: Number(row.discovered) || 0,
    staged: Number(row.staged) || 0,
    inHubspot: Number(row.in_hubspot) || 0,
    ready: Number(row.ready) || 0,
    sent: Number(row.sent) || 0,
    replied: Number(row.replied) || 0,
    meetings: Number(row.meetings) || 0,
  }));
}
