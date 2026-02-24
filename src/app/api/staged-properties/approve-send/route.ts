// ============================================================
// POST /api/staged-properties/approve-send
// One-click: approve → push to HubSpot → enqueue email
// Body: { ids: string[] }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getStagedProperty, updateStagedProperty } from "@/lib/staging/store";
import { createEjendom, upsertContact, saveEmailDraft, updateEjendomResearch, updateEjendom } from "@/lib/hubspot";
import { enqueueEmail } from "@/lib/email-queue";
import type { Contact } from "@/types";
import { logger } from "@/lib/logger";

interface Result {
  id: string;
  success: boolean;
  hubspotId?: string;
  emailQueued?: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = body.ids;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array is required" }, { status: 400 });
    }

    const results: Result[] = [];

    for (const id of ids) {
      try {
        const staged = await getStagedProperty(id);
        if (!staged) {
          results.push({ id, success: false, error: "Not found" });
          continue;
        }

        if (staged.stage === "pushed") {
          results.push({ id, success: true, hubspotId: staged.hubspotId });
          continue;
        }

        // 1. Create ejendom in HubSpot
        const hubspotId = await createEjendom({
          name: staged.name,
          address: staged.address,
          postalCode: staged.postalCode || "",
          city: staged.city || "",
          outdoorScore: staged.outdoorScore,
          outdoorPotentialNotes: staged.outdoorNotes,
          outreachStatus: staged.contactEmail
            ? "KLAR_TIL_UDSENDELSE"
            : "RESEARCH_DONE_CONTACT_PENDING",
        });

        // 2. Create contact if available
        if (staged.contactPerson || staged.contactEmail) {
          try {
            const contact: Contact = {
              fullName: staged.contactPerson || null,
              email: staged.contactEmail || null,
              phone: staged.contactPhone || null,
              role: "ejer",
              source: "staging",
              relevance: "direct",
              confidence: 0.8,
            };
            await upsertContact(contact, hubspotId);
          } catch {
            logger.warn(`Failed to create contact for ${staged.address}`, { service: "approve-send" });
          }
        }

        // 3. Save email draft in HubSpot
        if (staged.emailDraftSubject && staged.emailDraftBody) {
          try {
            await saveEmailDraft(
              hubspotId,
              staged.emailDraftSubject,
              staged.emailDraftBody,
              staged.emailDraftNote || "",
            );
          } catch {
            logger.warn(`Failed to save email draft for ${staged.address}`, { service: "approve-send" });
          }
        }

        // 4. Update research data in HubSpot
        if (staged.ownerCompany || staged.researchSummary) {
          try {
            await updateEjendomResearch(hubspotId, {
              ownerCompanyName: staged.ownerCompany,
              ownerCompanyCvr: staged.ownerCvr || null,
              outdoorScore: staged.outdoorScore,
              researchSummary: staged.researchSummary,
              researchLinks: staged.researchLinks,
              outreachStatus: staged.contactEmail
                ? "KLAR_TIL_UDSENDELSE"
                : "RESEARCH_DONE_CONTACT_PENDING",
            });
          } catch {
            logger.warn(`Failed to update research for ${staged.address}`, { service: "approve-send" });
          }
        }

        // 5. Mark as pushed in staging
        await updateStagedProperty(id, {
          stage: "pushed",
          hubspotId,
        });

        // 6. Enqueue email if contact email and draft exist
        let emailQueued = false;
        if (staged.contactEmail && staged.emailDraftSubject && staged.emailDraftBody) {
          try {
            await updateEjendom(hubspotId, { outreach_status: "KLAR_TIL_UDSENDELSE" });
            const queueResult = await enqueueEmail(hubspotId, {
              to: staged.contactEmail,
              subject: staged.emailDraftSubject,
              body: staged.emailDraftBody,
            });
            emailQueued = queueResult.success;
            if (!queueResult.success) {
              logger.warn(`Email queue failed for ${staged.address}: ${queueResult.error}`, { service: "approve-send" });
            }
          } catch (e) {
            logger.warn(`Failed to enqueue email for ${staged.address}: ${e}`, { service: "approve-send" });
          }
        }

        results.push({ id, success: true, hubspotId, emailQueued });
      } catch (e) {
        logger.error(`Failed to approve-send ${id}`, { service: "approve-send" });
        results.push({
          id,
          success: false,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    const succeeded = results.filter(r => r.success).length;
    const emailsSent = results.filter(r => r.emailQueued).length;
    const failed = results.filter(r => !r.success).length;

    return NextResponse.json({
      ok: true,
      approved: succeeded,
      emailsQueued: emailsSent,
      failed,
      results,
    });
  } catch (error) {
    logger.error("Approve-send error", { service: "approve-send" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
