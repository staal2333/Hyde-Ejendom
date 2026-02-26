// ============================================================
// CVR AI Matcher – find the right CVR for an ad-library lead
//
// Problem: ad platforms use brand names ("Café Noir"), but
// CVR has legal names ("Café Noir ApS" / "Black Coffee Catering v/Lars").
// cvrapi.dk returns ONE result per search, so a brand-name mismatch
// means the lead gets no CVR.
//
// Solution:
//   1. Generate 4-6 name variations, search each in cvrapi.dk
//   2. Also scrape Proff.dk which returns a ranked list of matches
//   3. Pass all unique candidates (max 8) to the LLM
//   4. LLM picks the best match (or says "none") based on
//      brand name, industry context, domain, and city
// ============================================================

import OpenAI from "openai";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

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

// ── Step 1: Fetch a single CVR result from cvrapi.dk ──────────────────────
async function fetchOneCvr(nameOrNumber: string): Promise<CvrCandidate | null> {
  try {
    const isNum = /^\d{8}$/.test(nameOrNumber.trim());
    const params = new URLSearchParams({
      country: "dk",
      ...(isNum ? { vat: nameOrNumber.trim() } : { name: nameOrNumber.trim() }),
    });

    const res = await fetch(`${config.cvr.apiUrl}?${params}`, {
      headers: { "User-Agent": config.cvr.userAgent },
      signal: AbortSignal.timeout(10000),
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

// ── Step 2: Scrape Proff.dk search results ────────────────────────────────
async function searchProffCandidates(name: string): Promise<CvrCandidate[]> {
  try {
    const url = `https://www.proff.dk/s%C3%B8g?q=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const candidates: CvrCandidate[] = [];
    const seen = new Set<string>();

    // Pattern: CVR number followed or preceded by company name on Proff.dk
    // Proff uses patterns like: data-cvr="12345678" or CVR: 12345678
    const cvrPatterns = [
      /data-cvr="(\d{8})"/gi,
      /cvr[:\s]+(\d{8})/gi,
      /\/virksomhed\/[^"]*?-(\d{8})(?:"|\/)/gi,
    ];

    const cvrNumbers: string[] = [];
    for (const pattern of cvrPatterns) {
      pattern.lastIndex = 0;
      for (const m of html.matchAll(pattern)) {
        const num = m[1];
        if (num && !cvrNumbers.includes(num)) cvrNumbers.push(num);
      }
    }

    // Also look for company name + CVR in search result blocks
    const blockPattern = /<(?:h\d|strong|b)[^>]*>([^<]{3,80})<\/(?:h\d|strong|b)>[^]*?(\d{8})/gi;
    for (const m of html.matchAll(blockPattern)) {
      const blockName = m[1].trim();
      const cvr = m[2];
      if (cvr && blockName && !seen.has(cvr)) {
        seen.add(cvr);
        candidates.push({ cvr, name: blockName, address: "" });
      }
    }

    // Fetch full data for CVR numbers found on Proff
    const limit = Math.min(cvrNumbers.filter(n => !seen.has(n)).length, 5);
    const newNums = cvrNumbers.filter(n => !seen.has(n)).slice(0, limit);

    const fetched = await Promise.all(newNums.map(fetchOneCvr));
    for (const c of fetched) {
      if (c && !seen.has(c.cvr)) {
        seen.add(c.cvr);
        candidates.push(c);
      }
    }

    return candidates.slice(0, 6);
  } catch {
    return [];
  }
}

// ── Step 3: Generate name search variations ───────────────────────────────
function nameVariations(brandName: string): string[] {
  const name = brandName.trim();
  const words = name.split(/\s+/).filter(Boolean);

  const variations = new Set<string>();
  variations.add(name);

  // First two words (e.g. "Café Central" from "Café Central Copenhagen")
  if (words.length >= 2) variations.add(words.slice(0, 2).join(" "));

  // First word only (e.g. "JYSK")
  if (words[0].length >= 3) variations.add(words[0]);

  // Without common suffixes (Café, Restaurant, Hotel, etc.)
  const withoutPrefix = name.replace(/^(café|cafe|restaurant|hotel|bar|shop|butik|klinik|salon|studio|gym|center|centre)\s+/i, "").trim();
  if (withoutPrefix !== name && withoutPrefix.length >= 3) variations.add(withoutPrefix);

  // Without ApS/A/S etc. if present
  const withoutLegal = name.replace(/\s+(aps|a\/s|as|i\/s|ivs|smba)\s*$/i, "").trim();
  if (withoutLegal !== name) variations.add(withoutLegal);

  // Remove special chars (e.g. "Café" → "Cafe")
  const ascii = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[æ]/gi, "ae").replace(/[ø]/gi, "oe").replace(/[å]/gi, "aa");
  if (ascii !== name) variations.add(ascii);

  return [...variations].slice(0, 6);
}

// ── Step 4: LLM picks the best candidate ─────────────────────────────────
async function aiPickCandidate(
  brandName: string,
  candidates: CvrCandidate[],
  context: { industry?: string | null; domain?: string | null; address?: string | null }
): Promise<CvrCandidate | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const client = getOpenAI();

  const candidateList = candidates.map((c, i) =>
    `${i + 1}. CVR: ${c.cvr} | Navn: ${c.name} | Adresse: ${c.address || "?"} | Branche: ${c.industry || "?"} | Type: ${c.type || "?"} | Hjemmeside: ${c.website || "?"}`
  ).join("\n");

  const prompt = `Du er en dansk virksomhedsmatcher. En virksomhed annoncerer under navnet "${brandName}" og vi skal finde den rigtige CVR.

Kontekst:
- Branche/kategori: ${context.industry || "Ukendt"}
- Domæne/hjemmeside: ${context.domain || "Ukendt"}  
- By/adresse: ${context.address || "Ukendt"}

CVR-kandidater:
${candidateList}

Regler:
- Vælg KUN hvis du er rimelig sikker (70%+ sandsynlighed) på at det er den rigtige virksomhed
- Brand-navne matcher ikke altid det juridiske CVR-navn (fx "McDonald's" = "McDonalds Danmark A/S")
- Franchise/kæder kan have lokalt CVR under kædenavnet
- Hvis ingen kandidater er sandsynlige, svar "ingen"
- Overvej: brancheoverenstemmelse, navnelighed, hjemmeside-match, virksomhedstype

Svar KUN med nummeret (1, 2, 3 osv.) eller ordet "ingen". Ingen forklaring.`;

  try {
    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 10,
    });

    const answer = response.choices[0]?.message?.content?.trim().toLowerCase() || "ingen";
    if (answer === "ingen" || answer.includes("ingen")) return null;

    const num = parseInt(answer.replace(/\D/g, ""), 10);
    if (!isNaN(num) && num >= 1 && num <= candidates.length) {
      return candidates[num - 1];
    }
    return null;
  } catch (e) {
    logger.warn(`[cvr-ai-match] LLM pick failed: ${e instanceof Error ? e.message : String(e)}`, { service: "cvr" });
    // Fall back to first candidate
    return candidates[0] || null;
  }
}

// ── Main export: AI-powered CVR matcher ──────────────────────────────────

export async function findCvrForLead(params: {
  brandName: string;
  industry?: string | null;
  domain?: string | null;
  address?: string | null;
}): Promise<CvrCandidate | null> {
  const { brandName, industry, domain, address } = params;

  logger.info(`[cvr-ai-match] Searching CVR for "${brandName}"`, { service: "cvr" });

  const variations = nameVariations(brandName);
  const seen = new Map<string, CvrCandidate>();

  // ── Parallel: search all name variations + Proff.dk ──
  const [cvrResults, proffCandidates] = await Promise.all([
    Promise.all(variations.map(v => fetchOneCvr(v))),
    searchProffCandidates(brandName),
  ]);

  // If we have a domain, also try domain-based search (domain → company name guess)
  let domainCandidate: CvrCandidate | null = null;
  if (domain) {
    const domainName = domain.replace(/\.(dk|com|net|org|io)$/, "").replace(/[-_]/g, " ").trim();
    if (domainName.length >= 3 && domainName.toLowerCase() !== brandName.toLowerCase()) {
      domainCandidate = await fetchOneCvr(domainName);
    }
  }

  // Collect all unique candidates
  for (const c of [...cvrResults, ...proffCandidates, domainCandidate]) {
    if (c && !seen.has(c.cvr)) seen.set(c.cvr, c);
  }

  const candidates = [...seen.values()];
  logger.info(`[cvr-ai-match] ${candidates.length} CVR candidates for "${brandName}": ${candidates.map(c => `${c.name}(${c.cvr})`).join(", ")}`, { service: "cvr" });

  if (candidates.length === 0) return null;

  // ── LLM picks the best candidate ──
  const best = await aiPickCandidate(brandName, candidates, { industry, domain, address });

  if (best) {
    logger.info(`[cvr-ai-match] AI matched "${brandName}" → "${best.name}" (CVR ${best.cvr})`, { service: "cvr" });
  } else {
    logger.info(`[cvr-ai-match] AI found no confident match for "${brandName}"`, { service: "cvr" });
  }

  return best;
}
