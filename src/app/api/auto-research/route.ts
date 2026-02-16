// ============================================================
// Auto-Research Cron Endpoint
// GET /api/auto-research?secret=...
//
// Called by cron job to automatically research eligible properties.
// Respects auto-research rules and autonomy levels.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { fetchAllEjendomme, updateEjendom } from "@/lib/hubspot";
import { DEFAULT_AUTO_RULES } from "@/lib/state-machine";
import type { Property } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max

export async function GET(req: NextRequest) {
  // ── Auth check ──
  const secret = req.nextUrl.searchParams.get("secret");
  const cronSecret = config.cronSecret();
  if (cronSecret && secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── Fetch all properties ──
    const allProperties = await fetchAllEjendomme();

    // ── Apply rules ──
    const activeRules = DEFAULT_AUTO_RULES.filter((r) => r.active);
    if (activeRules.length === 0) {
      return NextResponse.json({
        message: "No active auto-research rules",
        propertiesChecked: allProperties.length,
        queued: 0,
      });
    }

    const toResearch: Property[] = [];

    for (const property of allProperties) {
      if (toResearch.length >= 20) break; // Cap at 20 per run

      for (const rule of activeRules) {
        // Check status match
        if (!rule.fromStatuses.includes(property.outreachStatus)) continue;

        // Check score
        if (rule.minScore && (property.outdoorScore || 0) < rule.minScore) continue;

        // Check age
        if (rule.maxAgeHours && property.createdAt) {
          const ageMs = Date.now() - new Date(property.createdAt).getTime();
          const ageHours = ageMs / (1000 * 60 * 60);
          if (ageHours > rule.maxAgeHours) continue;
        }

        // Property matches this rule
        toResearch.push(property);
        break; // Don't apply more rules to the same property
      }
    }

    // ── Mark as research started ──
    const results: { id: string; address: string; rule: string; status: string }[] = [];

    for (const prop of toResearch) {
      try {
        await updateEjendom(prop.id, { outreach_status: "RESEARCH_IGANGSAT" });
        results.push({
          id: prop.id,
          address: prop.address,
          rule: "auto",
          status: "queued",
        });
      } catch (err) {
        results.push({
          id: prop.id,
          address: prop.address,
          rule: "auto",
          status: `error: ${err instanceof Error ? err.message : "unknown"}`,
        });
      }
    }

    // Note: The actual research execution would be triggered by a separate
    // process that picks up properties in RESEARCH_IGANGSAT status.
    // For now, we just mark them as ready for research.
    // A future improvement would call the research engine directly here.

    return NextResponse.json({
      message: `Auto-research check complete`,
      timestamp: new Date().toISOString(),
      propertiesChecked: allProperties.length,
      activeRules: activeRules.map((r) => r.label),
      queued: results.filter((r) => r.status === "queued").length,
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
