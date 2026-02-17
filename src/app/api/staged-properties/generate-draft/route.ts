// ============================================================
// POST /api/staged-properties/generate-draft
// Generate email draft for researched staging entries (internal only, no HubSpot).
// Body: { ids: string[] }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getStagedProperty, updateStagedProperty } from "@/lib/staging/store";
import { generateEmailDraft } from "@/lib/llm";
import type { Property, Contact, ResearchAnalysis } from "@/types";

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

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        const staged = await getStagedProperty(id);
        if (!staged) {
          results.push({ id, success: false, error: "Not found" });
          continue;
        }

        if (staged.stage !== "researched") {
          results.push({ id, success: false, error: `Stage er "${staged.stage}" – kun "researched" kan få genereret mail-udkast her` });
          continue;
        }

        if (staged.emailDraftSubject && staged.emailDraftBody) {
          results.push({ id, success: true }); // already has draft
          continue;
        }

        if (!staged.contactEmail || !staged.contactEmail.includes("@")) {
          results.push({ id, success: false, error: "Ingen gyldig kontakt-email – kan ikke generere mail" });
          continue;
        }

        const property: Property = {
          id: staged.id,
          name: staged.name,
          address: staged.address,
          postalCode: staged.postalCode || "",
          city: staged.city || "",
          outreachStatus: "RESEARCH_DONE_CONTACT_PENDING",
          outdoorScore: staged.outdoorScore,
          outdoorPotentialNotes: staged.outdoorNotes,
        };

        const contact: Contact = {
          fullName: staged.contactPerson || null,
          email: staged.contactEmail,
          phone: staged.contactPhone || null,
          role: "ejer",
          source: "staging",
          confidence: 0.8,
        };

        const analysis: ResearchAnalysis = {
          ownerCompanyName: staged.ownerCompany || "Ukendt ejer",
          ownerCompanyCvr: staged.ownerCvr || null,
          companyDomain: null,
          companyWebsite: null,
          recommendedContacts: [contact],
          outdoorPotentialScore: staged.outdoorScore ?? 5,
          keyInsights: staged.researchSummary || "Research gennemført.",
          dataQuality: "medium",
          dataQualityReason: "Fra staging",
        };

        const draft = await generateEmailDraft(property, contact, analysis);

        await updateStagedProperty(id, {
          emailDraftSubject: draft.subject,
          emailDraftBody: draft.bodyText,
          emailDraftNote: draft.shortInternalNote,
          stage: "approved",
        });

        results.push({ id, success: true });
      } catch (e) {
        console.error(`[generate-draft] Failed for ${id}:`, e);
        results.push({
          id,
          success: false,
          error: e instanceof Error ? e.message : "Ukendt fejl",
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      ok: true,
      generated: succeeded,
      failed,
      results,
    });
  } catch (error) {
    console.error("[staged-properties/generate-draft] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
