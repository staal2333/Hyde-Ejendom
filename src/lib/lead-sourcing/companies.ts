// ============================================================
// Lead Sourcing – resolve companies (CVR + Proff + dedupe)
// ============================================================

import { lookupCvr } from "@/lib/research/cvr";
import { getProffFinancials, domainFromWebsite } from "./proff";
import { getBlocklist, isBlocked } from "./dedupe";

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
  source: "cvr";
}

export interface ResolveCompaniesInput {
  cvrs?: string[];
  names?: string[]; // resolve by name (CVR lookup by name)
}

/**
 * Resolve companies by CVR (and optional names), enrich with Proff financials,
 * and mark which are already in CRM (contacts blocklist).
 */
export async function resolveCompanies(input: ResolveCompaniesInput): Promise<LeadCompany[]> {
  const blocklist = await getBlocklist();
  const cvrs = [...new Set((input.cvrs || []).map((c) => String(c).trim().replace(/\D/g, "").slice(0, 8)).filter(Boolean))];
  const names = input.names?.filter((n) => n?.trim()) || [];
  const results: LeadCompany[] = [];

  for (const cvr of cvrs) {
    const cvrResult = await lookupCvr(cvr);
    if (!cvrResult) continue;
    const website = cvrResult.website || (cvrResult.rawData as { companydomain?: string } | undefined)?.companydomain;
    const domain = domainFromWebsite(website) || null;
    const inCrm = domain ? isBlocked(blocklist, domain) : false;

    let egenkapital: number | null = null;
    let resultat: number | null = null;
    let omsaetning: number | null = null;
    try {
      const proff = await getProffFinancials(cvrResult.cvr);
      if (proff) {
        egenkapital = proff.egenkapital;
        resultat = proff.resultat;
        omsaetning = proff.omsaetning;
      }
    } catch {
      // ignore Proff errors
    }

    results.push({
      cvr: cvrResult.cvr,
      name: cvrResult.companyName,
      address: cvrResult.address,
      industry: cvrResult.industry,
      website,
      domain,
      egenkapital,
      resultat,
      omsaetning,
      inCrm,
      source: "cvr",
    });
  }

  for (const name of names) {
    if (cvrs.some((c) => results.some((r) => r.cvr === c))) continue; // avoid duplicate if name resolved to same CVR
    const cvrResult = await lookupCvr(name);
    if (!cvrResult) continue;
    if (results.some((r) => r.cvr === cvrResult.cvr)) continue;
    const website = cvrResult.website || (cvrResult.rawData as { companydomain?: string } | undefined)?.companydomain;
    const domain = domainFromWebsite(website) || null;
    const inCrm = domain ? isBlocked(blocklist, domain) : false;

    let egenkapital: number | null = null;
    let resultat: number | null = null;
    let omsaetning: number | null = null;
    try {
      const proff = await getProffFinancials(cvrResult.cvr);
      if (proff) {
        egenkapital = proff.egenkapital;
        resultat = proff.resultat;
        omsaetning = proff.omsaetning;
      }
    } catch {
      // ignore
    }

    results.push({
      cvr: cvrResult.cvr,
      name: cvrResult.companyName,
      address: cvrResult.address,
      industry: cvrResult.industry,
      website,
      domain,
      egenkapital,
      resultat,
      omsaetning,
      inCrm,
      source: "cvr",
    });
  }

  return results;
}
