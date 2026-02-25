// ============================================================
// Google Ads Transparency Center via SearchAPI.io (covers YouTube)
// ============================================================

import { logger } from "@/lib/logger";
import { type Advertiser, type AdLibraryOptions, getSearchApiKey, searchApiFetch } from "./types";

interface RawGoogleAd {
  advertiser_name?: string;
  advertiser_id?: string;
  advertiser_url?: string;
  ad_count?: number;
  region_code?: string;
  format?: string;
}

interface AdvertiserAccum {
  pageName: string;
  adCount: number;
  formats: Set<string>;
}

export async function fetchGoogleAdLibrary(options: AdLibraryOptions = {}): Promise<Advertiser[]> {
  const apiKey = getSearchApiKey();
  const { searchTerms = "", countries = ["DK"], limit = 50 } = options;

  const accum = new Map<string, AdvertiserAccum>();
  let nextPageToken: string | undefined;
  const maxPages = Math.min(Math.ceil(limit / 20), 5);

  for (let page = 0; page < maxPages && accum.size < limit; page++) {
    const params = new URLSearchParams({
      engine: "google_ads_transparency_center",
      q: searchTerms.trim() || "reklame",
      region: (countries[0] || "DK").toUpperCase(),
      api_key: apiKey,
    });

    if (nextPageToken) params.set("next_page_token", nextPageToken);

    logger.info(`[google-ads] GET page ${page + 1} — q="${searchTerms.trim() || "reklame"}"`, { service: "lead-sourcing" });

    const data = await searchApiFetch(params, "google-ads") as {
      ads?: RawGoogleAd[];
      advertisers?: RawGoogleAd[];
      pagination?: { next_page_token?: string };
    };

    const ads = data.ads || data.advertisers || [];
    logger.info(`[google-ads] Got ${ads.length} results`, { service: "lead-sourcing" });

    for (const ad of ads) {
      const advertiserName = (ad.advertiser_name || "").trim();
      const advertiserId = ad.advertiser_id || "";
      if (!advertiserName || advertiserName.length < 2) continue;

      const key = advertiserId || advertiserName.toLowerCase();
      const existing = accum.get(key);

      if (existing) {
        existing.adCount += ad.ad_count || 1;
        if (ad.format) existing.formats.add(ad.format);
      } else {
        const formats = new Set<string>();
        if (ad.format) formats.add(ad.format);
        accum.set(key, {
          pageName: advertiserName,
          adCount: ad.ad_count || 1,
          formats,
        });
      }
      if (accum.size >= limit) break;
    }

    nextPageToken = data.pagination?.next_page_token;
    if (!nextPageToken || ads.length === 0) break;
  }

  logger.info(`[google-ads] Found ${accum.size} unique advertisers`, { service: "lead-sourcing" });

  const platformLabel = (formats: Set<string>) => {
    const fmts = Array.from(formats).map(f => f.toLowerCase());
    const plats = ["Google Ads"];
    if (fmts.some(f => f.includes("video") || f.includes("youtube"))) plats.push("YouTube");
    return plats;
  };

  return Array.from(accum.entries()).slice(0, limit).map(([id, a]) => ({
    pageId: id,
    pageName: a.pageName,
    pageCategory: null,
    pageLikes: null,
    adCount: a.adCount,
    platforms: platformLabel(a.formats),
    sourcePlatform: "google" as const,
  }));
}
