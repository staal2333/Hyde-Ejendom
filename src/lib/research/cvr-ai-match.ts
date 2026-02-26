// ============================================================
// CVR AI Matcher – find the right CVR for an ad-library lead
//
// Core problem: ad platforms use brand names ("Café Noir") but
// CVR has legal names ("Black Coffee Catering ApS").
//
// Strategy:
//   1. Domain lookup via cvrapi.dk (most reliable – direct match)
//   2. Google search via SearchAPI.io for "<brand> CVR site:proff.dk"
//      → extracts 8-digit CVR numbers from URLs and snippets
//   3. cvrapi.dk name search with smart variations
//   4. LLM picks best candidate
// ============================================================

import OpenAI from "openai";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { withRetry } from "./web-scraper";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: config.openai.apiKey() });
  return _openai;
}

export interface CvrCandidate {
  cvr: string;
  name: string;
  address: string;
  industry?: string;
  type?: string;
  website?: string;
  phone?: string;
  email?: string;
  status?: string;
}

// ── Fetch full company data from cvrapi.dk by CVR number ─────────────────
async function fetchCvrByNumber(cvr: string): Promise<CvrCandidate | null> {
  try {
    const params = new URLSearchParams({ country: "dk", vat: cvr.trim() });
    return await withRetry(async () => {
      const res = await fetch(`${config.cvr.apiUrl}?${params}`, {
        headers: { "User-Agent": config.cvr.userAgent },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`CVR API error ${res.status}`);
      const d = await res.json();
      if (!d || d.error || !d.vat) return null;
      return mapCvrResponse(d);
    }, 3, 600);
  } catch {
    return null;
  }
}

// ── Fetch company data from cvrapi.dk by company name ────────────────────
async function fetchCvrByName(name: string): Promise<CvrCandidate | null> {
  try {
    const params = new URLSearchParams({ country: "dk", name: name.trim() });
    return await withRetry(async () => {
      const res = await fetch(`${config.cvr.apiUrl}?${params}`, {
        headers: { "User-Agent": config.cvr.userAgent },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`CVR API error ${res.status}`);
      const d = await res.json();
      if (!d || d.error || !d.vat) return null;
      return mapCvrResponse(d);
    }, 3, 600);
  } catch {
    return null;
  }
}

// ── Fetch company data from cvrapi.dk by domain ──────────────────────────
async function fetchCvrByDomain(domain: string): Promise<CvrCandidate | null> {
  try {
    const cleanDomain = domain.replace(/^www\./, "").toLowerCase().trim();
    const params = new URLSearchParams({ country: "dk", domain: cleanDomain });
    return await withRetry(async () => {
      const res = await fetch(`${config.cvr.apiUrl}?${params}`, {
        headers: { "User-Agent": config.cvr.userAgent },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`CVR API error ${res.status}`);
      const d = await res.json();
      if (!d || d.error || !d.vat) return null;
      return mapCvrResponse(d);
    }, 3, 600);
  } catch {
    return null;
  }
}

function mapCvrResponse(d: Record<string, unknown>): CvrCandidate {
  return {
    cvr: String(d.vat),
    name: String(d.name || ""),
    address: [d.address, d.zipcode, d.city].filter(Boolean).join(", "),
    industry: d.industrydesc ? String(d.industrydesc) : undefined,
    type: d.companydesc ? String(d.companydesc) : undefined,
    website: d.companydomain ? String(d.companydomain) : undefined,
    phone: d.phone ? String(d.phone) : undefined,
    email: d.email ? String(d.email) : undefined,
    status: d.status ? String(d.status) : undefined,
  };
}

// ── Extract 8-digit Danish CVR numbers from any text/URL ─────────────────
function extractCvrNumbers(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  // Patterns that match 8-digit CVR numbers in various contexts
  const patterns = [
    /CVR[:\s.-]*(\d{8})/gi,           // "CVR: 12345678" or "CVR-nr. 12345678"
    /vat[=:\s](\d{8})/gi,             // "vat=12345678"
    /[-/](\d{8})(?:[/?#"'\s&]|$)/g,  // end of URL segment: /company-name-12345678
    /\b(1\d{7}|2\d{7}|3\d{7})\b/g,  // raw 8-digit in Danish CVR range 10M-39M
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const num = m[1];
      const n = parseInt(num, 10);
      if (num && !seen.has(num) && n >= 10000000 && n <= 99999999) {
        seen.add(num);
        found.push(num);
      }
    }
  }
  return found;
}

// ── Google search via SearchAPI.io → extract CVR numbers ─────────────────
async function searchForCvrNumbers(brandName: string): Promise<string[]> {
  const apiKey = process.env.SEARCHAPI_API_KEY || "";
  if (!apiKey) {
    logger.warn("[cvr-ai-match] SEARCHAPI_API_KEY not set, skipping Google search", { service: "cvr" });
    return [];
  }

  const cvrNumbers: string[] = [];
  const seen = new Set<string>();
  const addCvr = (num: string) => { if (!seen.has(num)) { seen.add(num); cvrNumbers.push(num); } };

  // Two queries: one on Proff.dk (URLs contain CVR), one general
  const queries = [
    `"${brandName}" site:proff.dk`,
    `"${brandName}" CVR Danmark virksomhed`,
  ];

  for (const q of queries) {
    try {
      const params = new URLSearchParams({
        engine: "google",
        q,
        gl: "dk",
        hl: "da",
        num: "6",
        api_key: apiKey,
      });

      const res = await fetch(`https://www.searchapi.io/api/v1/search?${params}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;

      // Extract from organic results
      const organic = Array.isArray(data.organic_results) ? data.organic_results as Record<string, unknown>[] : [];
      for (const r of organic) {
        const text = [r.link, r.snippet, r.title].filter(Boolean).join(" ");
        extractCvrNumbers(String(text)).forEach(addCvr);
      }

      // Also check knowledge graph if present
      if (data.knowledge_graph && typeof data.knowledge_graph === "object") {
        const kg = data.knowledge_graph as Record<string, unknown>;
        const kgText = JSON.stringify(kg);
        extractCvrNumbers(kgText).forEach(addCvr);
      }

      if (cvrNumbers.length >= 4) break; // enough candidates
    } catch (e) {
      logger.warn(`[cvr-ai-match] SearchAPI query "${q}" failed: ${e instanceof Error ? e.message : String(e)}`, { service: "cvr" });
    }
  }

  logger.info(`[cvr-ai-match] Google search found CVR numbers: [${cvrNumbers.join(", ")}] for "${brandName}"`, { service: "cvr" });
  return cvrNumbers.slice(0, 5);
}

// ── Generate focused name variations for cvrapi.dk search ────────────────
function nameVariations(brandName: string): string[] {
  const name = brandName.trim();
  const words = name.split(/\s+/).filter(Boolean);
  const seen = new Set<string>([name]);
  const variations: string[] = [name];

  const add = (v: string) => {
    const trimmed = v.trim();
    if (trimmed.length >= 3 && !seen.has(trimmed)) {
      seen.add(trimmed);
      variations.push(trimmed);
    }
  };

  // Strip category prefixes ("Café X" → "X", "Restaurant X" → "X")
  const prefixStripped = name.replace(/^(café|cafe|restaurant|hotel|bar|klinik|salon|studio|fitness|gym|apotek|optiker|tandlæge)\s+/i, "");
  add(prefixStripped);

  // First two words only
  if (words.length >= 3) add(words.slice(0, 2).join(" "));

  // ASCII normalization of Danish chars
  const ascii = name
    .replace(/[æÆ]/g, "ae").replace(/[øØ]/g, "oe").replace(/[åÅ]/g, "aa")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  add(ascii);

  return variations.slice(0, 4);
}

// ── LLM picks the best candidate ─────────────────────────────────────────
async function aiPickCandidate(
  brandName: string,
  candidates: CvrCandidate[],
  context: { industry?: string | null; domain?: string | null; address?: string | null }
): Promise<CvrCandidate | null> {
  if (candidates.length === 0) return null;

  // Single candidate: quick name overlap check before calling LLM
  if (candidates.length === 1) {
    const c = candidates[0];
    const b = brandName.toLowerCase().replace(/[^a-zæøå0-9]/g, "");
    const n = c.name.toLowerCase().replace(/[^a-zæøå0-9]/g, "");
    const shorter = b.length <= n.length ? b : n;
    const longer = b.length > n.length ? b : n;
    if (shorter.length >= 4 && longer.includes(shorter)) {
      logger.info(`[cvr-ai-match] Single candidate name overlap accepted: "${c.name}"`, { service: "cvr" });
      return c;
    }
    // Fall through to LLM for uncertain single candidates
  }

  const client = getOpenAI();

  const candidateList = candidates.map((c, i) =>
    `${i + 1}. CVR: ${c.cvr} | Juridisk navn: "${c.name}" | ${c.address || "Ingen adresse"} | Branche: ${c.industry || "?"} | Type: ${c.type || "?"} | Hjemmeside: ${c.website || "?"}`
  ).join("\n");

  const prompt = `Opgave: Match brand-navn med juridisk CVR-firmanavn.

Brand-navn (fra annonce/sociale medier): "${brandName}"
Kontekst — Branche: ${context.industry || "Ukendt"} | Domæne: ${context.domain || "Ukendt"} | By: ${context.address || "Ukendt"}

Kandidater fra CVR-registret:
${candidateList}

Regler:
- Brand-navne ≠ juridiske navne. "JYSK" = "JYSK A/S". "Netto" = "Salling Group A/S".
- Vælg kandidaten med størst sandsynlighed for at være den rigtige (min. 40% sikkerhed)
- Kig på: navnelighed, branche-match, hjemmeside-match
- Svar KUN med tallet (1, 2, 3 ...) ELLER "ingen" hvis ingen er sandsynlig

Svar:`;

  try {
    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 10,
    });

    const answer = (response.choices[0]?.message?.content?.trim() || "ingen").toLowerCase();
    if (answer.includes("ingen")) return null;

    const num = parseInt(answer.replace(/\D/g, ""), 10);
    if (!isNaN(num) && num >= 1 && num <= candidates.length) {
      return candidates[num - 1];
    }
    return null;
  } catch (e) {
    logger.warn(`[cvr-ai-match] LLM pick failed: ${e instanceof Error ? e.message : String(e)}`, { service: "cvr" });
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────

export async function findCvrForLead(params: {
  brandName: string;
  industry?: string | null;
  domain?: string | null;
  address?: string | null;
}): Promise<CvrCandidate | null> {
  const { brandName, industry, domain, address } = params;

  logger.info(`[cvr-ai-match] Searching for "${brandName}" (domain=${domain || "none"})`, { service: "cvr" });

  const seenCvr = new Map<string, CvrCandidate>();
  const add = (c: CvrCandidate | null) => { if (c && !seenCvr.has(c.cvr)) seenCvr.set(c.cvr, c); };

  // ── Step 1: Domain lookup (highest confidence) ─────────────────────────
  if (domain) {
    const domainResult = await fetchCvrByDomain(domain);
    if (domainResult) {
      logger.info(`[cvr-ai-match] Domain match: "${domainResult.name}" (CVR ${domainResult.cvr})`, { service: "cvr" });
      add(domainResult);
    }
  }

  // If domain gave us a result we're already fairly confident — return it
  if (seenCvr.size === 1) {
    const only = [...seenCvr.values()][0];
    logger.info(`[cvr-ai-match] Domain-only match returned: "${only.name}" (CVR ${only.cvr})`, { service: "cvr" });
    return only;
  }

  // ── Step 2: Google search via SearchAPI.io → extract CVR numbers ───────
  const googleCvrs = await searchForCvrNumbers(brandName);
  if (googleCvrs.length > 0) {
    const fetched = await Promise.all(googleCvrs.map(fetchCvrByNumber));
    fetched.forEach(add);
  }

  // ── Step 3: cvrapi.dk name search with variations ──────────────────────
  const variations = nameVariations(brandName);
  const nameFetched = await Promise.all(variations.map(fetchCvrByName));
  nameFetched.forEach(add);

  const candidates = [...seenCvr.values()];
  logger.info(
    `[cvr-ai-match] ${candidates.length} candidates for "${brandName}": ${candidates.map(c => `"${c.name}"(${c.cvr})`).join(", ")}`,
    { service: "cvr" }
  );

  if (candidates.length === 0) return null;

  // ── Step 4: LLM picks the best ────────────────────────────────────────
  const best = await aiPickCandidate(brandName, candidates, { industry, domain, address });

  if (best) {
    logger.info(`[cvr-ai-match] ✓ Matched "${brandName}" → "${best.name}" (CVR ${best.cvr})`, { service: "cvr" });
  } else {
    logger.info(`[cvr-ai-match] ✗ No match for "${brandName}" among ${candidates.length} candidates`, { service: "cvr" });
  }

  return best;
}
