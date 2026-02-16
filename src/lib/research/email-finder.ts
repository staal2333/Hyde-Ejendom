// ============================================================
// Email Finder – Dedicated email discovery for contacts
// Strategy: Pattern guessing → Targeted search → Deep scraping
// ============================================================

import { searchGoogle, scrapeWebsite } from "./web-scraper";

/** Progress callback */
export type EmailFinderProgress = (event: {
  step: string;
  message: string;
  detail?: string;
}) => void;

/** Result of email finding attempt */
export interface EmailFinderResult {
  email: string | null;
  source: string;
  confidence: number;
  allCandidates: EmailCandidate[];
  strategy: string; // which strategy found it
}

export interface EmailCandidate {
  email: string;
  source: string;
  confidence: number;
}

// ─── Common Danish email patterns ────────────────────────────

const DANISH_EMAIL_PATTERNS = [
  // firstname@domain
  (first: string, _last: string) => `${first}`,
  // firstname.lastname@domain
  (first: string, last: string) => `${first}.${last}`,
  // f.lastname@domain
  (first: string, last: string) => `${first[0]}.${last}`,
  // flastname@domain
  (first: string, last: string) => `${first[0]}${last}`,
  // firstnamel@domain
  (first: string, last: string) => `${first}${last[0]}`,
  // lastname@domain
  (_first: string, last: string) => `${last}`,
  // first-last@domain
  (first: string, last: string) => `${first}-${last}`,
  // firstlast@domain
  (first: string, last: string) => `${first}${last}`,
];

// ─── Junk email filters ─────────────────────────────────────

const JUNK_EMAIL_PATTERNS = [
  /noreply/i, /no-reply/i, /donotreply/i,
  /sentry/i, /webpack/i, /wix/i, /squarespace/i,
  /example\.com/i, /test@/i, /dummy/i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i,
  /protection@/i, /abuse@/i, /postmaster@/i, /mailer-daemon/i,
  /unsubscribe/i, /privacy@/i,
];

const GENERIC_PREFIXES = [
  "info", "kontakt", "contact", "mail", "post", "kontor",
  "office", "hello", "hej", "reception", "support",
  "salg", "sales", "admin", "regnskab", "booking",
];

function isJunkEmail(email: string): boolean {
  return JUNK_EMAIL_PATTERNS.some((p) => p.test(email));
}

function isGenericEmail(email: string): boolean {
  const local = email.split("@")[0].toLowerCase();
  return GENERIC_PREFIXES.includes(local);
}

function normalizeForEmail(str: string): string {
  return str
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/ü/g, "u")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9.-]/g, "")
    .trim();
}

// ─── Domain Extraction ──────────────────────────────────────

/**
 * Extract likely company domain from various sources.
 */
export function extractCompanyDomain(
  knownEmails: string[],
  companyName?: string,
  websiteUrl?: string
): string | null {
  // 1. From existing emails (most reliable)
  const domainCounts: Record<string, number> = {};
  for (const email of knownEmails) {
    if (isJunkEmail(email)) continue;
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain) continue;
    // Skip common free email providers
    if (FREE_EMAIL_DOMAINS.has(domain)) continue;
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  }

  const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
  if (sortedDomains.length > 0) return sortedDomains[0][0];

  // 2. From website URL
  if (websiteUrl) {
    try {
      const hostname = new URL(websiteUrl).hostname.replace(/^www\./, "");
      if (!FREE_EMAIL_DOMAINS.has(hostname)) return hostname;
    } catch { /* ignore */ }
  }

  // 3. Try to guess from company name
  // Don't return guessed domains directly – they need to be verified
  // Instead, return null and let the caller do a web search
  // This prevents generating emails for non-existent domains

  return null;
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "live.com",
  "icloud.com", "me.com", "mail.com", "protonmail.com", "proton.me",
  "hotmail.dk", "outlook.dk", "yahoo.dk", "jubii.dk",
]);

/** Strings that are NOT valid domains but might be returned by the LLM */
const INVALID_DOMAIN_VALUES = new Set([
  "ukendt", "unknown", "null", "undefined", "ingen", "none", "n/a", "na",
  "mangler", "ikke fundet", "ej fundet",
]);

/**
 * Validate that a string is actually a plausible domain name.
 * Must have a dot, a valid TLD, and not be a junk value.
 */
function isValidDomain(domain: string | null | undefined): domain is string {
  if (!domain) return false;
  const d = domain.toLowerCase().trim();
  if (INVALID_DOMAIN_VALUES.has(d)) return false;
  if (d.length < 4) return false; // Minimum "a.dk"
  if (!d.includes(".")) return false;
  // Must end with a valid TLD
  if (!/\.[a-z]{2,10}$/.test(d)) return false;
  // Must not contain spaces or special characters
  if (/\s/.test(d)) return false;
  return true;
}

// ─── Email Pattern Generator ────────────────────────────────

/**
 * Generate likely email addresses for a person at a company domain.
 */
export function generateEmailPatterns(
  fullName: string,
  domain: string
): string[] {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return [];

  const firstName = normalizeForEmail(parts[0]);
  const lastName = normalizeForEmail(parts[parts.length - 1]);

  if (!firstName || !lastName) return [];

  const patterns = DANISH_EMAIL_PATTERNS.map((fn) => {
    const local = fn(firstName, lastName);
    return `${local}@${domain}`;
  });

  // Also try middle name patterns for Danish names (3+ parts)
  if (parts.length >= 3) {
    const middleName = normalizeForEmail(parts[1]);
    if (middleName) {
      patterns.push(`${firstName}.${middleName}.${lastName}@${domain}`);
      patterns.push(`${firstName}${middleName[0]}${lastName}@${domain}`);
    }
  }

  return [...new Set(patterns)].filter((e) => e.includes("@") && e.length > 5);
}

// ─── Main Email Finder ──────────────────────────────────────

/**
 * Aggressively find an email for a person.
 * Runs multiple strategies in order of reliability.
 */
export async function findEmailForPerson(opts: {
  personName: string;
  companyName?: string;
  companyDomain?: string;
  knownEmails?: string[];
  websiteUrl?: string;
  propertyAddress?: string;
  propertyCity?: string;
  onProgress?: EmailFinderProgress;
}): Promise<EmailFinderResult> {
  const emit = opts.onProgress || (() => {});
  const allCandidates: EmailCandidate[] = [];

  const personName = opts.personName;
  const companyName = opts.companyName;

  // ── Strategy 1: Extract and validate domain from known data ──
  emit({ step: "domain", message: `Finder firma-domæne for ${companyName || "ukendt firma"}...` });

  // Validate the provided domain first
  let domain: string | null = null;

  if (isValidDomain(opts.companyDomain)) {
    domain = opts.companyDomain;
  }

  if (!domain) {
    domain = extractCompanyDomain(
      opts.knownEmails || [],
      companyName,
      opts.websiteUrl
    );
  }

  // ── Strategy 1.5: If no domain found, try to discover it via web search ──
  if (!isValidDomain(domain) && companyName) {
    emit({
      step: "domain_search",
      message: `Ingen domæne fundet – søger efter ${companyName}'s hjemmeside...`,
    });

    const domainSearchResults = await searchGoogle(`"${companyName}" hjemmeside site:dk OR site:com`, 3);
    for (const result of domainSearchResults) {
      try {
        const hostname = new URL(result.url).hostname.replace(/^www\./, "");
        if (!FREE_EMAIL_DOMAINS.has(hostname) && isValidDomain(hostname)) {
          // Check if the search result is actually about this company
          const text = `${result.title} ${result.snippet}`.toLowerCase();
          const companyLower = companyName.toLowerCase().replace(/\s*(a\/s|aps|i\/s|k\/s)\s*/gi, "").trim();
          if (text.includes(companyLower.substring(0, Math.min(companyLower.length, 6)))) {
            domain = hostname;
            emit({
              step: "domain_found",
              message: `Hjemmeside fundet via søgning: ${domain}`,
              detail: `Fra: ${result.title}`,
            });
            break;
          }
        }
      } catch { /* continue */ }
    }
  }

  // Final domain validation
  if (!isValidDomain(domain)) {
    emit({
      step: "domain",
      message: `Intet gyldigt firma-domæne fundet for ${companyName || "ukendt firma"}`,
      detail: "Kan ikke generere email-mønstre uden gyldigt domæne. Søger bredt efter email.",
    });
    domain = null;
  } else {
    emit({
      step: "domain",
      message: `Firma-domæne: ${domain}`,
      detail: `Genererer email-mønstre for ${personName}`,
    });

    // ── Strategy 2: Pattern-based email guessing (only with valid domain!) ──
    const patterns = generateEmailPatterns(personName, domain);

    if (patterns.length > 0) {
      emit({
        step: "patterns",
        message: `${patterns.length} mulige email-mønstre genereret`,
        detail: patterns.slice(0, 4).join(", ") + "...",
      });

      // Add all patterns as candidates with medium confidence
      for (const email of patterns) {
        allCandidates.push({
          email,
          source: `Mønster-gæt baseret på ${domain}`,
          confidence: 0.4,
        });
      }
    }
  }

  // ── Strategy 3: Targeted web search for person's email ──
  emit({
    step: "search_email",
    message: `Søger specifikt efter email til ${personName}...`,
  });

  const emailSearchQueries = buildEmailSearchQueries(personName, companyName, domain);

  for (const query of emailSearchQueries) {
    emit({
      step: "search_email_query",
      message: `Søger: "${query.substring(0, 50)}..."`,
    });

    const results = await searchGoogle(query, 5);

    for (const result of results) {
      // Extract emails from search snippets
      const snippetEmails = extractEmailsFromText(result.snippet + " " + result.title);
      for (const email of snippetEmails) {
        if (!isJunkEmail(email)) {
          allCandidates.push({
            email,
            source: `Websøgning: "${query.substring(0, 40)}..."`,
            confidence: isGenericEmail(email) ? 0.5 : 0.7,
          });
        }
      }

      // If this looks like a contact page, scrape it
      if (
        result.title.toLowerCase().match(/kontakt|contact|team|bestyrelse|ledelse|about|om os/) ||
        result.url.match(/kontakt|contact|team|board|about|om-os/i)
      ) {
        emit({
          step: "scrape_contact",
          message: `Scraper kontaktside: ${result.url.substring(0, 60)}...`,
        });

        const scraped = await scrapeWebsite(result.url);
        if (scraped) {
          for (const email of scraped.emails) {
            if (!isJunkEmail(email)) {
              allCandidates.push({
                email,
                source: `Scrapet fra: ${new URL(result.url).hostname}`,
                confidence: isGenericEmail(email) ? 0.5 : 0.75,
              });
            }
          }
        }
      }
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 400));
  }

  // ── Strategy 4: Deep scrape company website if we have a valid domain ──
  if (isValidDomain(domain) && !FREE_EMAIL_DOMAINS.has(domain)) {
    emit({
      step: "deep_scrape",
      message: `Dyb-scraper firma-website: ${domain}`,
    });

    const companyUrl = `https://www.${domain}`;
    const contactUrls = [
      companyUrl,
      `${companyUrl}/kontakt`,
      `${companyUrl}/contact`,
      `${companyUrl}/om-os`,
      `${companyUrl}/about`,
      `${companyUrl}/team`,
      `${companyUrl}/bestyrelse`,
      `${companyUrl}/medarbejdere`,
    ];

    for (const url of contactUrls) {
      try {
        const scraped = await scrapeWebsite(url);
        if (scraped && scraped.emails.length > 0) {
          emit({
            step: "deep_scrape_result",
            message: `Fandt ${scraped.emails.length} emails på ${url}`,
            detail: scraped.emails.join(", "),
          });

          for (const email of scraped.emails) {
            if (!isJunkEmail(email)) {
              // Check if email matches person name
              const nameMatch = doesEmailMatchName(email, personName);
              allCandidates.push({
                email,
                source: `Firma-website: ${url}`,
                confidence: nameMatch ? 0.9 : isGenericEmail(email) ? 0.5 : 0.65,
              });
            }
          }
        }
      } catch { /* continue */ }
    }
  }

  // ── Strategy 5: Search for person name + "@" specifically ──
  if (personName && isValidDomain(domain)) {
    emit({
      step: "at_search",
      message: `Søger efter "${personName}" med @${domain}...`,
    });

    const atQuery = `"${personName}" "@${domain}"`;
    const atResults = await searchGoogle(atQuery, 5);
    for (const result of atResults) {
      const emails = extractEmailsFromText(result.snippet + " " + result.title);
      for (const email of emails) {
        if (!isJunkEmail(email) && email.endsWith(`@${domain}`)) {
          const nameMatch = doesEmailMatchName(email, personName);
          allCandidates.push({
            email,
            source: `@-søgning match`,
            confidence: nameMatch ? 0.9 : 0.7,
          });
        }
      }
    }
  }

  // ── Deduplicate and rank candidates ──
  const deduped = deduplicateCandidates(allCandidates);

  // Boost confidence for candidates that match the person's name
  for (const candidate of deduped) {
    if (doesEmailMatchName(candidate.email, personName)) {
      candidate.confidence = Math.min(candidate.confidence + 0.15, 1.0);
    }
    // Boost for company domain match
    if (domain && candidate.email.endsWith(`@${domain}`)) {
      candidate.confidence = Math.min(candidate.confidence + 0.1, 1.0);
    }
  }

  // Sort by confidence
  deduped.sort((a, b) => b.confidence - a.confidence);

  // Pick the best
  const best = deduped[0] || null;

  if (best) {
    emit({
      step: "found",
      message: `Email fundet: ${best.email} (${Math.round(best.confidence * 100)}% konfidens)`,
      detail: `Kilde: ${best.source}\nAlle kandidater: ${deduped.length}`,
    });
  } else {
    emit({
      step: "not_found",
      message: `Ingen email fundet for ${personName}`,
      detail: `Prøvede ${emailSearchQueries.length} søgninger og ${domain ? "dyb-scraping af " + domain : "ingen domæne fundet"}`,
    });
  }

  return {
    email: best?.email || null,
    source: best?.source || "none",
    confidence: best?.confidence || 0,
    allCandidates: deduped,
    strategy: best ? determineStrategy(best.source) : "none",
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function buildEmailSearchQueries(
  personName: string,
  companyName?: string,
  domain?: string | null
): string[] {
  const queries: string[] = [];

  // Direct person email search
  queries.push(`"${personName}" email`);

  if (companyName) {
    queries.push(`"${personName}" "${companyName}" email kontakt`);
    queries.push(`"${personName}" "${companyName}" mail`);
  }

  if (domain) {
    queries.push(`"${personName}" "@${domain}"`);
    queries.push(`site:${domain} "${personName}"`);
  }

  // Danish-specific searches
  if (companyName) {
    queries.push(`"${companyName}" bestyrelse kontakt email`);
    queries.push(`"${companyName}" direktion ledelse kontakt`);
  }

  return queries.slice(0, 6); // Max 6 queries
}

function extractEmailsFromText(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex) || [];
  return [...new Set(matches)].filter((e) => e.length < 60);
}

function doesEmailMatchName(email: string, fullName: string): boolean {
  const local = email.split("@")[0].toLowerCase();
  const parts = fullName.trim().toLowerCase().split(/\s+/);

  if (parts.length < 2) return false;

  const first = normalizeForEmail(parts[0]);
  const last = normalizeForEmail(parts[parts.length - 1]);

  if (!first || !last) return false;

  // Check various patterns
  return (
    local.includes(first) ||
    local.includes(last) ||
    local === `${first}.${last}` ||
    local === `${first[0]}.${last}` ||
    local === `${first[0]}${last}` ||
    local === `${first}${last}` ||
    local === `${first}-${last}` ||
    local === `${first}${last[0]}`
  );
}

function deduplicateCandidates(candidates: EmailCandidate[]): EmailCandidate[] {
  const map = new Map<string, EmailCandidate>();

  for (const c of candidates) {
    const key = c.email.toLowerCase();
    const existing = map.get(key);

    if (!existing || c.confidence > existing.confidence) {
      map.set(key, c);
    }
  }

  return Array.from(map.values());
}

function determineStrategy(source: string): string {
  if (source.includes("Firma-website")) return "deep_scrape";
  if (source.includes("@-søgning")) return "at_search";
  if (source.includes("Websøgning")) return "targeted_search";
  if (source.includes("Scrapet")) return "contact_scrape";
  if (source.includes("Mønster")) return "pattern_guess";
  return "unknown";
}
