// ============================================================
// Google Ads Transparency Center via SearchAPI.io (covers YouTube)
// ============================================================

import { logger } from "@/lib/logger";
import { type Advertiser, type AdLibraryOptions, getSearchApiKey, searchApiFetch } from "./types";

interface RawGoogleAdCreative {
  id?: string;
  advertiser?: {
    id?: string;
    name?: string;
  };
  target_domain?: string;
  first_shown_datetime?: string;
  last_shown_datetime?: string;
  total_days_shown?: number;
  format?: string;
}

interface AdvertiserAccum {
  pageName: string;
  adCount: number;
  formats: Set<string>;
  domain: string | null;
}

export async function fetchGoogleAdLibrary(options: AdLibraryOptions = {}): Promise<Advertiser[]> {
  const apiKey = getSearchApiKey();
  const { searchTerms = "", countries = ["DK"], limit = 50 } = options;

  const accum = new Map<string, AdvertiserAccum>();
  let nextPageToken: string | undefined;
  const maxPages = Math.min(Math.ceil(limit / 40), 5);

  for (let page = 0; page < maxPages && accum.size < limit; page++) {
    const params = new URLSearchParams({
      engine: "google_ads_transparency_center",
      region: (countries[0] || "DK").toLowerCase(),
      api_key: apiKey,
    });

    const query = searchTerms.trim();
    if (query) {
      if (query.includes(".")) {
        params.set("domain", query);
      } else {
        params.set("text", query);
      }
    } else {
      params.set("text", "reklame");
    }

    if (nextPageToken) params.set("next_page_token", nextPageToken);

    logger.info(`[google-ads] GET page ${page + 1} — query="${query || "reklame"}"`, { service: "lead-sourcing" });

    const data = await searchApiFetch(params, "google-ads") as {
      ad_creatives?: RawGoogleAdCreative[];
      pagination?: { next_page_token?: string };
    };

    const creatives = data.ad_creatives || [];
    logger.info(`[google-ads] Got ${creatives.length} ad creatives`, { service: "lead-sourcing" });

    for (const creative of creatives) {
      const advertiserName = (creative.advertiser?.name || "").trim();
      const advertiserId = creative.advertiser?.id || "";
      if (!advertiserName || advertiserName.length < 2) continue;

      const key = advertiserId || advertiserName.toLowerCase();
      const existing = accum.get(key);

      if (existing) {
        existing.adCount += 1;
        if (creative.format) existing.formats.add(creative.format);
      } else {
        const formats = new Set<string>();
        if (creative.format) formats.add(creative.format);
        accum.set(key, {
          pageName: advertiserName,
          adCount: 1,
          formats,
          domain: creative.target_domain ?? null,
        });
      }
      if (accum.size >= limit) break;
    }

    nextPageToken = data.pagination?.next_page_token;
    if (!nextPageToken || creatives.length === 0) break;
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
