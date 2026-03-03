import { NextRequest, NextResponse } from "next/server";
import { scoreLeadForPlacements, generateLeadIntelSummary, type LeadScore } from "@/lib/agents/lead-intel-agent";
import { listPlacements } from "@/lib/tilbud/placement-store";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      leads: {
        companyName: string;
        industry?: string;
        city?: string;
        estimatedAdSpend?: number;
        adPlatforms?: string[];
        employeeCount?: number;
      }[];
    };

    if (!body.leads?.length) {
      return NextResponse.json({ error: "leads array required" }, { status: 400 });
    }

    const placementResult = await listPlacements();
    const placements = placementResult.items;

    const scores: LeadScore[] = body.leads.map((lead) =>
      scoreLeadForPlacements(lead, placements)
    );

    scores.sort((a, b) => b.score - a.score);

    const summary = await generateLeadIntelSummary(scores);

    return NextResponse.json({ success: true, leads: scores, summary });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
