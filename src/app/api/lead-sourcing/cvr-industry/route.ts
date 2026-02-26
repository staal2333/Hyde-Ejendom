// ============================================================
// POST /api/lead-sourcing/cvr-industry
// Search Danish companies by industry keywords via cvrapi.dk
// Returns companies ready to be saved as leads.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { getProffFinancials } from "@/lib/lead-sourcing/proff";

const CVR_API_BASE = "https://cvrapi.dk/api";
const USER_AGENT = "EjendomAI-LeadSourcing/1.0 (+https://ejendom-ai.vercel.app)";

// Industry presets with Danish search terms for CVR search
export const INDUSTRY_PRESETS: Record<string, { label: string; keywords: string[] }> = {
  restaurant: {
    label: "Restaurant & Hotel",
    keywords: ["restaurant", "cafe", "bistro", "hotel", "kro", "pizzeria"],
  },
  retail: {
    label: "Detailhandel",
    keywords: ["butik", "shop", "handel", "tøj", "mode", "elektronik"],
  },
  dagligvarer: {
    label: "Dagligvarer & Supermarked",
    keywords: ["supermarked", "dagligvarer", "kolonial", "netto", "føtex"],
  },
  ejendom: {
    label: "Ejendomsmægler & Bolig",
    keywords: ["ejendomsmægler", "bolig", "mægler", "home", "realestate"],
  },
  bil: {
    label: "Bil & Transport",
    keywords: ["bilforhandler", "autohandler", "bilcenter", "transport", "logistik"],
  },
  fitness: {
    label: "Fitness & Sundhed",
    keywords: ["fitness", "gym", "træningscenter", "yoga", "wellness"],
  },
  bank: {
    label: "Bank & Forsikring",
    keywords: ["bank", "forsikring", "finans", "kredit", "pension"],
  },
  reklame: {
    label: "Reklame & Marketing",
    keywords: ["reklame", "marketing", "bureau", "kommunikation", "pr"],
  },
  byg: {
    label: "Byggeri & Håndværk",
    keywords: ["byggeri", "entreprenør", "håndværker", "maler", "tømrer", "vvs"],
  },
  tech: {
    label: "IT & Teknologi",
    keywords: ["it", "software", "digital", "tech", "data", "cloud"],
  },
};

interface CvrApiResult {
  vat?: number;
  name?: string;
  address?: string;
  zipcode?: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
  industrycode?: number;
  industrydesc?: string;
  employees?: string;
  companydesc?: string;
  startdate?: string;
  status?: string;
}

async function searchCvrByKeyword(keyword: string, city?: string): Promise<CvrApiResult[]> {
  const query = city ? `${keyword} ${city}` : keyword;
  const url = `${CVR_API_BASE}?search=${encodeURIComponent(query)}&country=dk&maxresults=20`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();

    // cvrapi returns either a single object or an array
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && data.vat) return [data];
    if (data && typeof data === "object" && data.results) return data.results;
    return [];
  } catch {
    return [];
  }
}

function computeOohScore(company: CvrApiResult, platforms: string[] = []): number {
  let score = 30; // base

  // Ad platform activity
  score += platforms.length * 10;

  // Company size hints
  const emp = company.employees || "";
  if (emp.includes("50-") || emp.includes("100-") || emp.includes("200-")) score += 20;
  else if (emp.includes("10-") || emp.includes("20-")) score += 10;

  // Industry bonuses
  const desc = (company.industrydesc || "").toLowerCase();
  if (desc.includes("detail") || desc.includes("restaurant") || desc.includes("hotel")) score += 15;
  if (desc.includes("reklame") || desc.includes("marketing") || desc.includes("ejendom")) score += 10;

  return Math.min(score, 100);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      industry?: string;
      keywords?: string[];
      city?: string;
      limit?: number;
      enrichFinancials?: boolean;
    };

    const { industry, keywords, city, limit = 30, enrichFinancials = false } = body;

    // Resolve keywords from preset or custom
    let searchKeywords: string[] = [];
    if (industry && INDUSTRY_PRESETS[industry]) {
      searchKeywords = INDUSTRY_PRESETS[industry].keywords.slice(0, 3);
    } else if (keywords && keywords.length > 0) {
      searchKeywords = keywords.slice(0, 3);
    } else {
      return apiError(400, "Provide 'industry' preset or 'keywords' array");
    }

    logger.info(`[cvr-industry] Searching: ${searchKeywords.join(", ")} in ${city || "Denmark"}`, { service: "lead-sourcing" });

    // Search in parallel across keywords
    const rawResults = await Promise.all(
      searchKeywords.map(kw => searchCvrByKeyword(kw, city))
    );

    // Deduplicate by CVR
    const seen = new Set<string>();
    const all: CvrApiResult[] = [];
    for (const results of rawResults) {
      for (const r of results) {
        const key = String(r.vat || "").padStart(8, "0");
        if (!key || key === "00000000" || seen.has(key)) continue;
        if (r.status && r.status !== "normal" && r.status !== "Normal" && r.status !== "NORMAL") continue;
        seen.add(key);
        all.push(r);
      }
    }

    const sliced = all.slice(0, limit);

    // Optionally fetch Proff financials in parallel
    const withFinancials = await Promise.all(
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

        const oohScore = computeOohScore(c);

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
          sourcePlatform: "cvr_search",
          pageCategory: c.industrydesc || null,
          pageLikes: null,
          adCount: 0,
          platforms: [],
          oohScore,
          oohReason: `CVR-søgning: ${c.industrydesc || "Branchesøgning"}${city ? ` i ${city}` : ""}`,
        };
      })
    );

    logger.info(`[cvr-industry] Found ${withFinancials.length} companies`, { service: "lead-sourcing" });

    return NextResponse.json({
      ok: true,
      companies: withFinancials,
      total: withFinancials.length,
      searchedKeywords: searchKeywords,
      city: city || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    logger.error(`[cvr-industry] Error: ${msg}`, { service: "lead-sourcing" });
    return apiError(500, msg);
  }
}

// GET returns available industry presets
export async function GET() {
  return NextResponse.json({
    presets: Object.entries(INDUSTRY_PRESETS).map(([key, val]) => ({
      key,
      label: val.label,
      keywords: val.keywords,
    })),
  });
}
