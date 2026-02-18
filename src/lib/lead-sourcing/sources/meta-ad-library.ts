// ============================================================
// Meta Ad Library – fetch advertisers (page_name) from ads_archive API
// Requires META_AD_LIBRARY_ACCESS_TOKEN (Meta App with Ad Library API access)
// ============================================================

import { config } from "@/lib/config";

const BASE = "https://graph.facebook.com";

export interface MetaAdvertiser {
  pageId: string;
  pageName: string;
}

export interface MetaAdLibraryOptions {
  searchTerms?: string;
  /** ISO country code, e.g. "DK" */
  adReachedCountries?: string[];
  /** Max number of unique advertisers to return */
  limit?: number;
  /** Filter by platform: INSTAGRAM, FACEBOOK, etc. Omit = all platforms */
  publisherPlatforms?: string[];
}

/**
 * Fetch unique advertisers (Facebook Pages) that ran ads matching the search.
 * Uses Graph API ads_archive. Returns page_id + page_name for CVR resolution.
 */
export async function fetchMetaAdLibrary(options: MetaAdLibraryOptions = {}): Promise<MetaAdvertiser[]> {
  const token = config.metaAdLibrary.accessToken();
  if (!token) {
    throw new Error("META_AD_LIBRARY_ACCESS_TOKEN is not set. Add it in .env to use Meta Ad Library.");
  }

  const {
    searchTerms = "",
    adReachedCountries = ["DK"],
    limit = 50,
    publisherPlatforms,
  } = options;

  const version = config.metaAdLibrary.apiVersion;
  const seen = new Map<string, string>(); // page_id -> page_name
  let after: string | undefined;
  let requested = 0;
  const maxPages = 10; // limit API pages to avoid rate limit

  const buildParams = (apiVersion: string, includeExtra: boolean) => {
    const params = new URLSearchParams({
      access_token: token,
      ad_reached_countries: JSON.stringify(adReachedCountries),
      search_terms: searchTerms.trim() || "reklame",
      fields: "id,page_id,page_name",
      limit: String(Math.min(25, limit + 5)),
    });
    if (includeExtra) {
      params.set("ad_type", "ALL");
      params.set("ad_active_status", "ACTIVE");
    }
    if (publisherPlatforms?.length) {
      params.set("publisher_platforms", JSON.stringify(publisherPlatforms));
    }
    if (after) params.set("after", after);
    return `${BASE}/${apiVersion}/ads_archive?${params.toString()}`;
  };

  while (seen.size < limit && requested < maxPages) {
    let url = buildParams(version, true);
    let res: Response;
    try {
      res = await fetch(url);
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      throw new Error(
        `Meta Ad Library: netværksfejl (${msg}). Tjek at serveren kan nå graph.facebook.com (firewall, proxy, internet).`
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      const isCode1 = errText.includes('"code":1');
      if (isCode1 && requested === 0) {
        res = await fetch(buildParams("v21.0", false));
      }
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Meta Ad Library API error (${res.status}): ${err}`);
      }
    }
    const data = (await res.json()) as {
      data?: { id?: string; page_id?: string; page_name?: string }[];
      paging?: { cursors?: { after?: string }; next?: string };
    };

    requested++;
    const list = data.data || [];
    for (const ad of list) {
      const pageId = ad.page_id || ad.id;
      const pageName = (ad.page_name || "").trim();
      if (pageId && pageName && pageName.length > 1) {
        seen.set(String(pageId), pageName);
      }
    }

    if (list.length === 0 || !data.paging?.cursors?.after) break;
    after = data.paging.cursors.after;
  }

  return Array.from(seen.entries()).slice(0, limit).map(([pageId, pageName]) => ({
    pageId,
    pageName,
  }));
}
