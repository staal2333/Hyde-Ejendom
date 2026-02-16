// ============================================================
// POST /api/ooh/agent/match
//
// Client Matcher Agent: Uses AI to match contacts to frames/
// networks based on industry, location, and campaign history.
// Creates a draft campaign with the suggested matches.
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  getContacts,
  getFrames,
  getNetworks,
  getCampaigns,
  getSends,
  upsertCampaign,
} from "@/lib/ooh/store";
import type { OOHCampaign } from "@/lib/ooh/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { context } = body as { context?: string };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    // Gather all available data
    const [allContacts, allFrames, allNetworks, allCampaigns, allSends] = await Promise.all([
      getContacts(),
      getFrames(),
      getNetworks(),
      getCampaigns(),
      getSends(),
    ]);

    if (allContacts.length === 0) {
      return NextResponse.json({ error: "Ingen kontakter tilgængelige. Opret kontakter først." }, { status: 400 });
    }
    if (allFrames.length === 0) {
      return NextResponse.json({ error: "Ingen frames tilgængelige." }, { status: 400 });
    }

    // Build contact history summary
    const contactSummaries = allContacts.map(c => {
      const sentTo = allSends.filter(s => s.contactId === c.id);
      return {
        id: c.id,
        name: c.name,
        company: c.company,
        industry: c.industry || "ukendt",
        city: c.city || "ukendt",
        tags: c.tags,
        totalProposalsSent: c.totalProposalsSent,
        lastContacted: c.lastContactedAt || "aldrig",
        previousSendStatuses: sentTo.map(s => s.status),
      };
    });

    const frameSummaries = allFrames.map(f => ({
      id: f.id,
      name: f.name,
      city: f.locationCity || "ukendt",
      type: f.frameType,
      dailyTraffic: f.dailyTraffic,
    }));

    const networkSummaries = allNetworks.map(n => ({
      id: n.id,
      name: n.name,
      description: n.description,
      frameCount: n.frameIds.length,
    }));

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Du er en intelligent OOH-salgskonsulent der matcher kunder med reklame-placeringer.

OPGAVE:
Analyser kontakter og tilgængelige frames/netværk. Foreslå 1-5 kampagner der matcher kontakter med relevante placeringer.

KRITERIER FOR GOD MATCHING:
- Kontaktens branche og by matcher frame-placering
- Kontakter der ikke har modtaget oplæg for nylig har prioritet
- Kontakter med tags der passer til frame-typen
- Undgå at gentage kampagner til kontakter der har afvist

REGLER:
- Du svarer ALTID i valid JSON
- Foreslå realistiske kampagner baseret på tilgængeligt data
- Max 5 kampagner
- Inkluder en kort begrundelse for hver match

JSON FORMAT:
{
  "campaigns": [
    {
      "name": "Kampagnenavn",
      "reason": "Kort begrundelse for match",
      "contactIds": ["contact_id_1", "contact_id_2"],
      "frameIds": ["frame_id_1"],
      "networkId": "optional_network_id",
      "emailSubject": "Foreslået email-emne",
      "emailBody": "Foreslået email-tekst (max 150 ord, dansk)"
    }
  ]
}`,
        },
        {
          role: "user",
          content: `## Tilgængelige kontakter
${JSON.stringify(contactSummaries, null, 2)}

## Tilgængelige frames
${JSON.stringify(frameSummaries, null, 2)}

## Netværk
${JSON.stringify(networkSummaries, null, 2)}

## Eksisterende kampagner (for at undgå gentagelse)
${allCampaigns.map(c => `${c.name} (${c.status}) – kontakter: ${c.contactIds.join(", ")}`).join("\n") || "Ingen"}

${context ? `## Yderligere kontekst fra bruger\n${context}` : ""}

Foreslå de bedste kampagner baseret på denne data.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "AI returned empty response" }, { status: 500 });
    }

    const parsed = JSON.parse(content);
    const suggestedCampaigns = parsed.campaigns || [];

    // Create draft campaigns from AI suggestions
    const createdCampaigns: OOHCampaign[] = [];

    for (const suggestion of suggestedCampaigns) {
      // Validate contact IDs
      const validContactIds = (suggestion.contactIds || []).filter(
        (id: string) => allContacts.some(c => c.id === id)
      );
      // Validate frame IDs
      const validFrameIds = (suggestion.frameIds || []).filter(
        (id: string) => allFrames.some(f => f.id === id)
      );

      if (validContactIds.length === 0 || validFrameIds.length === 0) continue;

      const campaign: OOHCampaign = {
        id: `camp_ai_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: `[AI] ${suggestion.name || "AI-forslag"}`,
        status: "draft",
        networkId: suggestion.networkId || undefined,
        frameIds: validFrameIds,
        contactIds: validContactIds,
        emailSubject: suggestion.emailSubject || "",
        emailBody: suggestion.emailBody || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await upsertCampaign(campaign);
      createdCampaigns.push(campaign);
    }

    return NextResponse.json({
      success: true,
      suggestions: suggestedCampaigns.map((s: Record<string, unknown>, i: number) => ({
        ...s,
        campaignId: createdCampaigns[i]?.id,
      })),
      createdCampaigns: createdCampaigns.length,
    });
  } catch (error) {
    console.error("[agent/match] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
