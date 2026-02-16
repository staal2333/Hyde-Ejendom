// ============================================================
// POST /api/staged-properties/approve
// Bulk-approve staged properties → push to HubSpot
// Body: { ids: string[] }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getStagedProperty, updateStagedProperty } from "@/lib/staging/store";
import { createEjendom, upsertContact, saveEmailDraft } from "@/lib/hubspot";
import type { Contact } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = body.ids;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 }
      );
    }

    const results: { id: string; success: boolean; hubspotId?: string; error?: string }[] = [];

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

        // 1. Create the ejendom in HubSpot
        const hubspotId = await createEjendom({
          name: staged.name,
          address: staged.address,
          postalCode: staged.postalCode || "",
          city: staged.city || "",
          outdoorScore: staged.outdoorScore,
          outdoorPotentialNotes: staged.outdoorNotes,
          outreachStatus: staged.contactEmail
            ? "KLAR_TIL_UDSENDELSE"
            : staged.researchSummary
              ? "RESEARCH_DONE_CONTACT_PENDING"
              : "NY_KRAEVER_RESEARCH",
        });

        // 2. If there is contact info, create the contact
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
          } catch (e) {
            console.warn(`[approve] Failed to create contact for ${staged.address}:`, e);
          }
        }

        // 3. If there is an email draft, save it
        if (staged.emailDraftSubject && staged.emailDraftBody) {
          try {
            await saveEmailDraft(
              hubspotId,
              staged.emailDraftSubject,
              staged.emailDraftBody,
              staged.emailDraftNote || ""
            );
          } catch (e) {
            console.warn(`[approve] Failed to save email draft for ${staged.address}:`, e);
          }
        }

        // 4. If there is research data, update the ejendom
        if (staged.ownerCompany || staged.researchSummary) {
          try {
            const { updateEjendomResearch } = await import("@/lib/hubspot");
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
          } catch (e) {
            console.warn(`[approve] Failed to update research for ${staged.address}:`, e);
          }
        }

        // 5. Mark as pushed in staging
        await updateStagedProperty(id, {
          stage: "pushed",
          hubspotId,
        });

        results.push({ id, success: true, hubspotId });
      } catch (e) {
        console.error(`[approve] Failed to approve ${id}:`, e);
        results.push({
          id,
          success: false,
          error: e instanceof Error ? e.message : "Unknown error",
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      ok: true,
      approved: succeeded,
      failed,
      results,
    });
  } catch (error) {
    console.error("[staged-properties/approve] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
