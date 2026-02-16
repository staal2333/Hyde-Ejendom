// ============================================================
// System Status & Health Check Endpoint
// GET /api/status
// Pings all key integrations, reports metrics and cache stats
// ============================================================

import { NextResponse } from "next/server";
import {
  getAllServiceHealth,
  getAllMetrics,
  getCacheStats,
  pingService,
} from "@/lib/api-client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const startTime = Date.now();

  // ── Ping key services (parallel) ──
  const [dawa, ois, cvr, wfsKbh, hubspot] = await Promise.all([
    pingService("dawa", "https://dawa.aws.dk/kommuner?q=K%C3%B8benhavn&per_side=1"),
    pingService("ois", "https://ois.dk"),
    pingService("cvr", "https://cvrapi.dk/api?search=test&country=dk"),
    pingService(
      "wfs",
      "https://wfs-kbhkort.kk.dk/k101/ows?service=WFS&version=1.0.0&request=GetCapabilities"
    ),
    pingService(
      "hubspot",
      "https://api.hubapi.com/crm/v3/schemas",
      5_000
    ).then((r) => ({
      // HubSpot will return 401 without token, but that still means it's reachable
      ok: true,
      latencyMs: r.latencyMs,
      error: r.error,
    })),
  ]);

  const pings = {
    dawa: { ...dawa, service: "DAWA (Adresser)" },
    ois: { ...ois, service: "OIS.dk (Ejerskab)" },
    cvr: { ...cvr, service: "CVR API (Virksomheder)" },
    wfs_kbh: { ...wfsKbh, service: "KBH WFS (Stilladser)" },
    hubspot: { ...hubspot, service: "HubSpot CRM" },
  };

  // ── Collect internal metrics ──
  const serviceHealth = getAllServiceHealth();
  const metrics = getAllMetrics();
  const cache = getCacheStats();

  // ── Environment check ──
  const env = {
    hubspot_token: !!process.env.HUBSPOT_ACCESS_TOKEN,
    openai_key: !!process.env.OPENAI_API_KEY,
    cron_secret: !!process.env.CRON_SECRET,
    node_env: process.env.NODE_ENV || "development",
  };

  // ── Overall status ──
  const allPingsOk = Object.values(pings).every((p) => p.ok);
  const anyDown = serviceHealth.some((s) => s.status === "down");
  const overallStatus = anyDown
    ? "degraded"
    : allPingsOk
      ? "healthy"
      : "degraded";

  return NextResponse.json({
    status: overallStatus,
    version: "2.0.0",
    timestamp: new Date().toISOString(),
    checkDurationMs: Date.now() - startTime,
    environment: env,
    pings,
    serviceHealth,
    metrics,
    cache,
  });
}
