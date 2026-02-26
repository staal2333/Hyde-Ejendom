// ============================================================
// Auto-Research Cron Endpoint
// GET /api/auto-research?secret=...
//
// Called by cron job to automatically research eligible properties.
// Fetches HubSpot properties, filters by rules, then calls processProperty()
// directly so research actually runs — not just marks them as "ready".
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { fetchAllEjendomme } from "@/lib/hubspot";
import { DEFAULT_AUTO_RULES } from "@/lib/state-machine";
import { processProperty } from "@/lib/workflow/engine";
import { logger } from "@/lib/logger";
import type { Property } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max

const MAX_CONCURRENT = 3; // Run at most 3 properties in parallel per cron tick
const MAX_PER_RUN = 10;

export async function GET(req: NextRequest) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  const startTime = Date.now();

  try {
    // ── Fetch all properties ──
    const allProperties = await fetchAllEjendomme();

    // ── Apply rules ──
    const activeRules = DEFAULT_AUTO_RULES.filter((r) => r.active);
    if (activeRules.length === 0) {
      return NextResponse.json({
        message: "No active auto-research rules",
        propertiesChecked: allProperties.length,
        processed: 0,
      });
    }

    const toResearch: Property[] = [];

    for (const property of allProperties) {
      if (toResearch.length >= MAX_PER_RUN) break;

      for (const rule of activeRules) {
        if (!rule.fromStatuses.includes(property.outreachStatus)) continue;
        if (rule.minScore && (property.outdoorScore || 0) < rule.minScore) continue;
        if (rule.maxAgeHours && property.createdAt) {
          const ageHours = (Date.now() - new Date(property.createdAt).getTime()) / 3_600_000;
          if (ageHours > rule.maxAgeHours) continue;
        }
        toResearch.push(property);
        break;
      }
    }

    if (toResearch.length === 0) {
      return NextResponse.json({
        message: "No properties eligible for auto-research",
        propertiesChecked: allProperties.length,
        activeRules: activeRules.map((r) => r.label),
        processed: 0,
      });
    }

    logger.info(`Auto-research: processing ${toResearch.length} properties`, { service: "auto-research" });

    // ── Process in batches of MAX_CONCURRENT ──
    const results: { id: string; address: string; status: string; durationMs?: number }[] = [];

    for (let i = 0; i < toResearch.length; i += MAX_CONCURRENT) {
      const batch = toResearch.slice(i, i + MAX_CONCURRENT);

      const batchResults = await Promise.allSettled(
        batch.map(async (prop) => {
          const t0 = Date.now();
          try {
            const run = await processProperty(prop);
            return {
              id: prop.id,
              address: prop.address,
              status: run.status,
              durationMs: Date.now() - t0,
            };
          } catch (err) {
            return {
              id: prop.id,
              address: prop.address,
              status: `error: ${err instanceof Error ? err.message : "unknown"}`,
              durationMs: Date.now() - t0,
            };
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            id: "unknown",
            address: "unknown",
            status: `rejected: ${result.reason}`,
          });
        }
      }

      // Small pause between batches to avoid rate limiting
      if (i + MAX_CONCURRENT < toResearch.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    const succeeded = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status.startsWith("error") || r.status.startsWith("rejected")).length;

    logger.info(`Auto-research done: ${succeeded} succeeded, ${failed} failed`, { service: "auto-research" });

    return NextResponse.json({
      message: `Auto-research complete`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      propertiesChecked: allProperties.length,
      activeRules: activeRules.map((r) => r.label),
      processed: results.length,
      succeeded,
      failed,
      results,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
