// ============================================================
// Customer Monitor – scan HubSpot companies' ad activity across all platforms
// ============================================================

import { listHubSpotCompanies } from "@/lib/hubspot";
import { fetchMetaAdLibrary } from "./sources/meta-ad-library";
import { fetchTikTokAdLibrary } from "./sources/tiktok-ad-library";
import { fetchLinkedInAdLibrary } from "./sources/linkedin-ad-library";
import { fetchGoogleAdLibrary } from "./sources/google-ad-library";
import { type Advertiser } from "./sources/types";
import { logger } from "@/lib/logger";

export interface CustomerAdActivity {
  hubspotId: string;
  companyName: string;
  domain: string | null;
  advertising: boolean;
  platforms: string[];
  totalAdCount: number;
  matchedAdvertisers: {
    platform: string;
    pageName: string;
    adCount: number;
  }[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9æøå]/g, "").trim();
}

function fuzzyMatch(companyName: string, advertiserName: string): boolean {
  const normC = normalize(companyName);
  const normA = normalize(advertiserName);
  if (!normC || !normA) return false;
  if (normC === normA) return true;
  if (normC.includes(normA) || normA.includes(normC)) return true;
  if (normC.length > 4 && normA.length > 4) {
    const shorter = normC.length < normA.length ? normC : normA;
    const longer = normC.length < normA.length ? normA : normC;
    if (longer.includes(shorter.slice(0, Math.ceil(shorter.length * 0.8)))) return true;
  }
  return false;
}

export async function monitorCustomers(): Promise<CustomerAdActivity[]> {
  const companies = await listHubSpotCompanies();
  if (!companies.length) {
    logger.info("[customer-monitor] No HubSpot companies found", { service: "lead-sourcing" });
    return [];
  }

  logger.info(`[customer-monitor] Scanning ${companies.length} HubSpot companies across all ad platforms`, { service: "lead-sourcing" });

  const allAdvertisers: Advertiser[] = [];
  const platformFetchers = [
    { name: "meta", fn: () => fetchMetaAdLibrary({ limit: 100 }) },
    { name: "tiktok", fn: () => fetchTikTokAdLibrary({ limit: 100 }) },
    { name: "linkedin", fn: () => fetchLinkedInAdLibrary({ limit: 100 }) },
    { name: "google", fn: () => fetchGoogleAdLibrary({ limit: 100 }) },
  ];

  for (const { name, fn } of platformFetchers) {
    try {
      const ads = await fn();
      allAdvertisers.push(...ads);
      logger.info(`[customer-monitor] ${name}: ${ads.length} advertisers`, { service: "lead-sourcing" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`[customer-monitor] ${name} failed: ${msg}`, { service: "lead-sourcing" });
    }
    await new Promise(r => setTimeout(r, 300));
  }

  const results: CustomerAdActivity[] = companies.map(c => {
    const matched: CustomerAdActivity["matchedAdvertisers"] = [];

    for (const adv of allAdvertisers) {
      const nameMatch = fuzzyMatch(c.name, adv.pageName);
      const domainMatch = c.domain && adv.pageName.toLowerCase().includes(normalize(c.domain.replace(/\..+$/, "")));

      if (nameMatch || domainMatch) {
        matched.push({
          platform: adv.sourcePlatform,
          pageName: adv.pageName,
          adCount: adv.adCount,
        });
      }
    }

    return {
      hubspotId: c.id,
      companyName: c.name,
      domain: c.domain,
      advertising: matched.length > 0,
      platforms: [...new Set(matched.map(m => m.platform))],
      totalAdCount: matched.reduce((sum, m) => sum + m.adCount, 0),
      matchedAdvertisers: matched,
    };
  });

  const advertising = results.filter(r => r.advertising).length;
  logger.info(`[customer-monitor] Done: ${advertising}/${results.length} companies found advertising`, { service: "lead-sourcing" });

  return results;
}
