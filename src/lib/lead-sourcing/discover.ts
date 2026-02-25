// ============================================================
// AI Lead Discovery – run sources (Meta, TikTok, LinkedIn, Google) and resolve to companies
// ============================================================

import { fetchMetaAdLibrary } from "./sources/meta-ad-library";
import { fetchTikTokAdLibrary } from "./sources/tiktok-ad-library";
import { fetchLinkedInAdLibrary } from "./sources/linkedin-ad-library";
import { fetchGoogleAdLibrary } from "./sources/google-ad-library";
import { type Advertiser } from "./sources/types";
import { resolveCompanies } from "./companies";
import { scoreOohBatch } from "./ooh-scorer";
import { logger } from "@/lib/logger";
import type { LeadCompany } from "./companies";

export type DiscoverSource = "meta" | "tiktok" | "linkedin" | "google" | "all";

export interface DiscoverOptions {
  source: DiscoverSource;
  query?: string;
  country?: string;
  limit?: number;
  sources?: DiscoverSource[];
}

export interface BatchDiscoverOptions {
  source: DiscoverSource;
  queries: string[];
  country?: string;
  limitPerQuery?: number;
  sources?: DiscoverSource[];
}

export interface DiscoverResult {
  companies: LeadCompany[];
  platformFallback?: boolean;
  queriesRun?: number;
  totalAdsFound?: number;
  sourcesUsed?: string[];
}

export const OOH_INDUSTRY_KEYWORDS = [
  "reklame",
  "retail",
  "restaurant",
  "fitness",
  "mode",
  "bil",
  "bolig",
  "møbler",
  "skønhed",
  "rejser",
  "underholdning",
  "sport",
  "hotel",
  "cafe",
  "tøj",
];

const ALL_SOURCES: Exclude<DiscoverSource, "all">[] = ["meta", "tiktok", "linkedin", "google"];

async function fetchFromSource(
  source: Exclude<DiscoverSource, "all">,
  query: string,
  country: string,
  limit: number,
): Promise<Advertiser[]> {
  switch (source) {
    case "meta":
      return fetchMetaAdLibrary({
        searchTerms: query || undefined,
        adReachedCountries: [country],
        limit,
      });
    case "tiktok":
      return fetchTikTokAdLibrary({ searchTerms: query || undefined, countries: [country], limit });
    case "linkedin":
      return fetchLinkedInAdLibrary({ searchTerms: query || undefined, countries: [country], limit });
    case "google":
      return fetchGoogleAdLibrary({ searchTerms: query || undefined, countries: [country], limit });
  }
}

function mergeAdvertiser(existing: Advertiser, incoming: Advertiser): void {
  existing.adCount = Math.max(existing.adCount, incoming.adCount);
  if (incoming.pageLikes && (!existing.pageLikes || incoming.pageLikes > existing.pageLikes)) {
    existing.pageLikes = incoming.pageLikes;
  }
  if (incoming.pageCategory && !existing.pageCategory) {
    existing.pageCategory = incoming.pageCategory;
  }
  for (const p of incoming.platforms) {
    if (!existing.platforms.includes(p)) existing.platforms.push(p);
  }
}

export async function runDiscover(options: DiscoverOptions): Promise<LeadCompany[]> {
  const { companies } = await runDiscoverWithMeta(options);
  return companies;
}

export async function runDiscoverWithMeta(options: DiscoverOptions): Promise<DiscoverResult> {
  const { source, query = "", country = "DK", limit = 30, sources } = options;
  const activeSources = sources?.length
    ? sources.filter((s): s is Exclude<DiscoverSource, "all"> => s !== "all")
    : source === "all" ? ALL_SOURCES : [source as Exclude<DiscoverSource, "all">];

  const allAdvertisers = new Map<string, Advertiser>();
  const usedSources: string[] = [];

  for (const src of activeSources) {
    try {
      logger.info(`[discover] Fetching from ${src}…`, { service: "lead-sourcing" });
      const ads = await fetchFromSource(src, query.trim(), country, limit);
      usedSources.push(src);

      for (const a of ads) {
        const key = a.pageName.toLowerCase();
        const existing = allAdvertisers.get(key);
        if (existing) {
          mergeAdvertiser(existing, a);
        } else {
          allAdvertisers.set(key, { ...a });
        }
      }
      logger.info(`[discover] ${src} → ${ads.length} advertisers, total unique: ${allAdvertisers.size}`, { service: "lead-sourcing" });

      if (activeSources.length > 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`[discover] ${src} failed: ${msg}`, { service: "lead-sourcing" });
    }
  }

  const advertisers = Array.from(allAdvertisers.values());
  if (advertisers.length === 0) {
    return { companies: [], sourcesUsed: usedSources };
  }

  const uniqueNames = [...new Set(advertisers.map((a) => a.pageName).filter(Boolean))];
  const companies = await resolveCompanies({ names: uniqueNames, advertisers });
  const scored = scoreOohBatch(companies);

  return { companies: scored, sourcesUsed: usedSources };
}

/**
 * Run batch discovery across multiple keywords and platforms,
 * deduplicate advertisers, then resolve all unique advertisers in one pass.
 */
export async function runBatchDiscover(options: BatchDiscoverOptions): Promise<DiscoverResult> {
  const { source, queries, country = "DK", limitPerQuery = 50, sources } = options;
  const activeSources = sources?.length
    ? sources.filter((s): s is Exclude<DiscoverSource, "all"> => s !== "all")
    : source === "all" ? ALL_SOURCES : [source as Exclude<DiscoverSource, "all">];

  const allAdvertisers = new Map<string, Advertiser>();
  let queriesRun = 0;
  const usedSources: string[] = [];

  for (const src of activeSources) {
    if (!usedSources.includes(src)) usedSources.push(src);

    for (const q of queries) {
      try {
        logger.info(`[batch-discover] ${src} keyword "${q}" (${queriesRun + 1})`, { service: "lead-sourcing" });

        const ads = await fetchFromSource(src, q, country, limitPerQuery);

        for (const a of ads) {
          const key = a.pageName.toLowerCase();
          const existing = allAdvertisers.get(key);
          if (existing) {
            mergeAdvertiser(existing, a);
          } else {
            allAdvertisers.set(key, { ...a });
          }
        }

        queriesRun++;
        logger.info(`[batch-discover] ${src}:"${q}" → ${ads.length} ads, total unique: ${allAdvertisers.size}`, { service: "lead-sourcing" });

        await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`[batch-discover] ${src}:"${q}" failed: ${msg}`, { service: "lead-sourcing" });
        if (msg.includes("Rate limit") || msg.includes("429")) {
          logger.warn(`[batch-discover] Rate limited on ${src} — skipping remaining keywords for this source`, { service: "lead-sourcing" });
          break;
        }
      }
    }
  }

  const advertisers = Array.from(allAdvertisers.values());
  logger.info(`[batch-discover] Total: ${advertisers.length} unique advertisers from ${queriesRun} queries across ${usedSources.join(",")}`, { service: "lead-sourcing" });

  if (advertisers.length === 0) {
    return { companies: [], queriesRun, totalAdsFound: 0, sourcesUsed: usedSources };
  }

  const uniqueNames = [...new Set(advertisers.map((a) => a.pageName).filter(Boolean))];
  const companies = await resolveCompanies({ names: uniqueNames, advertisers });
  const scored = scoreOohBatch(companies);

  return { companies: scored, queriesRun, totalAdsFound: advertisers.length, sourcesUsed: usedSources };
}
