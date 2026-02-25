// ============================================================
// Meta Ad Library via SearchAPI.io – fetch advertisers (page_name)
// Requires SEARCHAPI_API_KEY (free signup at searchapi.io)
// ============================================================

import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { type Advertiser } from "./types";

export type { Advertiser };
/** @deprecated Use Advertiser instead */
export type MetaAdvertiser = Advertiser;

const BASE = "https://www.searchapi.io/api/v1/search";

export interface MetaAdLibraryOptions {
  searchTerms?: string;
  adReachedCountries?: string[];
  limit?: number;
  publisherPlatforms?: string[];
}

interface RawAd {
  page_id?: string;
  page_name?: string;
  collation_count?: number;
  publisher_platform?: string[];
  snapshot?: {
    page_id?: string;
    page_name?: string;
    page_categories?: string[];
    page_like_count?: number;
  };
}

interface AdvertiserAccum {
  pageName: string;
  pageCategory: string | null;
  pageLikes: number | null;
  adCount: number;
  platforms: Set<string>;
}

export async function fetchMetaAdLibrary(options: MetaAdLibraryOptions = {}): Promise<Advertiser[]> {
  const apiKey = config.searchApi.apiKey();
  if (!apiKey) {
    throw new Error("SEARCHAPI_API_KEY er ikke sat. Opret en konto på searchapi.io og tilføj API-nøglen i .env.local.");
  }

  const {
    searchTerms = "",
    adReachedCountries = ["DK"],
    limit = 50,
    publisherPlatforms,
  } = options;

  const accum = new Map<string, AdvertiserAccum>();
  let nextPageToken: string | undefined;
  const maxPages = Math.min(Math.ceil(limit / 20), 8);

  for (let page = 0; page < maxPages && accum.size < limit; page++) {
    const params = new URLSearchParams({
      engine: "meta_ad_library",
      q: searchTerms.trim() || "reklame",
      country: (adReachedCountries[0] || "DK").toLowerCase(),
      active_status: "active",
      ad_type: "all",
      api_key: apiKey,
    });

    if (publisherPlatforms?.length) {
      params.set("platforms", publisherPlatforms.map(p => p.toLowerCase()).join(","));
    }

    if (nextPageToken) {
      params.set("next_page_token", nextPageToken);
    }

    const url = `${BASE}?${params.toString()}`;
    logger.info(`[searchapi] GET page ${page + 1} — q="${searchTerms.trim() || "reklame"}", country=${adReachedCountries[0] || "DK"}`, { service: "lead-sourcing" });

    let res: Response;
    try {
      res = await fetch(url);
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      logger.error(`[searchapi] Network error: ${msg}`, { service: "lead-sourcing" });
      throw new Error(`SearchAPI.io: netværksfejl (${msg}). Tjek internet-forbindelsen.`);
    }

    logger.info(`[searchapi] Response: ${res.status} ${res.statusText}`, { service: "lead-sourcing" });

    if (!res.ok) {
      const errText = await res.text();
      logger.error(`[searchapi] Error body: ${errText.slice(0, 500)}`, { service: "lead-sourcing" });
      if (res.status === 401 || res.status === 403) {
        throw new Error("SearchAPI.io: Ugyldig API-nøgle. Tjek SEARCHAPI_API_KEY i .env.local.");
      }
      if (res.status === 429) {
        throw new Error("SearchAPI.io: Rate limit nået. Vent et øjeblik og prøv igen.");
      }
      throw new Error(`SearchAPI.io API fejl (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      ads?: RawAd[];
      pagination?: { next_page_token?: string };
      search_information?: { total_results?: number };
    };

    const totalResults = data.search_information?.total_results ?? 0;
    const ads = data.ads || [];
    logger.info(`[searchapi] Got ${ads.length} ads (total: ${totalResults})`, { service: "lead-sourcing" });

    for (const ad of ads) {
      const pageId = ad.page_id || ad.snapshot?.page_id;
      const pageName = (ad.page_name || ad.snapshot?.page_name || "").trim();
      if (!pageId || !pageName || pageName.length < 2) continue;

      const key = String(pageId);
      const existing = accum.get(key);

      if (existing) {
        existing.adCount += ad.collation_count || 1;
        if (ad.publisher_platform) {
          for (const p of ad.publisher_platform) existing.platforms.add(p);
        }
        if (!existing.pageCategory && ad.snapshot?.page_categories?.length) {
          existing.pageCategory = ad.snapshot.page_categories[0];
        }
        if (existing.pageLikes === null && ad.snapshot?.page_like_count) {
          existing.pageLikes = ad.snapshot.page_like_count;
        }
      } else {
        const platforms = new Set<string>();
        if (ad.publisher_platform) {
          for (const p of ad.publisher_platform) platforms.add(p);
        }
        accum.set(key, {
          pageName,
          pageCategory: ad.snapshot?.page_categories?.[0] ?? null,
          pageLikes: ad.snapshot?.page_like_count ?? null,
          adCount: ad.collation_count || 1,
          platforms,
        });
      }

      if (accum.size >= limit) break;
    }

    nextPageToken = data.pagination?.next_page_token;
    if (!nextPageToken || ads.length === 0) break;
  }

  logger.info(`[searchapi] Found ${accum.size} unique advertisers`, { service: "lead-sourcing" });

  return Array.from(accum.entries()).slice(0, limit).map(([pageId, a]) => ({
    pageId,
    pageName: a.pageName,
    pageCategory: a.pageCategory,
    pageLikes: a.pageLikes,
    adCount: a.adCount,
    platforms: Array.from(a.platforms),
    sourcePlatform: "meta" as const,
  }));
}
