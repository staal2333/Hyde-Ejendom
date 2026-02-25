// ============================================================
// CRM Matcher – cross-reference HubSpot companies with Meta Ad Library
// ============================================================

import { listHubSpotCompanies } from "@/lib/hubspot";
import { fetchMetaAdLibrary } from "./sources/meta-ad-library";

export interface CrmMatchResult {
  companyId: string;
  companyName: string;
  domain: string | null;
  isAdvertising: boolean;
  matchedPageName: string | null;
  matchedPageId: string | null;
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(aps|a\/s|as|i\/s|is|k\/s|ks|p\/s|ps|ivs|smba|amba|holding|group|denmark|danmark|inc|ltd|gmbh|co|company)\b/gi, "")
    .replace(/[^a-zæøå0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Token overlap: if >60% of tokens match
  const tokensA = na.split(" ").filter(t => t.length > 1);
  const tokensB = nb.split(" ").filter(t => t.length > 1);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  const overlap = tokensA.filter(t => tokensB.includes(t)).length;
  return overlap / Math.max(tokensA.length, tokensB.length) > 0.6;
}

/**
 * Check which HubSpot companies are actively advertising on Meta.
 * Fetches a broad set of advertisers from Meta and matches against CRM names.
 */
export async function matchCrmCompaniesOnMeta(
  searchTerms?: string,
  country = "DK"
): Promise<CrmMatchResult[]> {
  const companies = await listHubSpotCompanies();
  if (companies.length === 0) return [];

  // Fetch a large set of advertisers from Meta
  const advertisers = await fetchMetaAdLibrary({
    searchTerms: searchTerms || undefined,
    adReachedCountries: [country],
    limit: 200,
  });

  const results: CrmMatchResult[] = [];

  for (const company of companies) {
    let matched: { pageName: string; pageId: string } | null = null;

    for (const ad of advertisers) {
      if (fuzzyMatch(company.name, ad.pageName)) {
        matched = { pageName: ad.pageName, pageId: ad.pageId };
        break;
      }
      // Also try domain match if advertiser name contains the domain
      if (company.domain) {
        const domainBase = company.domain.replace(/^www\./, "").split(".")[0];
        if (domainBase.length > 3 && normalize(ad.pageName).includes(domainBase.toLowerCase())) {
          matched = { pageName: ad.pageName, pageId: ad.pageId };
          break;
        }
      }
    }

    results.push({
      companyId: company.id,
      companyName: company.name,
      domain: company.domain,
      isAdvertising: !!matched,
      matchedPageName: matched?.pageName ?? null,
      matchedPageId: matched?.pageId ?? null,
    });
  }

  // Sort: advertising companies first
  results.sort((a, b) => (b.isAdvertising ? 1 : 0) - (a.isAdvertising ? 1 : 0));

  return results;
}
