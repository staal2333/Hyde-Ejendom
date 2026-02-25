// POST /api/lead-sourcing/discover – AI lead discovery via SearchAPI.io

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { z } from "zod";

const schema = z.object({
  source: z.enum(["meta", "tiktok", "linkedin", "google", "all"]).optional().default("meta"),
  sources: z.array(z.enum(["meta", "tiktok", "linkedin", "google"])).optional(),
  query: z.string().optional().default(""),
  queries: z.array(z.string()).optional(),
  country: z.string().length(2).optional().default("DK"),
  limit: z.number().min(1).max(200).optional().default(50),
  batch: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return apiError(400, "Validation failed", parsed.error.issues.map(i => i.message).join(", "));
    }

    const { source, sources, query, queries, country, limit, batch } = parsed.data;

    if (batch || (queries && queries.length > 0)) {
      const { runBatchDiscover, OOH_INDUSTRY_KEYWORDS } = await import("@/lib/lead-sourcing/discover");
      const keywordList = queries && queries.length > 0 ? queries : OOH_INDUSTRY_KEYWORDS;

      logger.info(`[discover] Batch starting: ${keywordList.length} keywords, sources=${sources?.join(",") || source}, country=${country}`, { service: "lead-sourcing" });

      const result = await runBatchDiscover({
        source: source ?? "meta",
        queries: keywordList,
        country,
        limitPerQuery: Math.min(limit, 80),
        sources,
      });

      logger.info(`[discover] Batch done: ${result.companies.length} companies from ${result.queriesRun} queries (${result.totalAdsFound} unique ads)`, { service: "lead-sourcing" });

      return NextResponse.json({
        companies: result.companies,
        source, country,
        sources: result.sourcesUsed,
        batch: true,
        queriesRun: result.queriesRun,
        totalAdsFound: result.totalAdsFound,
      });
    }

    logger.info(`[discover] Starting: source=${sources?.join(",") || source}, query="${query}", country=${country}, limit=${limit}`, { service: "lead-sourcing" });

    const { runDiscoverWithMeta } = await import("@/lib/lead-sourcing/discover");
    const result = await runDiscoverWithMeta({ source: source ?? "meta", query, country, limit, sources });

    logger.info(`[discover] Done: ${result.companies.length} companies found (sources: ${result.sourcesUsed?.join(",")})`, { service: "lead-sourcing" });

    return NextResponse.json({
      companies: result.companies,
      source, query, country,
      sources: result.sourcesUsed,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : undefined;
    logger.error(`[discover] FAILED: ${message}`, { service: "lead-sourcing" });
    if (stack) logger.error(`[discover] Stack: ${stack}`, { service: "lead-sourcing" });

    const isAuthError = message.includes("Ugyldig API-nøgle") || message.includes("401") || message.includes("403");
    const isNoKey = message.includes("SEARCHAPI_API_KEY er ikke sat");
    const isRateLimit = message.includes("429") || message.includes("Rate limit");
    const errorType = isNoKey ? "no_key" : isAuthError ? "invalid_key" : isRateLimit ? "rate_limit" : "unknown";
    const hint = isNoKey
      ? "Tilføj SEARCHAPI_API_KEY i .env.local (konto på searchapi.io)."
      : isAuthError
        ? "API-nøglen er ugyldig. Tjek SEARCHAPI_API_KEY i .env.local."
        : isRateLimit
          ? "Rate limit nået. Vent et øjeblik og prøv igen."
          : undefined;
    return NextResponse.json({ error: message, errorType, hint }, { status: 500 });
  }
}
