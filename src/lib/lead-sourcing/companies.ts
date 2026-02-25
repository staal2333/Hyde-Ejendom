// ============================================================
// Lead Sourcing – resolve companies (CVR + Proff + dedupe)
// ============================================================

import { lookupCvr } from "@/lib/research/cvr";
import { getProffFinancials, domainFromWebsite } from "./proff";
import { getBlocklist, isBlocked, isNameBlocked } from "./dedupe";
import { logger } from "@/lib/logger";
import type { Advertiser } from "./sources/types";

export interface LeadCompany {
  cvr: string;
  name: string;
  address: string;
  industry?: string;
  website?: string;
  domain: string | null;
  egenkapital: number | null;
  resultat: number | null;
  omsaetning: number | null;
  inCrm: boolean;
  source: "cvr" | "ad";
  sourcePlatform?: "meta" | "tiktok" | "linkedin" | "google";
  pageCategory: string | null;
  pageLikes: number | null;
  adCount: number;
  platforms: string[];
  oohScore: number;
  oohReason: string;
}

export interface ResolveCompaniesInput {
  cvrs?: string[];
  names?: string[];
  advertisers?: Advertiser[];
}

/**
 * Resolve companies by CVR (and optional names/advertisers), enrich with Proff,
 * and mark which are already in CRM.
 * Advertisers that can't be resolved to a CVR are kept with ad-only data.
 */
export async function resolveCompanies(input: ResolveCompaniesInput): Promise<LeadCompany[]> {
  const blocklist = await getBlocklist();
  const cvrs = [...new Set((input.cvrs || []).map((c) => String(c).trim().replace(/\D/g, "").slice(0, 8)).filter(Boolean))];
  const advertisers = input.advertisers || [];
  const names = input.names?.filter((n) => n?.trim()) || [];
  const advertiserMap = new Map<string, Advertiser>();
  for (const a of advertisers) {
    advertiserMap.set(a.pageName.toLowerCase(), a);
  }
  const results: LeadCompany[] = [];
  const resolvedPageIds = new Set<string>();

  // --- Direct CVR lookups ---
  for (const cvr of cvrs) {
    const cvrResult = await lookupCvr(cvr);
    if (!cvrResult) continue;
    if (results.some((r) => r.cvr === cvrResult.cvr)) continue;

    const website = cvrResult.website || (cvrResult.rawData as { companydomain?: string } | undefined)?.companydomain;
    const domain = domainFromWebsite(website) || null;
    const inCrm = (domain ? isBlocked(blocklist, domain) : false) || isNameBlocked(blocklist, cvrResult.companyName);

    let egenkapital: number | null = null;
    let resultat: number | null = null;
    let omsaetning: number | null = null;
    try {
      const proff = await getProffFinancials(cvrResult.cvr);
      if (proff) { egenkapital = proff.egenkapital; resultat = proff.resultat; omsaetning = proff.omsaetning; }
    } catch { /* ignore */ }

    results.push({
      cvr: cvrResult.cvr,
      name: cvrResult.companyName,
      address: cvrResult.address,
      industry: cvrResult.industry,
      website, domain, egenkapital, resultat, omsaetning, inCrm,
      source: "cvr",
      pageCategory: null, pageLikes: null, adCount: 0, platforms: [],
      oohScore: 0, oohReason: "",
    });
  }

  // --- Advertiser name resolution: try CVR, but keep even if no match ---
  for (const name of names) {
    const adInfo = advertiserMap.get(name.toLowerCase());
    const cvrResult = await lookupCvr(name);

    if (cvrResult && !results.some((r) => r.cvr === cvrResult.cvr)) {
      const website = cvrResult.website || (cvrResult.rawData as { companydomain?: string } | undefined)?.companydomain;
      const domain = domainFromWebsite(website) || null;
      const inCrm = (domain ? isBlocked(blocklist, domain) : false) || isNameBlocked(blocklist, cvrResult.companyName);

      let egenkapital: number | null = null;
      let resultat: number | null = null;
      let omsaetning: number | null = null;
      try {
        const proff = await getProffFinancials(cvrResult.cvr);
        if (proff) { egenkapital = proff.egenkapital; resultat = proff.resultat; omsaetning = proff.omsaetning; }
      } catch { /* ignore */ }

      if (adInfo) resolvedPageIds.add(adInfo.pageId);

      results.push({
        cvr: cvrResult.cvr,
        name: cvrResult.companyName,
        address: cvrResult.address,
        industry: cvrResult.industry,
        website, domain, egenkapital, resultat, omsaetning, inCrm,
        source: "cvr",
        sourcePlatform: adInfo?.sourcePlatform,
        pageCategory: adInfo?.pageCategory ?? null,
        pageLikes: adInfo?.pageLikes ?? null,
        adCount: adInfo?.adCount ?? 0,
        platforms: adInfo?.platforms ?? [],
        oohScore: 0, oohReason: "",
      });
      logger.info(`[resolve] CVR match for "${name}" → ${cvrResult.companyName} (${cvrResult.cvr})`, { service: "lead-sourcing" });
    } else if (adInfo && !resolvedPageIds.has(adInfo.pageId)) {
      resolvedPageIds.add(adInfo.pageId);
      const inCrm = isNameBlocked(blocklist, name);

      results.push({
        cvr: "",
        name: adInfo.pageName,
        address: "",
        industry: undefined,
        website: undefined,
        domain: null,
        egenkapital: null, resultat: null, omsaetning: null,
        inCrm,
        source: "ad",
        sourcePlatform: adInfo.sourcePlatform,
        pageCategory: adInfo.pageCategory,
        pageLikes: adInfo.pageLikes,
        adCount: adInfo.adCount,
        platforms: adInfo.platforms,
        oohScore: 0, oohReason: "",
      });
      logger.info(`[resolve] No CVR for "${name}" — kept as ad-only lead`, { service: "lead-sourcing" });
    }
  }

  return results;
}
