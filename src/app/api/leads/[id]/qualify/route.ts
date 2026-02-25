// POST /api/leads/[id]/qualify – mark lead as qualified and optionally sync to HubSpot

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logger } from "@/lib/logger";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { updateLeadStatus, getLeadById, updateLead } = await import("@/lib/lead-sourcing/lead-store");

    const lead = await getLeadById(id);
    if (!lead) return apiError(404, "Lead not found");

    const updated = await updateLeadStatus(id, "qualified");

    let hubspotId: string | null = null;
    try {
      const { createLeadCompany } = await import("@/lib/hubspot");
      const companyId = await createLeadCompany({
        name: lead.name,
        domain: lead.domain || undefined,
        address: lead.address || undefined,
        website: lead.website || undefined,
        cvr: lead.cvr || undefined,
      });
      if (companyId) {
        hubspotId = companyId;
        await updateLead(id, { hubspot_company_id: companyId });
        logger.info(`[qualify] Created HubSpot company ${companyId} for "${lead.name}"`, { service: "lead-sourcing" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn(`[qualify] HubSpot sync failed for "${lead.name}": ${msg}`, { service: "lead-sourcing" });
    }

    return NextResponse.json({
      lead: updated,
      hubspotId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return apiError(500, msg);
  }
}
