// ============================================================
// Lead Sourcing – blocklist from HubSpot Contacts + Companies
// ============================================================

import { getContactBlocklist, listHubSpotCompanies } from "@/lib/hubspot";

export interface Blocklist {
  domains: Set<string>;
  companyIds: Set<string>;
  companyNames: Set<string>;
}

let cached: { blocklist: Blocklist; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(aps|a\/s|as|i\/s|is|ivs|p\/s|smba|k\/s|holding|group|dk|denmark|danmark)\b/g, "")
    .replace(/[^a-zæøå0-9]/g, "")
    .trim();
}

export async function getBlocklist(): Promise<Blocklist> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.blocklist;

  const [contactData, hubspotCompanies] = await Promise.all([
    getContactBlocklist(),
    listHubSpotCompanies().catch(() => [] as { id: string; name: string; domain: string | null }[]),
  ]);

  const domains = new Set(contactData.domains.map((d) => d.toLowerCase()));
  const companyIds = new Set(contactData.companyIds);
  const companyNames = new Set<string>();

  for (const hc of hubspotCompanies) {
    if (hc.domain) domains.add(hc.domain.toLowerCase().replace(/^www\./, ""));
    if (hc.name) companyNames.add(normalizeName(hc.name));
  }

  const blocklist: Blocklist = { domains, companyIds, companyNames };
  cached = { blocklist, at: Date.now() };
  return blocklist;
}

export function isBlocked(blocklist: Blocklist, domainOrWebsite: string | undefined): boolean {
  if (!domainOrWebsite) return false;
  const domain = domainOrWebsite.toLowerCase().replace(/^www\./, "").split("/")[0];
  return blocklist.domains.has(domain);
}

export function isNameBlocked(blocklist: Blocklist, name: string | undefined): boolean {
  if (!name) return false;
  return blocklist.companyNames.has(normalizeName(name));
}

export function clearBlocklistCache(): void {
  cached = null;
}
