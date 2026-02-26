// POST /api/research-test
// Test enrichment pipeline on a CVR or company name without running full research.
// Returns raw data from each layer: CVR roles, Proff leadership, website people, emails.

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { lookupCvr } from "@/lib/research/cvr";
import { scrapeProffLeadership } from "@/lib/lead-sourcing/proff";
import { scrapeCompanyWebsite } from "@/lib/research/web-scraper";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cvr, companyName, website } = body as {
      cvr?: string;
      companyName?: string;
      website?: string;
    };

    if (!cvr && !companyName) {
      return apiError(400, "Provide either cvr or companyName");
    }

    const results: Record<string, unknown> = {};
    const timings: Record<string, number> = {};

    // ── 1. CVR lookup ──
    if (cvr || companyName) {
      const t0 = Date.now();
      const query = cvr || companyName!;
      const cvrData = await lookupCvr(query);
      timings.cvr = Date.now() - t0;

      if (cvrData) {
        results.cvr = {
          cvr: cvrData.cvr,
          companyName: cvrData.companyName,
          address: cvrData.address,
          status: cvrData.status,
          type: cvrData.type,
          industry: cvrData.industry,
          employees: cvrData.employees,
          email: cvrData.email,
          phone: cvrData.phone,
          website: cvrData.website,
          owners: cvrData.owners,
          roles: cvrData.roles,
        };
      } else {
        results.cvr = null;
      }
    }

    // ── 2. Proff.dk leadership ──
    const cvrNumber = cvr || (results.cvr as { cvr?: string } | null)?.cvr;
    if (cvrNumber) {
      const t0 = Date.now();
      const proff = await scrapeProffLeadership(cvrNumber);
      timings.proff = Date.now() - t0;
      results.proffLeadership = proff;
    }

    // ── 3. Website scraping ──
    const websiteUrl = website || (results.cvr as { website?: string } | null)?.website;
    if (websiteUrl) {
      const t0 = Date.now();
      const normalizedUrl = websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`;
      try {
        const content = await scrapeCompanyWebsite(normalizedUrl);
        timings.website = Date.now() - t0;
        results.website = {
          url: content?.url,
          emails: content?.emails || [],
          phones: content?.phones || [],
          people: content?.people || [],
          snippetCount: content?.relevantSnippets?.length || 0,
        };
      } catch {
        results.website = { error: "Failed to scrape" };
      }
    }

    // ── Summary ──
    const cvrRoles = (results.cvr as { roles?: unknown[] } | null)?.roles || [];
    const proffPeople = (results.proffLeadership as unknown[]) || [];
    const websitePeople = (results.website as { people?: unknown[] } | null)?.people || [];
    const emails = (results.website as { emails?: string[] } | null)?.emails || [];

    results.summary = {
      totalPeople: (cvrRoles as unknown[]).length + proffPeople.length + websitePeople.length,
      cvrRoles: (cvrRoles as unknown[]).length,
      proffPeople: proffPeople.length,
      websitePeople: websitePeople.length,
      emailsFound: emails.length,
    };

    return NextResponse.json({ ok: true, results, timings });
  } catch (e) {
    return apiError(500, e instanceof Error ? e.message : "Unknown error");
  }
}
