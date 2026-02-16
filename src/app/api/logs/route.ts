// ============================================================
// Log Viewer Endpoint
// GET /api/logs?level=error&service=research&limit=50
// Returns recent structured logs from the in-memory store
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getRecentLogs, getLogStats } from "@/lib/logger";
import type { LogLevel } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const level = req.nextUrl.searchParams.get("level") as LogLevel | null;
  const service = req.nextUrl.searchParams.get("service") || undefined;
  const jobId = req.nextUrl.searchParams.get("jobId") || undefined;
  const propertyId = req.nextUrl.searchParams.get("propertyId") || undefined;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");

  const logs = getRecentLogs({
    level: level || undefined,
    service,
    jobId,
    propertyId,
    limit,
  });

  const stats = getLogStats();

  return NextResponse.json({
    stats,
    logs,
  });
}
