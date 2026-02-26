// ============================================================
// Proff.dk – egenkapital / resultat (public page, no payment)
// Fetches company key figures from Proff search/company page.
// ============================================================

import { searchGoogle, withRetry } from "../research/web-scraper";

const PROFF_SEARCH = "https://www.proff.dk/sog";
const USER_AGENT = "EjendomAI-LeadSourcing/1.0 (compatible; +https://ejendom-ai.vercel.app)";

export interface ProffFinancials {
  egenkapital: number | null; // DKK
  resultat: number | null;   // Årets resultat, DKK
  omsaetning: number | null; // DKK
}

/**
 * Extract domain from URL or company website string.
 */
function domainFromWebsite(website: string | undefined): string | null {
  if (!website || !website.trim()) return null;
  try {
    const u = website.trim().toLowerCase();
    const withScheme = u.startsWith("http") ? u : `https://${u}`;
    const host = new URL(withScheme).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Fetch Proff.dk for company financials by CVR.
 * Tries search?q=CVR and parses HTML for Egenkapital, Resultat, Omsætning.
 * Returns null if page is JS-rendered or not found.
 */
export async function getProffFinancials(cvr: string): Promise<ProffFinancials | null> {
  const normalizedCvr = String(cvr).trim().replace(/\D/g, "").slice(0, 8);
  if (!normalizedCvr) return null;

  try {
    const url = `${PROFF_SEARCH}?q=${encodeURIComponent(normalizedCvr)}`;
    const html = await withRetry(async () => {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`Proff HTTP ${res.status}`);
      return res.text();
    }, 2, 1000);

    // Parse Danish number format: 1.234.567 or 1.234.567 kr. or -500.000
    const parseNumber = (raw: string): number | null => {
      const cleaned = raw.replace(/\s*kr\.?\s*/gi, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : null;
    };

    const egenkapital = extractLabelValue(html, ["Egenkapital", "Egenkapital:"], parseNumber);
    const resultat = extractLabelValue(html, ["Årets resultat", "Resultat", "Årets resultat:", "Resultat:"], parseNumber);
    const omsaetning = extractLabelValue(html, ["Omsætning", "Omsætning:"], parseNumber);

    if (egenkapital === null && resultat === null && omsaetning === null) return null;
    return { egenkapital, resultat, omsaetning };
  } catch {
    return null;
  }
}

function extractLabelValue(
  html: string,
  labels: string[],
  parse: (raw: string) => number | null
): number | null {
  for (const label of labels) {
    const re = new RegExp(
      `${escapeRe(label)}\\s*[:</>\\s]*([\\d.\\s,-]+(?:\\s*kr\\.?)?)`,
      "i"
    );
    const m = html.match(re);
    if (m && m[1]) {
      const v = parse(m[1]);
      if (v !== null) return v;
    }
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================
// Proff.dk Leadership Scraping – directors, board, management
// ============================================================

export interface ProffPerson {
  name: string;
  title: string;
}

/**
 * Scrape leadership/board info from a Proff.dk company page.
 * Looks for "Direktion", "Bestyrelse", "Ledelse" sections.
 * Falls back to SearchAPI snippet extraction if HTML scraping returns nothing.
 */
export async function scrapeProffLeadership(cvr: string, companyName?: string): Promise<ProffPerson[]> {
  const normalizedCvr = String(cvr).trim().replace(/\D/g, "").slice(0, 8);
  if (!normalizedCvr) return [];

  // Primary: direct HTML scraping from Proff.dk
  const htmlPeople = await scrapeProffLeadershipHtml(normalizedCvr);
  if (htmlPeople.length > 0) return htmlPeople;

  // Fallback: use SearchAPI to find Proff snippets and extract names
  return scrapeProffLeadershipViaSearch(normalizedCvr, companyName);
}

async function scrapeProffLeadershipHtml(normalizedCvr: string): Promise<ProffPerson[]> {
  try {
    const url = `${PROFF_SEARCH}?q=${encodeURIComponent(normalizedCvr)}`;
    const html = await withRetry(async () => {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Proff HTTP ${res.status}`);
      return res.text();
    }, 2, 1000);

    // Also try the /roller/ page if we can find a link
    const rollerLink = html.match(/href="(\/roller\/[^"]+)"/i);
    let rollerHtml = html;
    if (rollerLink) {
      try {
        const rollerRes = await fetch(`https://www.proff.dk${rollerLink[1]}`, {
          headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
          signal: AbortSignal.timeout(15000),
        });
        if (rollerRes.ok) rollerHtml += "\n" + await rollerRes.text();
      } catch { /* ignore */ }
    }

    return extractLeadershipFromHtml(rollerHtml);
  } catch {
    return [];
  }
}

async function scrapeProffLeadershipViaSearch(normalizedCvr: string, companyName?: string): Promise<ProffPerson[]> {
  try {
    const query = companyName
      ? `site:proff.dk "${companyName}" direktion direktør`
      : `site:proff.dk CVR:${normalizedCvr} direktion`;

    const results = await searchGoogle(query, 5);
    if (results.length === 0) return [];

    // Extract names from snippets using leadership title patterns
    const combined = results.map(r => `${r.title} ${r.snippet}`).join("\n");
    return extractLeadershipFromHtml(combined);
  } catch {
    return [];
  }
}

/**
 * Extract leadership names + titles from Proff.dk HTML.
 * Handles various patterns found on Proff.dk pages.
 */
function extractLeadershipFromHtml(html: string): ProffPerson[] {
  const people: ProffPerson[] = [];
  const seen = new Set<string>();

  const titlePatterns = [
    "Adm\\.?\\s*direktør", "Direktør", "Bestyrelsesformand", "Bestyrelsesmedlem",
    "CEO", "CFO", "COO", "CTO", "CMO",
    "Managing Director", "Indehaver", "Ejer", "Partner",
    "Stifter", "Founder", "Driftschef", "Driftsleder",
    "Økonomichef", "Salgschef", "Marketingchef",
    "Forretningsfører", "Viceadm\\.?\\s*direktør",
  ];

  const titleGroup = titlePatterns.join("|");
  const DANISH_NAME = "[A-ZÆØÅ][a-zæøåé]+(?:\\s+[A-ZÆØÅ][a-zæøåé]+){1,3}";

  // Pattern: Title followed by name
  const titleThenName = new RegExp(
    `(${titleGroup})\\s*[:\\-–,]?\\s*(${DANISH_NAME})`,
    "gi"
  );
  for (const m of html.matchAll(titleThenName)) {
    const title = m[1].trim();
    const name = m[2].trim();
    const key = name.toLowerCase();
    if (!seen.has(key) && name.length > 4) {
      seen.add(key);
      people.push({ name, title });
    }
  }

  // Pattern: Name followed by title
  const nameThenTitle = new RegExp(
    `(${DANISH_NAME})\\s*[,\\-–]\\s*(${titleGroup})`,
    "gi"
  );
  for (const m of html.matchAll(nameThenTitle)) {
    const name = m[1].trim();
    const title = m[2].trim();
    const key = name.toLowerCase();
    if (!seen.has(key) && name.length > 4) {
      seen.add(key);
      people.push({ name, title });
    }
  }

  // Pattern: Proff.dk specific HTML structure – <dt>Role</dt><dd>Name</dd>
  const dtDd = new RegExp(
    `<dt[^>]*>\\s*(${titleGroup})\\s*</dt>\\s*<dd[^>]*>\\s*(${DANISH_NAME})`,
    "gi"
  );
  for (const m of html.matchAll(dtDd)) {
    const title = m[1].trim().replace(/<[^>]*>/g, "");
    const name = m[2].trim().replace(/<[^>]*>/g, "");
    const key = name.toLowerCase();
    if (!seen.has(key) && name.length > 4) {
      seen.add(key);
      people.push({ name, title });
    }
  }

  return people;
}

export { domainFromWebsite };
