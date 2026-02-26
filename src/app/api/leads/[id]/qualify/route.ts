// POST /api/leads/[id]/qualify – mark lead as qualified, enrich contact info, and optionally sync to HubSpot

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

    // Auto-enrich contact info before qualifying
    let enrichment: { contact_email: string | null; contact_phone: string | null; contact_name: string | null; contact_role: string | null; contacts?: { name: string; role: string; email: string | null; phone: string | null; source: string }[] } | null = null;
    if (!lead.contact_email || (lead.contacts || []).length === 0) {
      try {
        const { enrichLeadContact } = await import("@/lib/lead-sourcing/lead-enrichment");
        enrichment = await enrichLeadContact(lead.name, lead.domain, lead.website, lead.cvr);

        const enrichFields: Record<string, unknown> = {};
        if (enrichment.contact_email) enrichFields.contact_email = enrichment.contact_email;
        if (enrichment.contact_phone) enrichFields.contact_phone = enrichment.contact_phone;
        if (enrichment.contacts && enrichment.contacts.length > 0) enrichFields.contacts = JSON.stringify(enrichment.contacts);

        if (Object.keys(enrichFields).length > 0) {
          await updateLead(id, enrichFields);
          logger.info(`[qualify] Enriched "${lead.name}": email=${enrichment.contact_email || "none"}, contacts=${enrichment.contacts?.length || 0}`, { service: "lead-sourcing" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn(`[qualify] Enrichment failed for "${lead.name}": ${msg}`, { service: "lead-sourcing" });
      }
    }

    const updated = await updateLeadStatus(id, "qualified");

    // Generate OOH pitch if not already present
    if (!lead.ooh_pitch) {
      try {
        const { generateOohPitch } = await import("@/lib/llm");
        const pitch = await generateOohPitch({
          name: lead.name,
          industry: lead.industry,
          address: lead.address,
          platforms: lead.platforms || [],
          adCount: lead.ad_count || 0,
          oohReason: lead.ooh_reason,
          egenkapital: lead.egenkapital,
          omsaetning: lead.omsaetning,
          pageCategory: lead.page_category,
        });
        if (pitch) {
          await updateLead(id, { ooh_pitch: pitch });
          logger.info(`[qualify] Generated OOH pitch for "${lead.name}"`, { service: "lead-sourcing" });
        }
      } catch (e) {
        logger.warn(`[qualify] OOH pitch generation failed for "${lead.name}": ${e instanceof Error ? e.message : String(e)}`, { service: "lead-sourcing" });
      }
    }

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

    // Refresh lead data after all updates
    const finalLead = await getLeadById(id);

    return NextResponse.json({
      lead: finalLead || updated,
      hubspotId,
      enrichment: enrichment ? {
        contact_email: enrichment.contact_email,
        contact_phone: enrichment.contact_phone,
        contact_name: enrichment.contact_name,
        contact_role: enrichment.contact_role,
      } : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return apiError(500, msg);
  }
}
