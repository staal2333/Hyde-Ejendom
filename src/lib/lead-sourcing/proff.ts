// ============================================================
// Proff.dk – egenkapital / resultat (public page, no payment)
// Fetches company key figures from Proff search/company page.
// ============================================================

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
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();

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

export { domainFromWebsite };
