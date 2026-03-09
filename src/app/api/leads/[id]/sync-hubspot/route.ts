// ============================================================
// POST /api/leads/:id/sync-hubspot
// Creates contact (+ company) in HubSpot for approved candidate
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  getCandidateById,
  updateCandidate,
} from "@/lib/leads/candidate-store";
import {
  createLeadContact,
  createLeadCompany,
  associateContactToCompany,
} from "@/lib/hubspot";
import { logger } from "@/lib/logger";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const candidate = await getCandidateById(id);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  if (candidate.status === "synced") {
    return NextResponse.json({
      message: "Already synced",
      hubspotContactId: candidate.hubspot_contact_id,
      hubspotCompanyId: candidate.hubspot_company_id,
    });
  }

  try {
    let hubspotCompanyId: string | null = candidate.hubspot_company_id;

    // Create company if we have a name and it's not already in HubSpot
    if (!hubspotCompanyId && candidate.company_name) {
      try {
        hubspotCompanyId = await createLeadCompany({
          name: candidate.company_name,
          domain: candidate.domain ?? undefined,
        });
        logger.info(`[leads/sync] Created HubSpot company ${hubspotCompanyId} for ${candidate.company_name}`);
      } catch (e) {
        // Company might already exist — non-fatal
        logger.warn(`[leads/sync] Could not create company: ${e instanceof Error ? e.message : e}`);
      }
    }

    // Create contact
    const hubspotContactId = await createLeadContact({
      email: candidate.email,
      firstname: candidate.first_name ?? undefined,
      lastname: candidate.last_name ?? undefined,
      phone: candidate.phone ?? undefined,
      jobtitle: candidate.job_title ?? undefined,
      companyId: hubspotCompanyId ?? undefined,
    });

    logger.info(`[leads/sync] Created HubSpot contact ${hubspotContactId} for ${candidate.email}`);

    // Associate contact to company if both exist
    if (hubspotContactId && hubspotCompanyId) {
      try {
        await associateContactToCompany(hubspotContactId, hubspotCompanyId);
      } catch {
        // Non-fatal
      }
    }

    const hubspotUrl = `https://app.hubspot.com/contacts/${hubspotContactId}`;

    const updated = await updateCandidate(id, {
      status: "synced",
      hubspot_contact_id: hubspotContactId,
      hubspot_company_id: hubspotCompanyId,
      synced_at: new Date().toISOString(),
    });

    return NextResponse.json({
      candidate: updated,
      hubspotContactId,
      hubspotCompanyId,
      hubspotUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[leads/sync] Failed: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
