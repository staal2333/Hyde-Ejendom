// ============================================================
// Lead Sourcing – blocklist from HubSpot Contacts (not Ejendomme)
// ============================================================

import { getContactBlocklist } from "@/lib/hubspot";

export interface Blocklist {
  domains: Set<string>;
  companyIds: Set<string>;
}

let cached: { blocklist: Blocklist; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000; // 5 min

/**
 * Get blocklist of domains and company IDs from HubSpot Contacts.
 * Used to exclude leads we already have in CRM.
 */
export async function getBlocklist(): Promise<Blocklist> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.blocklist;
  const { domains, companyIds } = await getContactBlocklist();
  const blocklist: Blocklist = {
    domains: new Set(domains.map((d) => d.toLowerCase())),
    companyIds: new Set(companyIds),
  };
  cached = { blocklist, at: Date.now() };
  return blocklist;
}

/**
 * Check if a company (by domain or website) is already in CRM.
 */
export function isBlocked(blocklist: Blocklist, domainOrWebsite: string | undefined): boolean {
  if (!domainOrWebsite) return false;
  const domain = domainOrWebsite.toLowerCase().replace(/^www\./, "").split("/")[0];
  return blocklist.domains.has(domain);
}

export function clearBlocklistCache(): void {
  cached = null;
}
