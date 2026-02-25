// GET /api/lead-sourcing/test-meta – Test SearchAPI.io connectivity
import { NextResponse } from "next/server";
import { fetchMetaAdLibrary } from "@/lib/lead-sourcing/sources/meta-ad-library";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const apiKey = config.searchApi.apiKey();
    if (!apiKey) {
      logger.warn("[test-meta] SEARCHAPI_API_KEY is not set", { service: "lead-sourcing" });
      return NextResponse.json(
        {
          ok: false,
          error: "SEARCHAPI_API_KEY er ikke sat",
          errorType: "no_token",
          hint: "Opret en konto på searchapi.io, kopier din API-nøgle, og tilføj SEARCHAPI_API_KEY=... i .env.local",
        },
        { status: 200 }
      );
    }

    logger.info(`[test-meta] Testing with key ${apiKey.slice(0, 8)}...`, { service: "lead-sourcing" });

    const companies = await fetchMetaAdLibrary({
      searchTerms: "reklame",
      adReachedCountries: ["DK"],
      limit: 5,
    });

    logger.info(`[test-meta] OK — ${companies.length} advertisers found`, { service: "lead-sourcing" });

    return NextResponse.json({
      ok: true,
      message: "SearchAPI.io virker",
      count: companies.length,
      sample: companies.slice(0, 3).map((c) => ({ pageId: c.pageId, pageName: c.pageName })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`[test-meta] FAILED: ${message}`, { service: "lead-sourcing" });
    const isAuthError = message.includes("Ugyldig API-nøgle") || message.includes("401") || message.includes("403");
    const isNetworkError = message.includes("netværksfejl") || message.includes("fetch failed");
    const isRateLimit = message.includes("429") || message.includes("Rate limit");
    const errorType = isAuthError ? "invalid_key" : isNetworkError ? "network" : isRateLimit ? "rate_limit" : "unknown";
    const hint = isAuthError
      ? "API-nøglen er ugyldig. Tjek at SEARCHAPI_API_KEY er korrekt i .env.local."
      : isNetworkError
        ? "Serveren kunne ikke nå searchapi.io. Tjek internet og firewall."
        : isRateLimit
          ? "Rate limit nået. Vent et øjeblik og prøv igen."
          : undefined;
    return NextResponse.json({ ok: false, error: message, errorType, hint }, { status: 200 });
  }
}
