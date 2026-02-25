// POST /api/lead-sourcing/monitor-customers – scan HubSpot companies' ad activity

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    logger.info("[monitor-customers] Starting scan…", { service: "lead-sourcing" });
    const { monitorCustomers } = await import("@/lib/lead-sourcing/customer-monitor");
    const results = await monitorCustomers();

    return NextResponse.json({
      customers: results,
      total: results.length,
      advertising: results.filter(r => r.advertising).length,
      notAdvertising: results.filter(r => !r.advertising).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error(`[monitor-customers] Failed: ${msg}`, { service: "lead-sourcing" });
    return apiError(500, msg);
  }
}
