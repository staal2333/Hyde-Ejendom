// ============================================================
// TikTok Ad Library via SearchAPI.io
// ============================================================

import { logger } from "@/lib/logger";
import { type Advertiser, type AdLibraryOptions, getSearchApiKey, searchApiFetch } from "./types";

interface RawTikTokAd {
  id?: string;
  advertiser?: string;
  first_shown_datetime?: string;
  last_shown_datetime?: string;
  estimated_audience?: string;
  estimated_audience_min?: number;
  estimated_audience_max?: number;
}

interface AdvertiserAccum {
  pageName: string;
  adCount: number;
  reach: number;
}

export async function fetchTikTokAdLibrary(options: AdLibraryOptions = {}): Promise<Advertiser[]> {
  const apiKey = getSearchApiKey();
  const { searchTerms = "", countries = ["DK"], limit = 50 } = options;

  const accum = new Map<string, AdvertiserAccum>();
  let nextPageToken: string | undefined;
  const maxPages = Math.min(Math.ceil(limit / 20), 5);

  for (let page = 0; page < maxPages && accum.size < limit; page++) {
    const params = new URLSearchParams({
      engine: "tiktok_ads_library",
      q: searchTerms.trim() || "reklame",
      country: (countries[0] || "DK").toLowerCase(),
      sort_by: "unique_users_seen_high_to_low",
      api_key: apiKey,
    });

    if (nextPageToken) params.set("next_page_token", nextPageToken);

    logger.info(`[tiktok] GET page ${page + 1} — q="${searchTerms.trim() || "reklame"}"`, { service: "lead-sourcing" });

    const data = await searchApiFetch(params, "tiktok") as {
      ads?: RawTikTokAd[];
      pagination?: { next_page_token?: string };
    };

    const ads = data.ads || [];
    logger.info(`[tiktok] Got ${ads.length} ads`, { service: "lead-sourcing" });

    for (const ad of ads) {
      const advertiserName = (typeof ad.advertiser === "string" ? ad.advertiser : "").trim();
      if (!advertiserName || advertiserName.length < 2) continue;

      const key = advertiserName.toLowerCase();
      const reach = ad.estimated_audience_max || ad.estimated_audience_min || 0;
      const existing = accum.get(key);

      if (existing) {
        existing.adCount += 1;
        existing.reach = Math.max(existing.reach, reach);
      } else {
        accum.set(key, {
          pageName: advertiserName,
          adCount: 1,
          reach,
        });
      }
      if (accum.size >= limit) break;
    }

    nextPageToken = data.pagination?.next_page_token;
    if (!nextPageToken || ads.length === 0) break;
  }

  logger.info(`[tiktok] Found ${accum.size} unique advertisers`, { service: "lead-sourcing" });

  return Array.from(accum.entries()).slice(0, limit).map(([id, a]) => ({
    pageId: id,
    pageName: a.pageName,
    pageCategory: null,
    pageLikes: a.reach > 0 ? a.reach : null,
    adCount: a.adCount,
    platforms: ["TikTok"],
    sourcePlatform: "tiktok" as const,
  }));
}
