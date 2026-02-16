// ============================================================
// GET /api/cron/scaffolding – Daily scaffolding auto-scanner
// Full auto: scan cities → create properties → research → email drafts
// Protected by CRON_SECRET header for automated scheduled calls
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { discoverScaffolding } from "@/lib/discovery/scaffolding";
import { createEjendom, ejendomExistsByAddress, fetchEjendommeByStatus } from "@/lib/hubspot";
import { processProperty } from "@/lib/workflow/engine";
import { logger } from "@/lib/logger";
import type { ScoredScaffolding } from "@/types";

// In-memory store for the latest cron run results
interface CronRunResult {
  runAt: string;
  city: string;
  totalPermits: number;
  qualifiedPermits: number;
  propertiesCreated: number;
  propertiesSkipped: number;
  alreadyExisted: number;
  researchCompleted: number;
  researchFailed: number;
  emailDraftsGenerated: number;
  topPermits: Array<{
    address: string;
    score: number;
    traffic: number;
    type: string;
  }>;
  errors: string[];
}

const recentCronRuns: CronRunResult[] = [];
const MAX_CRON_HISTORY = 30;

/**
 * GET /api/cron/scaffolding – Run the daily scaffolding scan
 * Add ?city=København to scan a specific city
 * Add ?dryRun=true to scan without creating properties
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (if configured)
  const cronSecret = config.cronSecret();
  if (cronSecret) {
    const authHeader = req.headers.get("authorization") || req.nextUrl.searchParams.get("secret");
    if (authHeader !== `Bearer ${cronSecret}` && authHeader !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const specificCity = req.nextUrl.searchParams.get("city");
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
  const autoResearch = config.scaffoldCron.autoResearch && !dryRun;
  const cities = specificCity ? [specificCity] : config.scaffoldCron.cities;
  const minScore = config.scaffoldCron.minScore;

  logger.info(`Cron scaffolding scan starting for: ${cities.join(", ")}`, {
    service: "cron-scaffold",
  });

  const results: CronRunResult[] = [];

  for (const city of cities) {
    const runResult: CronRunResult = {
      runAt: new Date().toISOString(),
      city,
      totalPermits: 0,
      qualifiedPermits: 0,
      propertiesCreated: 0,
      propertiesSkipped: 0,
      alreadyExisted: 0,
      researchCompleted: 0,
      researchFailed: 0,
      emailDraftsGenerated: 0,
      topPermits: [],
      errors: [],
    };

    try {
      // Phase 1: Discover scaffolding permits
      const scaffoldResult = await discoverScaffolding(city, 0, minScore, (event) => {
        logger.info(`[cron-scaffold] ${city}: ${event.message}`, {
          service: "cron-scaffold",
        });
      });

      runResult.totalPermits = scaffoldResult.totalPermits;

      // Filter to qualified permits
      const qualified = scaffoldResult.permits.filter(
        (p) => p.outdoorScore >= minScore
      );
      runResult.qualifiedPermits = qualified.length;

      // Top permits for the report
      runResult.topPermits = qualified.slice(0, 10).map((p) => ({
        address: p.address,
        score: p.outdoorScore,
        traffic: p.estimatedDailyTraffic || 0,
        type: `${p.sagstype} / ${p.category}`,
      }));

      if (dryRun) {
        logger.info(
          `[cron-scaffold] DRY RUN: Would create ${qualified.length} properties in ${city}`,
          { service: "cron-scaffold" }
        );
        runResult.propertiesSkipped = qualified.length;
      } else {
        // Phase 2: Create properties in HubSpot
        for (const permit of qualified) {
          try {
            const exists = await ejendomExistsByAddress(permit.address);
            if (exists) {
              runResult.alreadyExisted++;
              continue;
            }

            await createEjendom({
              name: permit.address,
              address: permit.address,
              postalCode: permit.postalCode || "",
              city: permit.city || city,
              outdoorScore: permit.outdoorScore,
              outdoorPotentialNotes: buildPermitNotes(permit),
              outreachStatus: autoResearch ? "NY_KRAEVER_RESEARCH" : "NY_KRAEVER_RESEARCH",
            });

            runResult.propertiesCreated++;
          } catch (e) {
            const msg = `Create failed for ${permit.address}: ${e instanceof Error ? e.message : e}`;
            runResult.errors.push(msg);
            runResult.propertiesSkipped++;
            logger.error(msg, { service: "cron-scaffold" });
          }
        }

        // Phase 3: Auto-research the newly created properties
        if (autoResearch && runResult.propertiesCreated > 0) {
          logger.info(
            `[cron-scaffold] Auto-researching ${runResult.propertiesCreated} new properties in ${city}`,
            { service: "cron-scaffold" }
          );

          const newProps = await fetchEjendommeByStatus("NY_KRAEVER_RESEARCH", 50);

          // Filter to properties matching the scaffolding addresses we just created
          const createdAddresses = qualified
            .map((p) => p.address.toLowerCase().trim())
            .filter(Boolean);

          const toResearch = newProps.filter((p) =>
            createdAddresses.some(
              (addr) =>
                p.address?.toLowerCase().includes(addr) ||
                addr.includes(p.address?.toLowerCase() || "")
            )
          );

          for (const property of toResearch) {
            try {
              const run = await processProperty(property);
              if (run.status === "completed") {
                runResult.researchCompleted++;
                const hasDraft = run.steps.some(
                  (s) => s.stepId === "generate_email_draft" && s.status === "completed"
                );
                if (hasDraft) runResult.emailDraftsGenerated++;
              } else {
                runResult.researchFailed++;
              }
            } catch (e) {
              runResult.researchFailed++;
              runResult.errors.push(
                `Research failed for ${property.address}: ${e instanceof Error ? e.message : e}`
              );
            }
          }
        }
      }

      logger.info(
        `[cron-scaffold] ${city} done: ${runResult.propertiesCreated} created, ` +
        `${runResult.researchCompleted} researched, ${runResult.emailDraftsGenerated} email drafts`,
        { service: "cron-scaffold" }
      );
    } catch (error) {
      const msg = `Scaffold scan failed for ${city}: ${error instanceof Error ? error.message : error}`;
      runResult.errors.push(msg);
      logger.error(msg, { service: "cron-scaffold" });
    }

    results.push(runResult);
    recentCronRuns.push(runResult);
  }

  // Trim history
  while (recentCronRuns.length > MAX_CRON_HISTORY) {
    recentCronRuns.shift();
  }

  return NextResponse.json({
    success: true,
    dryRun,
    autoResearch,
    cities,
    results,
    summary: {
      totalPermits: results.reduce((s, r) => s + r.totalPermits, 0),
      propertiesCreated: results.reduce((s, r) => s + r.propertiesCreated, 0),
      researchCompleted: results.reduce((s, r) => s + r.researchCompleted, 0),
      emailDraftsGenerated: results.reduce((s, r) => s + r.emailDraftsGenerated, 0),
    },
  });
}

// ── Helper ────────────────────────────────────────────────────

function buildPermitNotes(p: ScoredScaffolding): string {
  const lines = [
    `Scaffold Permit Discovery`,
    `Type: ${p.sagstype} / ${p.category}`,
    `Score: ${p.outdoorScore}/10`,
    `Trafik: ~${(p.estimatedDailyTraffic || 0).toLocaleString("da-DK")}/dag`,
    ``,
    `Sagsnr: ${p.sagsnr || "N/A"}`,
    `Ansøger: ${p.applicant || "N/A"}`,
    `Dato: ${p.startDate || "?"} → ${p.endDate || "?"}`,
    p.description ? `Beskrivelse: ${p.description}` : "",
    `Kilde: ${p.sourceLayer || p.sourceUrl || "WFS"}`,
  ];
  return lines.filter(Boolean).join("\n");
}
