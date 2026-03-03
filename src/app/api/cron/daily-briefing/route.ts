import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { runDailyBriefing } from "@/lib/agents/briefing-agent";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = verifyCronSecret(req);
  if (denied) return denied;

  try {
    logger.info("[cron/daily-briefing] Starting daily briefing...");
    const briefing = await runDailyBriefing();
    logger.info(`[cron/daily-briefing] Briefing generated for ${briefing.date}`);
    return NextResponse.json({ success: true, briefing });
  } catch (e) {
    logger.error(`[cron/daily-briefing] Failed: ${e instanceof Error ? e.message : String(e)}`);
    return NextResponse.json({ error: "Briefing failed" }, { status: 500 });
  }
}
