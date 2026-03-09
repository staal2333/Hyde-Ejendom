// ============================================================
// POST /api/leads/scan
// Scans inbox threads and finds leads not in HubSpot
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { listInboxThreads } from "@/lib/email-sender";
import { findContactByEmail, listHubSpotCompanies } from "@/lib/hubspot";
import { getBlocklist, isBlocked } from "@/lib/lead-sourcing/dedupe";
import { saveCandidates } from "@/lib/leads/candidate-store";
import {
  isNoise,
  scoreLead,
  buildCandidate,
  extractEmail,
  extractDomain,
} from "@/lib/leads/scanner";
import type { LeadCandidate } from "@/lib/leads/candidate-store";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export const maxDuration = 300;

// Normalize company name for fuzzy matching
function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(aps|a\/s|as|i\/s|is|ivs|p\/s|smba|k\/s|holding|group|dk|denmark|danmark)\b/g, "")
    .replace(/[^a-zæøå0-9]/g, "")
    .trim();
}

function domainAsCompanyNorm(domain: string): string {
  return normalize(domain.replace(/\.[a-z]{2,}$/, "").replace(/-/g, " "));
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    maxThreads?: number;
    months?: number;
    accounts?: string[];
  };

  const months = Math.min(body.months ?? 12, 24);
  const maxThreads = Math.min(body.maxThreads ?? 2000, 5000);
  const scanRunId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Build Gmail date filter: after:YYYY/MM/DD
  const afterDate = new Date();
  afterDate.setMonth(afterDate.getMonth() - months);
  const afterStr = `${afterDate.getFullYear()}/${String(afterDate.getMonth() + 1).padStart(2, "0")}/${String(afterDate.getDate()).padStart(2, "0")}`;
  const gmailQuery = `after:${afterStr}`;

  logger.info(`[leads/scan] Starting scan run ${scanRunId}, maxThreads=${maxThreads}, query="${gmailQuery}"`);

  // 1. Fetch all threads from the last N months
  const rawThreads = await listInboxThreads(maxThreads, "INBOX", gmailQuery);
  logger.info(`[leads/scan] Fetched ${rawThreads.length} threads`);

  // 2. Build internal domain set
  const internalDomains = new Set(
    config.gmailAccounts.map((a) => extractDomain(a.email))
  );

  // 3. Deduplicate senders — keep newest thread per email
  const senderMap = new Map<string, (typeof rawThreads)[0]>();
  for (const t of rawThreads) {
    const email = extractEmail(t.from);
    if (!email) continue;
    const existing = senderMap.get(email);
    if (!existing || (t.date && (!existing.date || t.date > existing.date))) {
      senderMap.set(email, t);
    }
  }

  logger.info(`[leads/scan] Unique senders: ${senderMap.size}`);

  // 4. Noise filter
  const candidates = [...senderMap.values()].filter(
    (t) => !isNoise(t, internalDomains)
  );

  logger.info(`[leads/scan] After noise filter: ${candidates.length}`);

  // 5. Fetch blocklist + HubSpot companies (once)
  const [blocklist, hubspotCompanies] = await Promise.all([
    getBlocklist().catch(() => ({ domains: new Set<string>(), companyIds: new Set<string>(), companyNames: new Set<string>() })),
    listHubSpotCompanies().catch(() => [] as { id: string; name: string; domain: string | null }[]),
  ]);

  // Build domain → company map for quick lookups
  const domainToCompany = new Map<string, string>();
  const companyNormMap = new Map<string, string>(); // normalized name → display name
  for (const hc of hubspotCompanies) {
    if (hc.domain) domainToCompany.set(hc.domain.toLowerCase().replace(/^www\./, ""), hc.name);
    if (hc.name) companyNormMap.set(normalize(hc.name), hc.name);
  }

  // 6. Check HubSpot for each candidate (in batches of 10 with delay to avoid rate limit)
  const leadCandidates: LeadCandidate[] = [];
  let matched = 0;
  let filtered = 0;

  const BATCH = 10;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (thread) => {
        const email = extractEmail(thread.from);
        const domain = extractDomain(email);

        // Blocklist check
        if (isBlocked(blocklist, domain)) {
          filtered++;
          return;
        }

        // Exact HubSpot contact match
        const hsContact = await findContactByEmail(email).catch(() => null);
        if (hsContact) {
          matched++;
          return;
        }

        // Domain match against HubSpot companies
        const domainMatchCompany = domainToCompany.get(domain) ?? null;
        const hubspotCompanyFound = !!domainMatchCompany;

        // Fuzzy company name match
        const domainNorm = domainAsCompanyNorm(domain);
        const fuzzyMatch = domainNorm.length > 2 && companyNormMap.has(domainNorm);

        // Score the lead
        const score = scoreLead(thread, email, domain, {
          domainInHubSpot: hubspotCompanyFound,
          companyNameFuzzyMatch: fuzzyMatch,
        });

        const candidate = buildCandidate(thread, scanRunId, score, {
          hubspotContactFound: false,
          hubspotCompanyFound,
          matchType: hubspotCompanyFound ? "domain" : fuzzyMatch ? "company_fuzzy" : "none",
          companyName: domainMatchCompany ?? (fuzzyMatch ? companyNormMap.get(domainNorm) ?? null : null),
        });

        leadCandidates.push(candidate);
      })
    );

    if (i + BATCH < candidates.length) {
      await delay(100);
    }
  }

  // 7. Save candidates
  if (leadCandidates.length > 0) {
    await saveCandidates(leadCandidates);
  }

  logger.info(
    `[leads/scan] Done: ${leadCandidates.length} new candidates, ${matched} matched, ${filtered} blocked`
  );

  return NextResponse.json({
    scanRunId,
    total: candidates.length,
    newCandidates: leadCandidates.length,
    matched,
    filtered,
    highPriority: leadCandidates.filter((c) => c.lead_score >= 60).length,
    mediumPriority: leadCandidates.filter((c) => c.lead_score >= 30 && c.lead_score < 60).length,
    lowPriority: leadCandidates.filter((c) => c.lead_score < 30).length,
    scannedFrom: afterStr,
    scannedMonths: months,
  });
}
