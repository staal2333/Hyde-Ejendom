// ============================================================
// CVR API – Danish Central Business Register
// Gratis API via cvrapi.dk + STRICT name + address scoring
// Zero tolerance: no guessed matches, only proven ones.
// ============================================================

import { config } from "../config";
import { logger } from "../logger";
import { scoreCvrMatch, CVR_MATCH_THRESHOLD, type CvrCandidate } from "./validator";
import type { CvrResult } from "@/types";

/**
 * Options for CVR lookup behavior.
 */
export interface CvrLookupOptions {
  /** Validate address matches expected property location */
  expectedAddress?: { address?: string; postalCode?: string; city?: string };
  /** Require strict company name match (for OIS-sourced names) */
  strictNameMatch?: boolean;
  /** The exact name we searched for (for name comparison) */
  searchedName?: string;
  /** Kommune from OIS (used for geo-validation) */
  expectedKommune?: string;
  /** If true, return the match score and reasons alongside the result */
  returnScore?: boolean;
}

export interface CvrLookupResultWithScore {
  result: CvrResult | null;
  score: number;
  reasons: string[];
  discardReason?: string;
}

/**
 * Look up a company in CVR by name or CVR number.
 * Now with HARD scoring: results below CVR_MATCH_THRESHOLD are discarded.
 */
export async function lookupCvr(
  query: string,
  expectedAddressOrOptions?: { address?: string; postalCode?: string; city?: string } | CvrLookupOptions
): Promise<CvrResult | null> {
  const scored = await lookupCvrScored(query, expectedAddressOrOptions);
  return scored.result;
}

/**
 * Scored CVR lookup – returns result + match score + reasons.
 * Use this when you need to compare multiple candidates.
 */
export async function lookupCvrScored(
  query: string,
  expectedAddressOrOptions?: { address?: string; postalCode?: string; city?: string } | CvrLookupOptions
): Promise<CvrLookupResultWithScore> {
  // Normalize options
  const opts: CvrLookupOptions = expectedAddressOrOptions
    ? ("strictNameMatch" in expectedAddressOrOptions || "searchedName" in expectedAddressOrOptions || "expectedKommune" in expectedAddressOrOptions)
      ? expectedAddressOrOptions as CvrLookupOptions
      : { expectedAddress: expectedAddressOrOptions as { address?: string; postalCode?: string; city?: string } }
    : {};

  try {
    const isCvrNumber = /^\d{8}$/.test(query.trim());

    const params = new URLSearchParams({
      country: "dk",
      ...(isCvrNumber ? { vat: query.trim() } : { name: query.trim() }),
    });

    const url = `${config.cvr.apiUrl}?${params}`;

    const response = await fetch(url, {
      headers: { "User-Agent": config.cvr.userAgent },
    });

    if (!response.ok) {
      logger.warn(`CVR API returned ${response.status} for query: ${query}`, { service: "cvr" });
      return { result: null, score: 0, reasons: [`HTTP ${response.status}`] };
    }

    const data = await response.json();
    if (!data || data.error) return { result: null, score: 0, reasons: ["API returned error or empty"] };

    const result: CvrResult = {
      cvr: data.vat?.toString() || "",
      companyName: data.name || "",
      address: [data.address, data.zipcode, data.city].filter(Boolean).join(", "),
      status: data.status || "ukendt",
      type: data.companydesc || "",
      owners: data.owners ? data.owners.map((o: { name: string }) => o.name) : [],
      industry: data.industrydesc || undefined,
      employees: data.employees ? `${data.employees} ansatte` : undefined,
      email: data.email || undefined,
      phone: data.phone ? String(data.phone) : undefined,
      website: data.companydomain || undefined,
      rawData: data,
    };

    // ── For CVR number lookups, skip scoring (direct lookup) ──
    if (isCvrNumber) {
      return { result, score: 100, reasons: ["Direct CVR number lookup"] };
    }

    // ── STRICT NAME MATCHING ──
    const searchName = (opts.searchedName || query).trim();
    const nameMatch = companyNamesMatch(searchName, result.companyName);

    if (opts.strictNameMatch && !nameMatch) {
      const msg = `CVR name mismatch: searched "${searchName}" but got "${result.companyName}" – DISCARDED`;
      logger.warn(msg, { service: "cvr" });
      return { result: null, score: 0, reasons: [msg], discardReason: msg };
    }

    // ── SCORE-BASED VALIDATION ──
    // Always score the match, even if no expected address
    const propAddress = opts.expectedAddress?.address || "";
    const propPostal = opts.expectedAddress?.postalCode || "";
    const { score, reasons } = scoreCvrMatch(
      result.companyName,
      result.address,
      searchName,
      propAddress,
      propPostal,
      opts.expectedKommune
    );

    // If we have expected address info and score is below threshold → discard
    if (opts.expectedAddress && score < CVR_MATCH_THRESHOLD) {
      const msg = `CVR "${result.companyName}" scored ${score}/${CVR_MATCH_THRESHOLD} for "${searchName}" at ${propAddress} – DISCARDED`;
      logger.warn(msg, { service: "cvr", metadata: { score, reasons } });
      return { result: null, score, reasons, discardReason: msg };
    }

    // Tag the result with match metadata
    if (result.rawData) {
      (result.rawData as Record<string, unknown>)._matchScore = score;
      (result.rawData as Record<string, unknown>)._matchReasons = reasons;
      (result.rawData as Record<string, unknown>)._addressVerified = score >= 50;
    }

    logger.info(`CVR match: "${result.companyName}" scored ${score} for "${searchName}"`, {
      service: "cvr",
      metadata: { score, reasons },
    });

    return { result, score, reasons };
  } catch (error) {
    logger.error("CVR lookup failed", { service: "cvr", metadata: { error: String(error) } });
    return { result: null, score: 0, reasons: [String(error)] };
  }
}

/**
 * Check if two company names are essentially the same.
 * STRICTER than before: prevents "Krogh Ejendomme" matching "Krogh Invest"
 * when a property-related variant exists.
 */
export function companyNamesMatch(nameA: string, nameB: string): boolean {
  const normalize = (n: string) =>
    n.toLowerCase()
      .replace(/\s*(aps|a\/s|as|i\/s|k\/s|p\/s|smba|ivs)\s*/gi, " ")
      .replace(/[^a-zæøå0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  // Also strip company-type suffixes for a "core name"
  const coreNormalize = (n: string) =>
    n.toLowerCase()
      .replace(/\s*(aps|a\/s|as|holding|invest|ejendom|ejendomme|ejendomsselskab|i\/s|k\/s|p\/s|smba|ivs|kapital|fond|selskab)\s*/gi, " ")
      .replace(/[^a-zæøå0-9]/g, "")
      .trim();

  const a = normalize(nameA);
  const b = normalize(nameB);

  // Exact match after normalization
  if (a === b) return true;

  const coreA = coreNormalize(nameA);
  const coreB = coreNormalize(nameB);

  // Core names must match (prevents "Krogh Ejendomme" ≠ "Krogh Invest")
  if (coreA === coreB && coreA.length >= 3) return true;

  // Substring match ONLY if the shorter core is the complete core of the longer
  // (prevents partial matches like "Ank" matching "Ankeret")
  if (coreA.length >= 5 && coreB.length >= 5) {
    // The shorter must be at least 70% of the longer to be considered a substring match
    const shorter = coreA.length <= coreB.length ? coreA : coreB;
    const longer = coreA.length > coreB.length ? coreA : coreB;
    if (shorter.length / longer.length >= 0.7 && longer.includes(shorter)) return true;
  }

  // Character-by-character match: require 90%+ (stricter than before: was 85%)
  if (Math.abs(coreA.length - coreB.length) <= 2 && coreA.length > 5) {
    let matches = 0;
    const shorter = coreA.length <= coreB.length ? coreA : coreB;
    const longer = coreA.length > coreB.length ? coreA : coreB;
    for (let i = 0; i < shorter.length; i++) {
      if (shorter[i] === longer[i]) matches++;
    }
    if (matches / longer.length >= 0.90) return true;
  }

  return false;
}

/**
 * Look up a company on proff.dk by name (web scraping fallback).
 * Returns CVR number, address, and director info.
 */
export async function lookupProff(companyName: string): Promise<CvrResult | null> {
  try {
    const searchUrl = `https://www.proff.dk/bransjes%C3%B8k?q=${encodeURIComponent(companyName)}`;

    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Try to find a matching company in the results
    const normalizedSearch = companyName.toLowerCase().replace(/[^a-zæøå0-9]/g, "");

    // Extract CVR numbers from the page
    const cvrMatches = html.match(/CVR[:\s-]*(\d{8})/gi) || [];
    const cvrNumbers: string[] = cvrMatches.map(m => {
      const num = m.match(/(\d{8})/);
      return num ? num[1] : "";
    }).filter(Boolean);

    // Extract company names near CVR numbers
    // Look for the company name we're searching for
    const nameRegex = new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const hasMatch = nameRegex.test(html);

    if (hasMatch && cvrNumbers.length > 0) {
      // Found our company on proff.dk – now look up via CVR number
      const cvrNumber = cvrNumbers[0];
      console.log(`Proff.dk: Found CVR ${cvrNumber} for "${companyName}"`);
      return await lookupCvr(cvrNumber);
    }

    // Try to find company link and extract CVR from detail page
    const linkMatch = html.match(new RegExp(
      `href="(/roller/[^"]*?)"[^>]*>[^<]*${companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i"
    ));

    if (linkMatch) {
      const detailUrl = `https://www.proff.dk${linkMatch[1]}`;
      const detailResp = await fetch(detailUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (detailResp.ok) {
        const detailHtml = await detailResp.text();
        const cvrMatch = detailHtml.match(/CVR[:\s-]*nr[:\s]*(\d{8})/i) || detailHtml.match(/(\d{8})/);
        if (cvrMatch) {
          console.log(`Proff.dk detail: Found CVR ${cvrMatch[1]} for "${companyName}"`);
          return await lookupCvr(cvrMatch[1]);
        }
      }
    }

    return null;
  } catch (error) {
    console.warn("Proff.dk lookup failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Search CVR by address to find companies registered there.
 * Uses scored lookup and picks the best match above threshold.
 */
export async function lookupCvrByAddress(
  address: string,
  city: string,
  postalCode?: string
): Promise<CvrResult | null> {
  const streetName = address.replace(/\s*\d+.*$/, "").trim();
  if (!streetName) return null;

  // Try searching for common property association patterns
  const patterns = [
    `A/B ${address}`,              // Andelsboligforening at exact address
    `E/F ${address}`,              // Ejerforening at exact address
    `${streetName} ejerforening`,  // Ejerforening for the street
    `${streetName} andelsbolig`,   // Andelsbolig for the street
  ];

  const opts: CvrLookupOptions = {
    expectedAddress: { address, city, postalCode },
    strictNameMatch: false,
    searchedName: address,
  };

  let bestCandidate: CvrLookupResultWithScore | null = null;

  for (const pattern of patterns) {
    const scored = await lookupCvrScored(pattern, opts);
    if (scored.result && (!bestCandidate || scored.score > bestCandidate.score)) {
      bestCandidate = scored;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  if (bestCandidate && bestCandidate.score >= CVR_MATCH_THRESHOLD) {
    logger.info(`CVR address search: best match "${bestCandidate.result?.companyName}" score ${bestCandidate.score}`, {
      service: "cvr",
      metadata: { reasons: bestCandidate.reasons },
    });
    return bestCandidate.result;
  }

  return null;
}

/**
 * Look up multiple CVR candidates for the same OIS owner name.
 * Returns the BEST match above threshold, or null if ambiguous.
 */
export async function lookupCvrBestMatch(
  ownerName: string,
  propertyAddress: string,
  propertyPostalCode: string,
  propertyKommune?: string
): Promise<CvrLookupResultWithScore> {
  // Search CVR API
  const scored = await lookupCvrScored(ownerName, {
    strictNameMatch: true,
    searchedName: ownerName,
    expectedAddress: { address: propertyAddress, postalCode: propertyPostalCode },
    expectedKommune: propertyKommune,
  });

  return scored;
}
