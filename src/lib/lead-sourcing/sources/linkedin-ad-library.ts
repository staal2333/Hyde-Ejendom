// ============================================================
// LinkedIn Ad Library via SearchAPI.io
// ============================================================

import { logger } from "@/lib/logger";
import { type Advertiser, type AdLibraryOptions, getSearchApiKey, searchApiFetch } from "./types";

interface RawLinkedInAd {
  position?: number;
  id?: string;
  advertiser?: {
    name?: string;
    thumbnail?: string;
  };
  ad_type?: string;
  content?: {
    headline?: string;
    image?: string;
    cta?: string;
  };
  link?: string;
}

interface AdvertiserAccum {
  pageName: string;
  adCount: number;
  thumbnail: string | null;
}

export async function fetchLinkedInAdLibrary(options: AdLibraryOptions = {}): Promise<Advertiser[]> {
  const apiKey = getSearchApiKey();
  const { searchTerms = "", countries = ["DK"], limit = 50 } = options;

  const accum = new Map<string, AdvertiserAccum>();
  let nextPageToken: string | undefined;
  const maxPages = Math.min(Math.ceil(limit / 20), 5);

  for (let page = 0; page < maxPages && accum.size < limit; page++) {
    const params = new URLSearchParams({
      engine: "linkedin_ad_library",
      q: searchTerms.trim() || "marketing",
      country: (countries[0] || "DK").toUpperCase(),
      api_key: apiKey,
    });

    if (nextPageToken) params.set("next_page_token", nextPageToken);

    logger.info(`[linkedin] GET page ${page + 1} — q="${searchTerms.trim() || "marketing"}"`, { service: "lead-sourcing" });

    const data = await searchApiFetch(params, "linkedin") as {
      ads?: RawLinkedInAd[];
      pagination?: { next_page_token?: string };
    };

    const ads = data.ads || [];
    logger.info(`[linkedin] Got ${ads.length} results`, { service: "lead-sourcing" });

    for (const ad of ads) {
      const advertiserName = (ad.advertiser?.name || "").trim();
      if (!advertiserName || advertiserName.length < 2) continue;

      const key = advertiserName.toLowerCase();
      const existing = accum.get(key);

      if (existing) {
        existing.adCount += 1;
      } else {
        accum.set(key, {
          pageName: advertiserName,
          adCount: 1,
          thumbnail: ad.advertiser?.thumbnail ?? null,
        });
      }
      if (accum.size >= limit) break;
    }

    nextPageToken = data.pagination?.next_page_token;
    if (!nextPageToken || ads.length === 0) break;
  }

  logger.info(`[linkedin] Found ${accum.size} unique advertisers`, { service: "lead-sourcing" });

  return Array.from(accum.entries()).slice(0, limit).map(([id, a]) => ({
    pageId: id,
    pageName: a.pageName,
    pageCategory: null,
    pageLikes: null,
    adCount: a.adCount,
    platforms: ["LinkedIn"],
    sourcePlatform: "linkedin" as const,
  }));
}
