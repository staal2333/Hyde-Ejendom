// ============================================================
// AI Lead Discovery – run source (Meta Ad Library, etc.) and resolve to companies
// ============================================================

import { fetchMetaAdLibrary } from "./sources/meta-ad-library";
import { resolveCompanies } from "./companies";
import type { LeadCompany } from "./companies";

export type DiscoverSource = "meta";

export interface DiscoverOptions {
  source: DiscoverSource;
  /** Search query (e.g. "reklame", "marketing", or empty for broad) */
  query?: string;
  /** Country code for ad reach, e.g. "DK" */
  country?: string;
  /** Max advertisers to fetch from source before resolving */
  limit?: number;
  /** For Meta: "all" = Facebook + Instagram, "instagram" = only Instagram ads */
  platform?: "all" | "instagram";
}

export interface DiscoverResult {
  companies: LeadCompany[];
  /** True if Instagram was requested but Meta returned error and we fell back to all platforms */
  platformFallback?: boolean;
}

/**
 * Run lead discovery: fetch advertisers from the given source,
 * then resolve to companies (CVR + Proff + dedupe).
 */
export async function runDiscover(options: DiscoverOptions): Promise<LeadCompany[]> {
  const { companies } = await runDiscoverWithMeta(options);
  return companies;
}

export async function runDiscoverWithMeta(options: DiscoverOptions): Promise<DiscoverResult> {
  const { source, query = "", country = "DK", limit = 30, platform = "all" } = options;

  let names: string[] = [];
  let platformFallback = false;

  if (source === "meta") {
    try {
      const advertisers = await fetchMetaAdLibrary({
        searchTerms: query.trim() || undefined,
        adReachedCountries: [country],
        limit,
        publisherPlatforms: platform === "instagram" ? ["INSTAGRAM"] : undefined,
      });
      names = advertisers.map((a) => a.pageName).filter(Boolean);
    } catch (e) {
      if (platform === "instagram") {
        const advertisers = await fetchMetaAdLibrary({
          searchTerms: query.trim() || undefined,
          adReachedCountries: [country],
          limit,
          publisherPlatforms: undefined,
        });
        names = advertisers.map((a) => a.pageName).filter(Boolean);
        platformFallback = true;
      } else {
        throw e;
      }
    }
    // Dedupe by name (same page can appear in multiple ads)
    names = [...new Set(names)];
  } else {
    throw new Error(`Unknown discovery source: ${source}`);
  }

  if (names.length === 0) {
    return { companies: [], platformFallback: platformFallback ? true : undefined };
  }

  const companies = await resolveCompanies({ names });
  return { companies, platformFallback: platformFallback ? true : undefined };
}
