// ============================================================
// POST /api/lead-sourcing/places-search
// Find Danish businesses near a specific OOH location / address.
// Uses CVR postal code search + geocoding via DAWA (free Danish API).
// No external API key required.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { getProffFinancials } from "@/lib/lead-sourcing/proff";

const CVR_API_BASE = "https://cvrapi.dk/api";
const DAWA_API = "https://api.dataforsyningen.dk";
const USER_AGENT = "EjendomAI-LeadSourcing/1.0 (+https://ejendom-ai.vercel.app)";

interface DawaAddress {
  vejnavn?: string;
  postnr?: string;
  postnrnavn?: string;
  adgangsadresseid?: string;
}

interface CvrResult {
  vat?: number;
  name?: string;
  address?: string;
  zipcode?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  industrydesc?: string;
  employees?: string;
  status?: string;
}

// Geocode a Danish address to get postal code via DAWA
async function geocodeToDanishPostal(address: string): Promise<{ postalCode: string; city: string; street?: string } | null> {
  try {
    const res = await fetch(
      `${DAWA_API}/adresser?q=${encodeURIComponent(address)}&per_side=1&struktur=flad`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as DawaAddress[];
    if (!data || data.length === 0) return null;
    const first = data[0];
    return {
      postalCode: first.postnr || "",
      city: first.postnrnavn || "",
      street: first.vejnavn,
    };
  } catch {
    return null;
  }
}

// Get nearby postal codes (same + adjacent)
async function getNearbyPostalCodes(postalCode: string): Promise<string[]> {
  const base = parseInt(postalCode, 10);
  if (isNaN(base)) return [postalCode];
  // Return the main postal code + adjacent ones (±200 range for Danish postal codes)
  const codes = [postalCode];
  for (const delta of [-200, -100, 100, 200]) {
    const adj = String(base + delta).padStart(4, "0");
    if (adj.length === 4) codes.push(adj);
  }
  return [...new Set(codes)];
}

async function searchCvrByPostal(postalCode: string, industryFilter?: string): Promise<CvrResult[]> {
  const query = industryFilter ? `${industryFilter} ${postalCode}` : postalCode;
  const url = `${CVR_API_BASE}?search=${encodeURIComponent(query)}&country=dk&maxresults=20`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data?.vat) return [data];
    return [];
  } catch {
    return [];
  }
}

function scoreForOoh(c: CvrResult): number {
  let score = 35;
  const desc = (c.industrydesc || "").toLowerCase();
  if (desc.includes("detail") || desc.includes("restaurant") || desc.includes("hotel") || desc.includes("cafe")) score += 20;
  if (desc.includes("fitness") || desc.includes("klinik") || desc.includes("skole")) score += 10;
  if (desc.includes("bank") || desc.includes("forsikring") || desc.includes("telecom")) score += 15;
  const emp = c.employees || "";
  if (emp.includes("50-") || emp.includes("100-")) score += 15;
  else if (emp.includes("10-") || emp.includes("20-")) score += 7;
  return Math.min(score, 100);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      address: string;
      industryFilter?: string;
      limit?: number;
      enrichFinancials?: boolean;
    };

    const { address, industryFilter, limit = 40, enrichFinancials = false } = body;

    if (!address || address.trim().length < 4) {
      return apiError(400, "Provide a valid Danish address");
    }

    // Step 1: Geocode address to postal code
    logger.info(`[places-search] Geocoding: "${address}"`, { service: "lead-sourcing" });
    const geo = await geocodeToDanishPostal(address.trim());

    if (!geo || !geo.postalCode) {
      return apiError(404, `Kunne ikke finde postnummer for "${address}". Prøv en mere specifik adresse.`);
    }

    logger.info(`[places-search] Postal code: ${geo.postalCode} ${geo.city}`, { service: "lead-sourcing" });

    // Step 2: Get nearby postal codes
    const postalCodes = await getNearbyPostalCodes(geo.postalCode);

    // Step 3: Search CVR in each postal code area
    const rawResults = await Promise.all(
      postalCodes.slice(0, 3).map(pc => searchCvrByPostal(pc, industryFilter))
    );

    // Deduplicate
    const seen = new Set<string>();
    const all: CvrResult[] = [];
    for (const results of rawResults) {
      for (const r of results) {
        const key = String(r.vat || "").padStart(8, "0");
        if (!key || key === "00000000" || seen.has(key)) continue;
        if (r.status && r.status !== "normal" && r.status !== "Normal" && r.status !== "NORMAL") continue;
        // City filter: only include if city roughly matches
        if (r.zipcode && geo.postalCode) {
          const diff = Math.abs(parseInt(r.zipcode, 10) - parseInt(geo.postalCode, 10));
          if (diff > 300) continue; // Too far away
        }
        seen.add(key);
        all.push(r);
      }
    }

    const sliced = all.slice(0, limit);

    const companies = await Promise.all(
      sliced.map(async (c) => {
        const cvr = String(c.vat || "").padStart(8, "0");
        let financials = { egenkapital: null as number | null, resultat: null as number | null, omsaetning: null as number | null };

        if (enrichFinancials && cvr !== "00000000") {
          try {
            const proff = await getProffFinancials(cvr);
            if (proff) financials = proff;
          } catch { /* skip */ }
        }

        const domain = c.website
          ? (() => { try { return new URL(c.website!.startsWith("http") ? c.website! : `https://${c.website!}`).hostname.replace(/^www\./, ""); } catch { return null; } })()
          : null;

        return {
          cvr,
          name: c.name || "Ukendt",
          address: [c.address, c.zipcode, c.city].filter(Boolean).join(", "),
          industry: c.industrydesc || null,
          website: c.website || null,
          domain,
          phone: c.phone || null,
          email: c.email || null,
          employees: c.employees || null,
          egenkapital: financials.egenkapital,
          resultat: financials.resultat,
          omsaetning: financials.omsaetning,
          inCrm: false,
          source: "cvr" as const,
          sourcePlatform: "places_search",
          pageCategory: c.industrydesc || null,
          pageLikes: null,
          adCount: 0,
          platforms: [],
          oohScore: scoreForOoh(c),
          oohReason: `Nærhed til "${address}" (${geo.postalCode} ${geo.city})`,
        };
      })
    );

    return NextResponse.json({
      ok: true,
      companies,
      total: companies.length,
      searchAddress: address,
      resolvedPostal: geo.postalCode,
      resolvedCity: geo.city,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error(`[places-search] Error: ${msg}`, { service: "lead-sourcing" });
    return apiError(500, msg);
  }
}
