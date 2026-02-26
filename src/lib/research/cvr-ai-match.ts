// ============================================================
// CVR AI Matcher – find the right CVR for an ad-library lead
//
// Core problem: ad platforms use brand names ("Café Noir") but
// CVR has legal names ("Black Coffee Catering ApS").
// cvrapi.dk only returns ONE result per search and only matches
// on exact legal name – useless for brand names.
//
// Strategy:
//   1. DuckDuckGo: search "<brand> site:proff.dk" + "<brand> CVR"
//      → Proff.dk URLs contain 8-digit CVR in the path
//      → CVR numbers appear in search snippets
//   2. cvrapi.dk: search with brand name + 2 key variations
//      (fewer parallel calls, more targeted)
//   3. Deduplicate all candidates (max 8)
//   4. LLM picks best match – or "ingen" if nothing fits
// ============================================================

import OpenAI from "openai";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { searchGoogle } from "@/lib/research/web-scraper";

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

// ── Lookup a single CVR number → full company data ────────────────────────
async function fetchCvrByNumber(cvr: string): Promise<CvrCandidate | null> {
  try {
    const params = new URLSearchParams({ country: "dk", vat: cvr.trim() });
    const res = await fetch(`${config.cvr.apiUrl}?${params}`, {
      headers: { "User-Agent": config.cvr.userAgent },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.error || !d.vat) return null;

    return {
      cvr: String(d.vat),
      name: String(d.name || ""),
      address: [d.address, d.zipcode, d.city].filter(Boolean).join(", "),
      industry: d.industrydesc || undefined,
      type: d.companydesc || undefined,
      website: d.companydomain || undefined,
      phone: d.phone ? String(d.phone) : undefined,
      email: d.email || undefined,
      status: d.status || undefined,
    };
  } catch {
    return null;
  }
}

// ── Lookup CVR by name in cvrapi.dk (returns best single match) ──────────
async function fetchCvrByName(name: string): Promise<CvrCandidate | null> {
  try {
    const params = new URLSearchParams({ country: "dk", name: name.trim() });
    const res = await fetch(`${config.cvr.apiUrl}?${params}`, {
      headers: { "User-Agent": config.cvr.userAgent },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.error || !d.vat) return null;

    return {
      cvr: String(d.vat),
      name: String(d.name || ""),
      address: [d.address, d.zipcode, d.city].filter(Boolean).join(", "),
      industry: d.industrydesc || undefined,
      type: d.companydesc || undefined,
      website: d.companydomain || undefined,
      phone: d.phone ? String(d.phone) : undefined,
      email: d.email || undefined,
      status: d.status || undefined,
    };
  } catch {
    return null;
  }
}

// ── Extract 8-digit CVR numbers from text/URLs ────────────────────────────
function extractCvrNumbers(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  // Match 8-digit numbers that look like CVR
  // Proff.dk URLs: /virksomhed/cafe-noir-aps-12345678
  // Proff.dk text: "CVR: 12345678" or "CVR-nr. 12345678"
  const patterns = [
    /(?:CVR|cvr)[:\s.-]*(\d{8})/gi,
    /[-\/](\d{8})(?:[\/\s"'&?#]|$)/g,  // 8-digit at end of URL segment
    /\b(1\d{7}|2\d{7}|3\d{7})\b/g,     // Danish CVR range: 10000000-39999999
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const num = m[1];
      // Basic sanity: Danish CVRs are 10000000-99999999
      if (num && !seen.has(num) && parseInt(num) >= 10000000 && parseInt(num) <= 99999999) {
        seen.add(num);
        found.push(num);
      }
    }
  }
  return found;
}

// ── Search DuckDuckGo for brand + Proff.dk / CVR ─────────────────────────
async function searchForCvrCandidates(brandName: string): Promise<string[]> {
  const cvrNumbers: string[] = [];
  const seen = new Set<string>();

  const addCvr = (num: string) => {
    if (!seen.has(num)) { seen.add(num); cvrNumbers.push(num); }
  };

  try {
    // Query 1: brand name on proff.dk – URLs contain CVR
    const q1 = `"${brandName}" site:proff.dk`;
    const results1 = await searchGoogle(q1, 6);
    for (const r of results1) {
      const nums = extractCvrNumbers(r.url + " " + r.snippet + " " + r.title);
      nums.forEach(addCvr);
    }

    // Query 2: brand name + CVR keyword – finds CVR in snippets
    if (cvrNumbers.length < 2) {
      const q2 = `"${brandName}" CVR Danmark`;
      const results2 = await searchGoogle(q2, 5);
      for (const r of results2) {
        const nums = extractCvrNumbers(r.url + " " + r.snippet);
        nums.forEach(addCvr);
      }
    }
  } catch (e) {
    logger.warn(`[cvr-ai-match] Search failed: ${e instanceof Error ? e.message : String(e)}`, { service: "cvr" });
  }

  return cvrNumbers.slice(0, 6);
}

// ── Build name variations for cvrapi.dk direct lookup ────────────────────
function nameVariations(brandName: string): string[] {
  const name = brandName.trim();
  const words = name.split(/\s+/).filter(Boolean);
  const variations = new Set<string>();

  variations.add(name);

  // First 2 words
  if (words.length >= 3) variations.add(words.slice(0, 2).join(" "));

  // Strip common business-type prefixes
  const stripped = name.replace(/^(café|cafe|restaurant|hotel|klinik|salon|studio|fitness|gym|apotek|optiker)\s+/i, "").trim();
  if (stripped !== name && stripped.length >= 3) variations.add(stripped);

  // ASCII normalization of Danish chars
  const ascii = name
    .replace(/[æÆ]/g, "ae").replace(/[øØ]/g, "oe").replace(/[åÅ]/g, "aa")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (ascii !== name) variations.add(ascii);

  // Only keep up to 3 variations – we're after quality, not quantity
  return [...variations].slice(0, 3);
}

// ── LLM picks the best candidate ─────────────────────────────────────────
async function aiPickCandidate(
  brandName: string,
  candidates: CvrCandidate[],
  context: { industry?: string | null; domain?: string | null; address?: string | null }
): Promise<CvrCandidate | null> {
  if (candidates.length === 0) return null;

  // With only 1 candidate: only return it if name similarity is decent
  if (candidates.length === 1) {
    const c = candidates[0];
    const brandLower = brandName.toLowerCase().replace(/[^a-zæøå0-9]/g, "");
    const nameLower = c.name.toLowerCase().replace(/[^a-zæøå0-9]/g, "");
    // Accept if brand name is contained in legal name or vice versa (min 4 chars)
    const shorter = brandLower.length <= nameLower.length ? brandLower : nameLower;
    const longer = brandLower.length > nameLower.length ? brandLower : nameLower;
    if (shorter.length >= 4 && longer.includes(shorter)) return c;
    // Otherwise let LLM decide even with 1 candidate
  }

  const client = getOpenAI();

  const candidateList = candidates.map((c, i) =>
    `${i + 1}. CVR: ${c.cvr}\n   Juridisk navn: ${c.name}\n   Adresse: ${c.address || "?"}\n   Branche: ${c.industry || "?"}\n   Selskabstype: ${c.type || "?"}\n   Hjemmeside: ${c.website || "?"}`
  ).join("\n\n");

  const prompt = `Du er ekspert i at matche danske brand-navne med juridiske virksomhedsnavne i CVR-registret.

Brand-navn (fra annonce): "${brandName}"
Branche/kontekst: ${context.industry || "Ukendt"}
Domæne: ${context.domain || "Ukendt"}
By: ${context.address || "Ukendt"}

CVR-kandidater at vælge imellem:
${candidateList}

Opgave: Vælg den kandidat der MEST sandsynligt er den rigtige virksomhed bag annoncen.

Vigtigt at vide:
- Brand-navne MATCHER sjældent det juridiske navn (fx "H&M" = "H & M Hennes & Mauritz A/S")
- Vær pragmatisk: hvis branchen passer og navnet har overlap, er det sandsynligvis korrekt
- Svar med KUN nummeret (1, 2, 3 osv.)
- Hvis INGEN kandidat er sandsynlig (under 40% sikkerhed), svar "ingen"

Svar:`;

  try {
    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
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
    return candidates.length === 1 ? candidates[0] : null;
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

  logger.info(`[cvr-ai-match] Finding CVR for "${brandName}"`, { service: "cvr" });

  const seenCvr = new Map<string, CvrCandidate>();

  // ── Step 1: DuckDuckGo search → extract CVR numbers from URLs/snippets ──
  const searchCvrs = await searchForCvrCandidates(brandName);
  logger.info(`[cvr-ai-match] Search found ${searchCvrs.length} CVR numbers: [${searchCvrs.join(", ")}]`, { service: "cvr" });

  // Look up each CVR number found in search
  if (searchCvrs.length > 0) {
    const fetched = await Promise.all(searchCvrs.slice(0, 5).map(fetchCvrByNumber));
    for (const c of fetched) {
      if (c && !seenCvr.has(c.cvr)) seenCvr.set(c.cvr, c);
    }
  }

  // ── Step 2: cvrapi.dk name search with variations (if search didn't yield enough) ──
  if (seenCvr.size < 2) {
    const variations = nameVariations(brandName);
    const fetched = await Promise.all(variations.map(fetchCvrByName));
    for (const c of fetched) {
      if (c && !seenCvr.has(c.cvr)) seenCvr.set(c.cvr, c);
    }
  }

  // ── Step 3: Domain-based search (if we have a website) ────────────────
  if (domain) {
    // Try the domain directly in cvrapi – some companies have it registered
    try {
      const params = new URLSearchParams({ country: "dk", domain: domain.trim() });
      const res = await fetch(`${config.cvr.apiUrl}?${params}`, {
        headers: { "User-Agent": config.cvr.userAgent },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const d = await res.json();
        if (d?.vat && !seenCvr.has(String(d.vat))) {
          seenCvr.set(String(d.vat), {
            cvr: String(d.vat),
            name: String(d.name || ""),
            address: [d.address, d.zipcode, d.city].filter(Boolean).join(", "),
            industry: d.industrydesc || undefined,
            type: d.companydesc || undefined,
            website: d.companydomain || undefined,
            phone: d.phone ? String(d.phone) : undefined,
            email: d.email || undefined,
          });
        }
      }
    } catch { /* ignore */ }
  }

  const candidates = [...seenCvr.values()];
  logger.info(
    `[cvr-ai-match] ${candidates.length} total candidates for "${brandName}": ${candidates.map(c => `${c.name}(${c.cvr})`).join(", ")}`,
    { service: "cvr" }
  );

  if (candidates.length === 0) {
    logger.info(`[cvr-ai-match] No candidates found for "${brandName}"`, { service: "cvr" });
    return null;
  }

  // ── Step 4: LLM picks the best ────────────────────────────────────────
  const best = await aiPickCandidate(brandName, candidates, { industry, domain, address });

  if (best) {
    logger.info(`[cvr-ai-match] Matched "${brandName}" → "${best.name}" (CVR ${best.cvr})`, { service: "cvr" });
  } else {
    logger.info(`[cvr-ai-match] No confident match for "${brandName}" among ${candidates.length} candidates`, { service: "cvr" });
  }

  return best;
}
