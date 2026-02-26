// GET /api/research-logs?property_id=...&limit=20
// Returns persisted research workflow logs from Supabase.

import { NextRequest, NextResponse } from "next/server";
import { getResearchLogs, getRecentResearchLogs } from "@/lib/research-log-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const propertyId = searchParams.get("property_id");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

  try {
    const logs = propertyId
      ? await getResearchLogs(propertyId, limit)
      : await getRecentResearchLogs(limit);

    return NextResponse.json({ logs, count: logs.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
