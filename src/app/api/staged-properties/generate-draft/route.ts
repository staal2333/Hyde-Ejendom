// ============================================================
// POST /api/staged-properties/generate-draft
// Generate email draft for researched staging entries (internal only, no HubSpot).
// Body: { ids: string[] }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getStagedProperty, updateStagedProperty } from "@/lib/staging/store";
import { generateEmailDraft } from "@/lib/llm";
import type { Property, Contact, ResearchAnalysis } from "@/types";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const ids = body.ids;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 }
      );
    }

    if (ids.length > 50) {
      return NextResponse.json(
        { error: "Max 50 ids per request" },
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

        if (staged.stage !== "researched" && staged.stage !== "approved") {
          results.push({ id, success: false, error: `Stage er "${staged.stage}" – kun "researched"/"approved" kan få genereret mail-udkast` });
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

        // Allow draft generation even without a specific contact — use owner company as fallback
        // Prefer explicit contactPerson/contactEmail fields; fall back to enriched contacts[0]
        const primaryContact = (staged.contacts as Array<{name?: string; email?: string | null; phone?: string | null}> | undefined)?.[0];
        const contact: Contact = {
          fullName: staged.contactPerson || primaryContact?.name || null,
          email: staged.contactEmail || primaryContact?.email || null,
          phone: staged.contactPhone || primaryContact?.phone || null,
          role: "ejer",
          source: "staging",
          confidence: (staged.contactEmail || primaryContact?.email) ? 0.8 : 0.3,
        };

        const analysis: ResearchAnalysis = {
          ownerCompanyName: staged.ownerCompany || "Ukendt ejer",
          ownerCompanyCvr: staged.ownerCvr || null,
          companyDomain: null,
          companyWebsite: null,
          recommendedContacts: [contact],
          outdoorPotentialScore: staged.outdoorScore ?? 5,
          keyInsights: staged.researchSummary || "Research gennemført.",
          evidenceChain: staged.researchReasoning || "",
          dataQuality: (staged.dataQuality as "high" | "medium" | "low") || "medium",
          dataQualityReason: "Fra staging",
        };

        const draft = await generateEmailDraft(property, contact, analysis);

        await updateStagedProperty(id, {
          emailDraftSubject: draft.subject,
          emailDraftBody: draft.bodyText,
          emailDraftNote: draft.shortInternalNote,
          ...(staged.stage === "researched" ? { stage: "approved" as const } : {}),
        });

        results.push({ id, success: true });
      } catch (e) {
        logger.error(`Failed for ${id}`, { service: "staged-properties-generate-draft" });
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
    logger.error("Generate draft error", { service: "staged-properties-generate-draft" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
