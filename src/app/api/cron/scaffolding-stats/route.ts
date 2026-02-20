// ============================================================
// GET /api/cron/scaffolding-stats – Opdater stillads-statistik hvert 10. min
// Kører kun discovery (ingen HubSpot/research). Beskytteres af CRON_SECRET.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { discoverScaffolding } from "@/lib/discovery/scaffolding";
import { computeScaffoldStatsFromPermits, setScaffoldStats } from "@/lib/scaffold-stats";
import { logger } from "@/lib/logger";
import type { ScoredScaffolding } from "@/types";

export async function GET(req: NextRequest) {
  const cronSecret = config.cronSecret();
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") || req.nextUrl.searchParams.get("secret");
    if (authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const cities = config.scaffoldCron.cities;
  const minScore = config.scaffoldCron.minScore;
  const allPermits: ScoredScaffolding[] = [];

  for (const city of cities) {
    try {
      const result = await discoverScaffolding(city, 0, minScore, () => {});
      allPermits.push(...result.permits);
    } catch (e) {
      logger.error(`[cron/scaffolding-stats] Scan failed for ${city}: ${e instanceof Error ? e.message : e}`, {
        service: "cron-scaffold-stats",
      });
    }
  }

  const stats = computeScaffoldStatsFromPermits(allPermits);
  setScaffoldStats(stats);

  return NextResponse.json({
    ok: true,
    previousDay: stats.previousDay,
    daily: stats.daily,
    weekly: stats.weekly,
    monthly: stats.monthly,
    at: stats.at,
  });
}
