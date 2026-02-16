// ============================================================
// GET /api/raw-research – Debug endpoint for raw research data
// Returns stored ResearchData per property for debugging
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getRawResearch, getAllRawResearch } from "@/lib/workflow/engine";

export async function GET(req: NextRequest) {
  try {
    const propertyId = req.nextUrl.searchParams.get("propertyId");

    if (propertyId) {
      // Get raw research for a specific property
      const data = getRawResearch(propertyId);
      if (!data) {
        return NextResponse.json(
          { error: "No raw research data found for this property" },
          { status: 404 }
        );
      }
      return NextResponse.json({
        propertyId,
        timestamp: data.timestamp,
        corrections: data.corrections,
        research: {
          hasOis: !!data.research.oisData,
          oisOwners: data.research.oisData?.owners.map(o => o.name) || [],
          oisAdmins: data.research.oisData?.administrators.map(a => a.name) || [],
          oisEjerforhold: data.research.oisData?.ejerforholdstekst || null,
          oisKommune: data.research.oisData?.kommune || null,
          hasCvr: !!data.research.cvrData,
          cvrName: data.research.cvrData?.companyName || null,
          cvrAddress: data.research.cvrData?.address || null,
          cvrEmail: data.research.cvrData?.email || null,
          cvrWebsite: data.research.cvrData?.website || null,
          hasBbr: !!data.research.bbrData,
          bbrArea: data.research.bbrData?.area || null,
          bbrUsage: data.research.bbrData?.usage || null,
          searchResultCount: data.research.companySearchResults.length,
          websiteEmails: data.research.websiteContent?.emails || [],
          websitePhones: data.research.websiteContent?.phones || [],
        },
      });
    }

    // List all stored raw research entries
    const all = getAllRawResearch();
    return NextResponse.json({
      total: all.length,
      entries: all.map(e => ({
        propertyId: e.propertyId,
        timestamp: e.timestamp,
        corrections: e.corrections.length,
        hasOis: !!e.research.oisData,
        hasCvr: !!e.research.cvrData,
        emails: e.research.websiteContent?.emails.length || 0,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
