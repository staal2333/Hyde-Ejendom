// ============================================================
// GET /api/cron/process-email-queue – Process queued emails
// Runs every 5 minutes via Vercel Cron.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { processQueueBatch, getQueueStats } from "@/lib/email-queue";
import { verifyCronSecret } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authErr = verifyCronSecret(request);
  if (authErr) return authErr;

  try {
    const statsBefore = await getQueueStats();
    if (statsBefore.queued === 0) {
      return NextResponse.json({ ok: true, message: "No queued emails", ...statsBefore });
    }

    logger.info(`Processing email queue: ${statsBefore.queued} queued, ${statsBefore.sentThisHour}/${statsBefore.rateLimitPerHour} sent this hour`, {
      service: "cron",
    });

    const result = await processQueueBatch(20);

    const statsAfter = await getQueueStats();

    logger.info(`Email queue processed: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`, {
      service: "cron",
    });

    return NextResponse.json({
      ok: true,
      processed: result,
      remaining: statsAfter.queued,
      sentThisHour: statsAfter.sentThisHour,
    });
  } catch (error) {
    logger.error(`Email queue cron failed: ${error instanceof Error ? error.message : error}`, { service: "cron" });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
