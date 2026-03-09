// ============================================================
// Lead Scanner – noise filter + rule-based lead scorer
// ============================================================

import type { InboxThread } from "@/lib/email-sender";
import type { LeadCandidate, MatchType } from "./candidate-store";

// ─── Constants ──────────────────────────────────────────────

const INTERNAL_DOMAINS = new Set([
  "hydemedia.dk",
  "gmail.com",
  "googlemail.com",
]);

const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "yahoo.dk",
  "icloud.com",
  "me.com",
  "live.dk",
  "live.com",
  "proton.me",
  "protonmail.com",
  "mail.dk",
]);

const NOISE_PREFIXES = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "mailer-daemon",
  "postmaster",
  "bounce",
  "newsletter",
  "notifications",
  "info",
  "support",
  "help",
  "hello",
  "hej",
  "contact",
  "kontakt",
  "admin",
  "billing",
  "invoices",
  "faktura",
  "marketing",
  "news",
]);

const AUTO_REPLY_PATTERNS = [
  /out of office/i,
  /automatic reply/i,
  /auto-reply/i,
  /autosvar/i,
  /abwesenheit/i,
  /je suis absent/i,
  /absence notification/i,
  /vacation notice/i,
  /denne mail er sendt automatisk/i,
  /dette er et autosvar/i,
  /undeliverable/i,
  /delivery status/i,
];

const HIGH_INTENT_KEYWORDS = [
  "tilbud",
  "offer",
  "møde",
  "meeting",
  "samarbejde",
  "samarbejdsforslag",
  "kontrakt",
  "contract",
  "aftale",
  "agreement",
  "accept",
  "confirm",
  "bekræft",
  "interesse",
  "interested",
  "pris",
  "price",
  "quote",
];

const MEDIUM_INTENT_KEYWORDS = [
  "spørgsmål",
  "question",
  "information",
  "info",
  "henvendelse",
  "inquiry",
  "hjælp",
  "help",
  "kontakt",
  "contact",
  "hej",
  "hi",
  "hello",
  "follow up",
  "opfølgning",
];

// ─── Helpers ─────────────────────────────────────────────────

export function extractEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase().trim() : raw.toLowerCase().trim();
}

export function extractName(raw: string): string {
  return raw.replace(/<[^>]+>/, "").replace(/"/g, "").trim();
}

export function extractDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at !== -1 ? email.slice(at + 1).toLowerCase() : "";
}

function splitName(full: string): { first: string | null; last: string | null } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// ─── Noise filter ────────────────────────────────────────────

export function isNoise(thread: InboxThread, internalDomains: Set<string>): boolean {
  // Already filtered by email-sender but double-check
  if (thread.isOutboundOnly) return true;
  if (thread.lastIsFromUs) return true;

  const email = extractEmail(thread.from);
  const domain = extractDomain(email);
  const localPart = email.split("@")[0] ?? "";

  // Internal senders
  if (internalDomains.has(domain)) return true;

  // Noise prefixes
  if (NOISE_PREFIXES.has(localPart)) return true;

  // Auto-reply subjects
  const subject = (thread.subject || "").toLowerCase();
  const snippet = (thread.snippet || "").toLowerCase();
  const combined = `${subject} ${snippet}`;
  if (AUTO_REPLY_PATTERNS.some((p) => p.test(combined))) return true;

  // Very old threads (>90 days)
  if (thread.date) {
    const ageDays = (Date.now() - new Date(thread.date).getTime()) / 86_400_000;
    if (ageDays > 90) return true;
  }

  return false;
}

// ─── Lead scorer ─────────────────────────────────────────────

export interface ScoreResult {
  total: number; // 0–100
  reasons: string[];
}

export function scoreLead(
  thread: InboxThread,
  email: string,
  domain: string,
  opts: {
    domainInHubSpot: boolean;
    companyNameFuzzyMatch: boolean;
  }
): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  // Business domain
  if (!FREEMAIL_DOMAINS.has(domain)) {
    score += 20;
    reasons.push("Virksomhedsdomæne");
  } else {
    score -= 10;
    reasons.push("Freemail-domæne (−10)");
  }

  // Name can be parsed
  const name = extractName(thread.from);
  if (name && name !== email && name.includes(" ")) {
    score += 15;
    reasons.push("Fuldt navn identificeret");
  } else if (name && name !== email) {
    score += 8;
    reasons.push("Navn delvist identificeret");
  } else {
    score -= 10;
    reasons.push("Intet navn fundet (−10)");
  }

  // Recency
  if (thread.date) {
    const ageDays = (Date.now() - new Date(thread.date).getTime()) / 86_400_000;
    if (ageDays < 7) {
      score += 15;
      reasons.push("Mail modtaget inden for 7 dage");
    } else if (ageDays < 30) {
      score += 5;
      reasons.push("Mail modtaget inden for 30 dage");
    }
  }

  // Intent keywords
  const subject = (thread.subject || "").toLowerCase();
  const snippet = (thread.snippet || "").toLowerCase();
  const combined = `${subject} ${snippet}`;

  const highHit = HIGH_INTENT_KEYWORDS.some((k) => combined.includes(k));
  const mediumHit = MEDIUM_INTENT_KEYWORDS.some((k) => combined.includes(k));

  if (highHit) {
    score += 20;
    reasons.push("Høj-intent nøgleord i emne/tekst");
  } else if (mediumHit) {
    score += 10;
    reasons.push("Medium-intent nøgleord i emne/tekst");
  }

  // HubSpot domain match
  if (opts.domainInHubSpot) {
    score += 10;
    reasons.push("Domæne matcher eksisterende HubSpot-virksomhed");
  }

  // Fuzzy company match
  if (opts.companyNameFuzzyMatch) {
    score += 5;
    reasons.push("Virksomhedsnavn matcher HubSpot (fuzzy)");
  }

  return { total: Math.max(0, Math.min(100, score)), reasons };
}

// ─── Priority from score ──────────────────────────────────────

export function scoreToPriority(score: number): "high" | "medium" | "low" {
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

// ─── Build candidate from thread ─────────────────────────────

export function buildCandidate(
  thread: InboxThread,
  scanRunId: string,
  score: ScoreResult,
  opts: {
    hubspotContactFound: boolean;
    hubspotCompanyFound: boolean;
    matchType: MatchType;
    companyName: string | null;
  }
): LeadCandidate {
  const email = extractEmail(thread.from);
  const domain = extractDomain(email);
  const fullName = extractName(thread.from) || null;
  const { first, last } = fullName ? splitName(fullName) : { first: null, last: null };

  const domainAsCompany = domain
    ? domain.replace(/\.[a-z]{2,}$/, "").replace(/-/g, " ")
    : null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email,
    full_name: fullName || null,
    first_name: first,
    last_name: last,
    company_name: opts.companyName ?? (FREEMAIL_DOMAINS.has(domain) ? null : domainAsCompany),
    domain: domain || null,
    job_title: null,
    phone: null,
    thread_id: thread.id,
    source_account: thread.account || "",
    subject: thread.subject || "(intet emne)",
    first_seen_at: thread.date || new Date().toISOString(),
    last_seen_at: thread.date || new Date().toISOString(),
    hubspot_contact_found: opts.hubspotContactFound,
    hubspot_company_found: opts.hubspotCompanyFound,
    match_type: opts.matchType,
    lead_score: score.total,
    score_reasons: score.reasons,
    status: "needs_review",
    rejected_reason: null,
    hubspot_contact_id: null,
    hubspot_company_id: null,
    approved_at: null,
    synced_at: null,
    scan_run_id: scanRunId,
  };
}
