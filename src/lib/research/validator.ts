// ============================================================
// Post-LLM Validator
// Hard-validates LLM output against actual found data.
// NO email, contact, or owner may pass unless it has a clear
// source in OIS / CVR / web-scraped data.
// ============================================================

import type { ResearchData, ResearchAnalysis, Contact } from "@/types";
import { logger } from "../logger";

// ── OIS ejerforhold strategies ─────────────────────────────

export type OwnershipType =
  | "selskab"           // Company-owned (ApS, A/S, etc.)
  | "andelsbolig"       // Housing cooperative (andelsboligforening)
  | "ejerforening"      // Owner's association (ejerforening)
  | "privatperson"      // Private individual
  | "almennyttig"       // Social housing (almennyttig bolig)
  | "offentlig"         // Government/municipality
  | "ukendt";           // Unknown

/**
 * Classify ownership type from OIS ejerforholdstekst + ejernavne.
 */
export function classifyOwnership(
  ejerforholdstekst?: string,
  ejerforholdskode?: string,
  ownerNames?: string[]
): OwnershipType {
  const tekst = (ejerforholdstekst || "").toLowerCase();
  const kode = ejerforholdskode || "";

  // Kode-baseret (mest pålidelig)
  // OIS ejerforholdskoder:
  // 10 = Privatpersoner, 20 = A/S, 30 = Andre selskaber, 40 = Forening/legat/selvejende,
  // 41 = Andelsboligforening, 50 = Almennyttig boligselskab,
  // 60 = Staten, 70 = Kommunen, 80 = Regionen
  if (kode === "41") return "andelsbolig";
  if (kode === "10") return "privatperson";
  if (kode === "20" || kode === "30") return "selskab";
  if (kode === "40") {
    // "Forening/legat" – check name to distinguish
    if (ownerNames?.some(n => /ejerforening|e\/f/i.test(n))) return "ejerforening";
    if (ownerNames?.some(n => /andels|a\/b/i.test(n))) return "andelsbolig";
    return "ejerforening"; // Default for foreninger
  }
  if (kode === "50") return "almennyttig";
  if (["60", "70", "80"].includes(kode)) return "offentlig";

  // Tekst-baseret fallback
  if (tekst.includes("andelsbolig")) return "andelsbolig";
  if (tekst.includes("ejerlejlighed") || tekst.includes("ejerforening")) return "ejerforening";
  if (tekst.includes("privatperson") || tekst.includes("privat eje")) return "privatperson";
  if (tekst.includes("aktieselskab") || tekst.includes("anpartsselskab")) return "selskab";
  if (tekst.includes("almennyttig") || tekst.includes("almen bolig")) return "almennyttig";

  // Name-baseret fallback
  if (ownerNames && ownerNames.length > 0) {
    const firstName = ownerNames[0];
    if (/\b(aps|a\/s|holding|invest|ejendom|kapital|fond)\b/i.test(firstName)) return "selskab";
    if (/\b(a\/b|andels|andelsbolig)\b/i.test(firstName)) return "andelsbolig";
    if (/\b(e\/f|ejerforening)\b/i.test(firstName)) return "ejerforening";
    // If the name has no company suffix, likely a person
    if (!/\b(aps|a\/s|i\/s|k\/s|holding|smba|ivs|forening|fond|selskab)\b/i.test(firstName)) {
      return "privatperson";
    }
  }

  return "ukendt";
}

/**
 * Determine CVR search strategy based on ownership type.
 */
export function getCvrStrategy(ownerType: OwnershipType): {
  shouldSearchCvr: boolean;
  acceptPrivateOwner: boolean;
  requireAddressMatch: boolean;
  maxCvrCandidates: number;
  description: string;
} {
  switch (ownerType) {
    case "selskab":
      return {
        shouldSearchCvr: true,
        acceptPrivateOwner: false,
        requireAddressMatch: false, // Company may have HQ elsewhere
        maxCvrCandidates: 3,
        description: "Selskabsejet – søg CVR med firmanavn fra OIS",
      };
    case "andelsbolig":
      return {
        shouldSearchCvr: true,
        acceptPrivateOwner: false,
        requireAddressMatch: true, // AB should be at the property address
        maxCvrCandidates: 2,
        description: "Andelsbolig – søg CVR for A/B-foreningen",
      };
    case "ejerforening":
      return {
        shouldSearchCvr: true,
        acceptPrivateOwner: false,
        requireAddressMatch: true,
        maxCvrCandidates: 2,
        description: "Ejerforening – søg CVR for E/F-foreningen",
      };
    case "privatperson":
      return {
        shouldSearchCvr: false, // Don't try to match private persons to random companies
        acceptPrivateOwner: true,
        requireAddressMatch: false,
        maxCvrCandidates: 0,
        description: "Privatperson – spring CVR over, personen ER ejeren",
      };
    case "almennyttig":
      return {
        shouldSearchCvr: true,
        acceptPrivateOwner: false,
        requireAddressMatch: false,
        maxCvrCandidates: 2,
        description: "Almennyttig – søg CVR for boligselskabet",
      };
    case "offentlig":
      return {
        shouldSearchCvr: false,
        acceptPrivateOwner: false,
        requireAddressMatch: false,
        maxCvrCandidates: 0,
        description: "Offentligt ejet – CVR-søgning er irrelevant",
      };
    default:
      return {
        shouldSearchCvr: true,
        acceptPrivateOwner: true,
        requireAddressMatch: false,
        maxCvrCandidates: 2,
        description: "Ukendt ejertype – forsigtig CVR-søgning",
      };
  }
}

// ── Post-LLM validation ───────────────────────────────────

/**
 * Collect ALL emails found during research (the "allowed" set).
 * Any email NOT in this set must be treated as LLM hallucination.
 */
export function collectAllowedEmails(research: ResearchData): Set<string> {
  const allowed = new Set<string>();

  // From CVR
  if (research.cvrData?.email) {
    allowed.add(research.cvrData.email.toLowerCase());
  }

  // From website scraping
  if (research.websiteContent?.emails) {
    for (const e of research.websiteContent.emails) {
      allowed.add(e.toLowerCase());
    }
  }

  // From search result snippets (if they contain emails)
  for (const result of research.companySearchResults) {
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = `${result.title} ${result.snippet}`.match(emailRegex) || [];
    for (const m of matches) {
      allowed.add(m.toLowerCase());
    }
  }

  return allowed;
}

/**
 * Collect ALL person names found during research.
 * Used to verify LLM contacts against real data.
 */
export function collectKnownNames(research: ResearchData): Set<string> {
  const names = new Set<string>();

  // From OIS
  if (research.oisData) {
    for (const o of research.oisData.owners) names.add(o.name.toLowerCase());
    for (const a of research.oisData.administrators) names.add(a.name.toLowerCase());
  }

  // From CVR
  if (research.cvrData?.owners) {
    for (const o of research.cvrData.owners) names.add(o.toLowerCase());
  }

  // From website content
  if (research.websiteContent?.names) {
    for (const n of research.websiteContent.names) names.add(n.toLowerCase());
  }

  return names;
}

/**
 * Hard-validate LLM analysis output against actual research data.
 * Removes hallucinated emails, adjusts confidence, and may downgrade dataQuality.
 *
 * Returns a cleaned copy of the analysis + a list of corrections made.
 */
export function validateAnalysis(
  analysis: ResearchAnalysis,
  research: ResearchData,
  propertyAddress: string
): { cleaned: ResearchAnalysis; corrections: string[] } {
  const corrections: string[] = [];
  const allowedEmails = collectAllowedEmails(research);
  const knownNames = collectKnownNames(research);

  // Deep clone
  const cleaned: ResearchAnalysis = JSON.parse(JSON.stringify(analysis));

  // ── 1. Validate emails: MUST exist in allowedEmails ──
  for (const contact of cleaned.recommendedContacts) {
    if (contact.email) {
      const emailLower = contact.email.toLowerCase();

      // Check against allowed set
      if (!allowedEmails.has(emailLower)) {
        const msg = `FJERNET hallucinated email "${contact.email}" for ${contact.fullName} – fandtes ikke i nogen datakilde`;
        corrections.push(msg);
        logger.warn(msg, { service: "validator", propertyAddress });
        contact.email = null;
        contact.confidence = Math.min(contact.confidence, 0.15);
      }

      // Check for obviously invalid emails
      if (contact.email) {
        const e = contact.email.toLowerCase();
        if (
          e.includes("@ukendt") ||
          e.includes("@unknown") ||
          e.includes("@null") ||
          !e.includes("@") ||
          !e.includes(".")
        ) {
          corrections.push(`FJERNET ugyldig email "${contact.email}"`);
          contact.email = null;
          contact.confidence = Math.min(contact.confidence, 0.1);
        }
      }
    }
  }

  // ── 2. Validate contact names: bonus if found in known names ──
  for (const contact of cleaned.recommendedContacts) {
    if (contact.fullName) {
      const nameLower = contact.fullName.toLowerCase();
      const isKnown = [...knownNames].some(
        known => known.includes(nameLower.substring(0, 6)) || nameLower.includes(known.substring(0, 6))
      );

      if (!isKnown) {
        // Name not found in any source – lower confidence
        const oldConf = contact.confidence;
        contact.confidence = Math.min(contact.confidence, 0.4);
        if (oldConf > 0.4) {
          corrections.push(
            `Nedgraderet "${contact.fullName}" fra ${Math.round(oldConf * 100)}% til ${Math.round(contact.confidence * 100)}% – navn ikke fundet i datakilderne`
          );
        }
      }
    }
  }

  // ── 3. Validate ownerCompanyName against OIS/CVR ──
  if (cleaned.ownerCompanyName && cleaned.ownerCompanyName !== "Ukendt") {
    const ownerLower = cleaned.ownerCompanyName.toLowerCase();
    const oisMatch = research.oisData?.owners.some(
      o => o.name.toLowerCase().includes(ownerLower.substring(0, 6)) ||
           ownerLower.includes(o.name.toLowerCase().substring(0, 6))
    );
    const cvrMatch = research.cvrData?.companyName &&
      (research.cvrData.companyName.toLowerCase().includes(ownerLower.substring(0, 6)) ||
       ownerLower.includes(research.cvrData.companyName.toLowerCase().substring(0, 6)));

    if (!oisMatch && !cvrMatch) {
      corrections.push(
        `Ejer "${cleaned.ownerCompanyName}" matcher hverken OIS eller CVR – sat til "Ukendt"`
      );
      cleaned.ownerCompanyName = "Ukendt";
      cleaned.dataQuality = cleaned.dataQuality === "high" ? "medium" : cleaned.dataQuality;
    }
  }

  // ── 4. Enforce data quality rules ──
  const hasOis = !!research.oisData;
  const hasCvr = !!research.cvrData;
  const hasVerifiedEmail = cleaned.recommendedContacts.some(
    c => c.email && c.confidence >= 0.6
  );

  // Only "high" if we have OIS + CVR + at least one verified email
  if (cleaned.dataQuality === "high") {
    if (!hasOis || !hasCvr || !hasVerifiedEmail) {
      cleaned.dataQuality = "medium";
      corrections.push(
        `dataQuality nedgraderet fra "high" til "medium": mangler ${[
          !hasOis && "OIS",
          !hasCvr && "CVR",
          !hasVerifiedEmail && "verificeret email",
        ].filter(Boolean).join(" + ")}`
      );
    }
  }

  // If no OIS data at all → max "low"
  if (!hasOis && cleaned.dataQuality !== "low") {
    cleaned.dataQuality = "low";
    corrections.push("dataQuality sat til 'low': ingen OIS-data");
  }

  // ── 5. Cap generic email confidence ──
  for (const contact of cleaned.recommendedContacts) {
    if (contact.email) {
      const local = contact.email.split("@")[0].toLowerCase();
      const genericPrefixes = ["info", "kontakt", "contact", "mail", "post", "kontor", "office", "hello", "admin"];
      if (genericPrefixes.includes(local)) {
        if (contact.confidence > 0.3) {
          corrections.push(
            `Generisk email "${contact.email}" cappet til confidence 0.3 (var ${Math.round(contact.confidence * 100)}%)`
          );
          contact.confidence = 0.3;
        }
      }
    }
  }

  // ── 6. Remove contacts without name AND without email ──
  const before = cleaned.recommendedContacts.length;
  cleaned.recommendedContacts = cleaned.recommendedContacts.filter(
    c => c.fullName || c.email
  );
  if (cleaned.recommendedContacts.length < before) {
    corrections.push(`${before - cleaned.recommendedContacts.length} tomme kontakter fjernet`);
  }

  // ── 7. Re-sort: direct > indirect, then by confidence ──
  cleaned.recommendedContacts.sort((a, b) => {
    if (a.relevance === "direct" && b.relevance !== "direct") return -1;
    if (b.relevance === "direct" && a.relevance !== "direct") return 1;
    return b.confidence - a.confidence;
  });

  if (corrections.length > 0) {
    logger.info(`Validator: ${corrections.length} korrektioner for ${propertyAddress}`, {
      service: "validator",
      propertyAddress,
      metadata: { corrections },
    });
  }

  return { cleaned, corrections };
}

// ── CVR scoring ──────────────────────────────────────────

export interface CvrCandidate {
  cvr: string;
  companyName: string;
  address: string;
  score: number;
  reasons: string[];
}

/**
 * Score a CVR result against the expected property data.
 * Returns 0-100 where 100 = perfect match.
 */
export function scoreCvrMatch(
  cvrName: string,
  cvrAddress: string,
  oisOwnerName: string,
  propertyAddress: string,
  propertyPostalCode: string,
  propertyKommune?: string
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const normOis = oisOwnerName.toLowerCase().replace(/[^a-zæøå0-9]/g, "").trim();
  const normCvr = cvrName.toLowerCase().replace(/[^a-zæøå0-9]/g, "").trim();
  const cvrAddrLower = cvrAddress.toLowerCase();
  const propAddrLower = propertyAddress.toLowerCase();
  const propStreet = propAddrLower.replace(/\s*\d+.*$/, "").trim();

  // ── Name matching (0-40 points) ──
  if (normOis === normCvr) {
    score += 40;
    reasons.push("Exact name match (40)");
  } else if (normOis.includes(normCvr) || normCvr.includes(normOis)) {
    score += 30;
    reasons.push("Substring name match (30)");
  } else {
    // Check word overlap
    const oisWords = normOis.split(/\s+/).filter(w => w.length > 2);
    const cvrWords = normCvr.split(/\s+/).filter(w => w.length > 2);
    const overlap = oisWords.filter(w => cvrWords.includes(w)).length;
    const overlapRatio = overlap / Math.max(oisWords.length, cvrWords.length, 1);
    if (overlapRatio >= 0.5) {
      score += Math.round(overlapRatio * 25);
      reasons.push(`Word overlap ${Math.round(overlapRatio * 100)}% (${score})`);
    }
  }

  // ── Address matching (0-35 points) ──
  if (propertyPostalCode && cvrAddrLower.includes(propertyPostalCode)) {
    score += 15;
    reasons.push("Same postal code (15)");
  }
  if (propStreet && cvrAddrLower.includes(propStreet)) {
    score += 20;
    reasons.push("Same street (20)");
  }

  // ── Kommune / city matching (0-15 points) ──
  if (propertyKommune) {
    const kommuneLower = propertyKommune.toLowerCase();
    // Direct match: CVR address contains the kommune name
    if (cvrAddrLower.includes(kommuneLower)) {
      score += 15;
      reasons.push(`Same kommune "${propertyKommune}" (15)`);
    } else {
      // Fuzzy: "København" should match "København Ø", "København K", "Kbh" etc.
      // Also handle "Aarhus" vs "Århus"
      const cityAliases: Record<string, string[]> = {
        "københavn": ["københavn", "kbh", "copenhagen", "frederiksberg"],
        "aarhus": ["aarhus", "århus"],
        "aalborg": ["aalborg", "ålborg"],
        "odense": ["odense"],
        "esbjerg": ["esbjerg"],
      };
      const matchingAliases = cityAliases[kommuneLower] || [kommuneLower];
      if (matchingAliases.some(alias => cvrAddrLower.includes(alias))) {
        score += 15;
        reasons.push(`Kommune alias match (15)`);
      }
    }
  }

  // ── Penalties ──
  // If CVR address is in completely different city/region → big penalty
  if (propertyPostalCode) {
    const propRegion = propertyPostalCode.substring(0, 1); // 1xxx = KBH, 2xxx = Sjælland, etc.
    const cvrPostalMatch = cvrAddrLower.match(/\b(\d{4})\b/);
    if (cvrPostalMatch) {
      const cvrRegion = cvrPostalMatch[1].substring(0, 1);
      if (propRegion !== cvrRegion) {
        score -= 20;
        reasons.push("Different region (-20)");
      }
    }
  }

  // ── Bonus for property-related company type ──
  const propKeywords = ["ejendom", "bolig", "invest", "holding", "kapital", "ejerforening", "andelsbolig"];
  if (propKeywords.some(k => normCvr.includes(k))) {
    score += 10;
    reasons.push("Property-related company type (+10)");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * Check if a CVR match is good enough to use.
 * MINIMUM_SCORE prevents bad matches from being accepted.
 */
export const CVR_MATCH_THRESHOLD = 35; // Minimum score to accept a CVR match

/**
 * Check MX record for a domain (basic email validation).
 * Returns true if the domain has MX records (can receive email).
 */
export async function checkMxRecord(domain: string): Promise<boolean> {
  try {
    // Use DNS-over-HTTPS to check MX records (works in serverless)
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.Answer && data.Answer.length > 0;
  } catch {
    return false; // If we can't check, don't validate
  }
}
