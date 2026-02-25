// ============================================================
// Shared Advertiser interface for all ad library sources
// ============================================================

export interface Advertiser {
  pageId: string;
  pageName: string;
  pageCategory: string | null;
  pageLikes: number | null;
  adCount: number;
  platforms: string[];
  sourcePlatform: "meta" | "tiktok" | "linkedin" | "google";
}

export interface AdLibraryOptions {
  searchTerms?: string;
  countries?: string[];
  limit?: number;
}

export interface SearchApiError {
  status: number;
  body: string;
}

export function getSearchApiKey(): string {
  const key = process.env.SEARCHAPI_API_KEY || "";
  if (!key) {
    throw new Error("SEARCHAPI_API_KEY er ikke sat. Opret en konto på searchapi.io og tilføj API-nøglen i .env.local.");
  }
  return key;
}

export const SEARCHAPI_BASE = "https://www.searchapi.io/api/v1/search";

export async function searchApiFetch(params: URLSearchParams, label: string): Promise<Record<string, unknown>> {
  const { logger } = await import("@/lib/logger");
  const url = `${SEARCHAPI_BASE}?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (networkErr) {
    const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
    logger.error(`[${label}] Network error: ${msg}`, { service: "lead-sourcing" });
    throw new Error(`SearchAPI.io: netværksfejl (${msg})`);
  }

  if (!res.ok) {
    const errText = await res.text();
    logger.error(`[${label}] Error ${res.status}: ${errText.slice(0, 500)}`, { service: "lead-sourcing" });
    if (res.status === 401 || res.status === 403) {
      throw new Error("SearchAPI.io: Ugyldig API-nøgle.");
    }
    if (res.status === 429) {
      throw new Error("SearchAPI.io: Rate limit nået. Vent et øjeblik.");
    }
    throw new Error(`SearchAPI.io fejl (${res.status}): ${errText.slice(0, 200)}`);
  }

  return (await res.json()) as Record<string, unknown>;
}
