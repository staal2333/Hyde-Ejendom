// ============================================================
// GET /api/cron/mail-sync – Sync mail thread→property from Supabase
// Call every 10–15 min from Vercel Cron or cron-job.org.
// Optional: set CRON_SECRET and send Authorization: Bearer <CRON_SECRET>
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { loadThreadPropertiesFromDb } from "@/lib/mail-threads";
import { config } from "@/lib/config";

export async function GET(request: NextRequest) {
  const cronSecret = config.cronSecret();
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    await loadThreadPropertiesFromDb();
    return NextResponse.json({ ok: true, message: "Mail thread→property sync loaded from Supabase" });
  } catch (error) {
    console.error("[cron/mail-sync] Error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
