// ============================================================
// POST /api/leads/:id/approve
// Marks a lead candidate as approved (optionally syncs to HubSpot)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getCandidateById, updateCandidate } from "@/lib/leads/candidate-store";
import { createLeadContact, createLeadCompany, associateContactToCompany, findContactByEmail } from "@/lib/hubspot";
import { logger } from "@/lib/logger";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    companyName?: string;
    jobTitle?: string;
    phone?: string;
    syncNow?: boolean; // if true, approve + sync to HubSpot in one call
  };

  const candidate = await getCandidateById(id);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  // If syncNow, do approve + HubSpot create in one step
  if (body.syncNow) {
    try {
      let hubspotCompanyId: string | null = candidate.hubspot_company_id;
      const companyName = body.companyName ?? candidate.company_name;

      // Check for existing HubSpot contact before creating a duplicate
      let existingContact: { id: string } | null = null;
      if (candidate.email) {
        existingContact = await findContactByEmail(candidate.email).catch(() => null);
        if (existingContact) {
          logger.info(`[leads/approve] Contact already exists in HubSpot: ${existingContact.id}`);
        }
      }

      if (!hubspotCompanyId && companyName) {
        try {
          hubspotCompanyId = await createLeadCompany({
            name: companyName,
            domain: candidate.domain ?? undefined,
          });
        } catch (e) {
          logger.warn(`[leads/approve] Company create skipped: ${e instanceof Error ? e.message : e}`);
        }
      }

      const createdContactId = existingContact?.id ?? await createLeadContact({
        email: candidate.email,
        firstname: candidate.first_name ?? undefined,
        lastname: candidate.last_name ?? undefined,
        phone: body.phone ?? candidate.phone ?? undefined,
        jobtitle: body.jobTitle ?? candidate.job_title ?? undefined,
        companyId: hubspotCompanyId ?? undefined,
      });
      const hubspotContactId = createdContactId;

      if (hubspotContactId && hubspotCompanyId) {
        await associateContactToCompany(hubspotContactId, hubspotCompanyId).catch(() => {});
      }

      const updated = await updateCandidate(id, {
        status: "synced",
        approved_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
        hubspot_contact_id: hubspotContactId,
        hubspot_company_id: hubspotCompanyId,
        ...(companyName ? { company_name: companyName } : {}),
        ...(body.jobTitle ? { job_title: body.jobTitle } : {}),
        ...(body.phone ? { phone: body.phone } : {}),
      });

      return NextResponse.json({
        candidate: updated,
        hubspotContactId,
        hubspotCompanyId,
        existedInHubSpot: !!existingContact,
        hubspotUrl: `https://app.hubspot.com/contacts/${hubspotContactId}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[leads/approve+sync] Failed: ${msg}`);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Standard approve only
  const updated = await updateCandidate(id, {
    status: "approved",
    approved_at: new Date().toISOString(),
    ...(body.companyName ? { company_name: body.companyName } : {}),
    ...(body.jobTitle ? { job_title: body.jobTitle } : {}),
    ...(body.phone ? { phone: body.phone } : {}),
  });

  return NextResponse.json({ candidate: updated });
}
