// ============================================================
// GET /api/cron/mail-sync – Sync mail thread→property from Supabase
// Call every 10–15 min from Vercel Cron or cron-job.org.
// Optional: set CRON_SECRET and send Authorization: Bearer <CRON_SECRET>
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { loadThreadPropertiesFromDb } from "@/lib/mail-threads";
import { verifyCronSecret } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const authErr = verifyCronSecret(request);
  if (authErr) return authErr;

  try {
    await loadThreadPropertiesFromDb();
    return NextResponse.json({ ok: true, message: "Mail thread→property sync loaded from Supabase" });
  } catch (error) {
    logger.error(`cron/mail-sync error: ${error instanceof Error ? error.message : error}`, { service: "cron-mail-sync" });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
