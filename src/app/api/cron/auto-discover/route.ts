// ============================================================
// GET /api/cron/auto-discover – Auto-discovery pipeline
// Runs scaffolding + street scanning from discovery_config,
// then auto-researches + generates email drafts for new properties.
// Protected by CRON_SECRET. Intended to run daily at 06:00.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { listDiscoveryConfigs, markConfigRun } from "@/lib/discovery/config-store";
import { discoverScaffolding } from "@/lib/discovery/scaffolding";
import { discoverStreet } from "@/lib/discovery";
import { listStagedProperties } from "@/lib/staging/store";
import { processStagedProperty } from "@/lib/workflow/engine";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authErr = verifyCronSecret(req);
  if (authErr) return authErr;

  const startTime = Date.now();
  const log: string[] = [];
  const push = (msg: string) => {
    log.push(msg);
    logger.info(`[auto-discover] ${msg}`, { service: "auto-discover" });
  };

  push("Auto-discovery pipeline started");

  // 1. Load active configs
  const configs = await listDiscoveryConfigs({ activeOnly: true });
  push(`Loaded ${configs.length} active discovery configs`);

  if (configs.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "No active discovery configs found",
      log,
      duration: Date.now() - startTime,
    });
  }

  let totalCreated = 0;
  let totalAlreadyExists = 0;
  let totalResearched = 0;
  let totalEmailDrafts = 0;
  let totalErrors = 0;

  // 2. Run discovery for each config
  for (const cfg of configs) {
    try {
      if (cfg.type === "scaffolding") {
        push(`Scaffolding scan: ${cfg.city} (min_score=${cfg.minScore})`);
        const result = await discoverScaffolding(cfg.city, 0, cfg.minScore, () => {});
        push(`  → ${result.permits.length} permits found, ${result.created} newly staged`);
        totalCreated += result.created;
      } else if (cfg.type === "street" && cfg.street) {
        push(`Street scan: ${cfg.street}, ${cfg.city} (min_score=${cfg.minScore}, min_traffic=${cfg.minTraffic})`);
        const result = await discoverStreet(
          cfg.street,
          cfg.city,
          cfg.minScore,
          cfg.minTraffic,
          () => {},
        );
        push(`  → ${result.created} created, ${result.alreadyExists} already existed, ${result.skipped} skipped`);
        totalCreated += result.created;
        totalAlreadyExists += result.alreadyExists;
      }

      await markConfigRun(cfg.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      push(`  ERROR for config ${cfg.id} (${cfg.type}/${cfg.city}): ${msg}`);
      totalErrors++;
      logger.error(`[auto-discover] Config ${cfg.id} failed: ${msg}`, { service: "auto-discover" });
    }
  }

  push(`Discovery phase complete: ${totalCreated} new properties staged`);

  // 3. Auto-research + email draft for all newly staged properties
  if (totalCreated > 0) {
    push("Starting auto-research on newly staged properties...");

    const newProperties = await listStagedProperties({ stage: "new" });
    push(`Found ${newProperties.length} properties with stage=new`);

    for (const prop of newProperties) {
      try {
        push(`Researching: ${prop.address}`);
        const run = await processStagedProperty(
          prop,
          () => {},
          () => false,
          { skipEmailDraft: false },
        );

        if (run.status === "completed") {
          totalResearched++;
          const hasDraft = run.steps.some(
            s => s.stepId === "generate_email_draft" && s.status === "completed",
          );
          if (hasDraft) totalEmailDrafts++;
          push(`  → Research complete: ${prop.address}${hasDraft ? " + email draft" : ""}`);
        } else {
          push(`  → Research failed: ${prop.address} – ${run.error || "unknown"}`);
          totalErrors++;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        push(`  → Research error: ${prop.address} – ${msg}`);
        totalErrors++;
      }
    }
  }

  const duration = Date.now() - startTime;
  push(`Pipeline complete in ${Math.round(duration / 1000)}s`);

  return NextResponse.json({
    ok: true,
    summary: {
      configsProcessed: configs.length,
      newPropertiesStaged: totalCreated,
      alreadyExisted: totalAlreadyExists,
      researched: totalResearched,
      emailDraftsGenerated: totalEmailDrafts,
      errors: totalErrors,
    },
    log,
    duration,
  });
}
