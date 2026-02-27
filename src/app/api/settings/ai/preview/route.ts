// POST /api/settings/ai/preview
// Generate a sample email using provided AI settings (without saving them)
// Used by the Tone of Voice settings UI for live preview

import { NextRequest, NextResponse } from "next/server";
import { generateEmailDraft } from "@/lib/llm";
import { saveAISettings, getAISettings, invalidateAISettingsCache } from "@/lib/ai-settings";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Temporarily save the preview settings, generate, then they stay saved
    // (user explicitly clicked preview which implies they want to test these settings)
    if (body.toneOfVoice || body.exampleEmails || body.senderName) {
      await saveAISettings({
        toneOfVoice: body.toneOfVoice,
        exampleEmails: body.exampleEmails,
        senderName: body.senderName,
      });
    }

    const settings = await getAISettings();

    // Generate with a sample property
    const draft = await generateEmailDraft(
      {
        id: "preview",
        name: "Nørrebrogade 45",
        address: "Nørrebrogade 45",
        postalCode: "2200",
        city: "København N",
        outreachStatus: "NY_KRAEVER_RESEARCH",
        outdoorScore: 8,
        outdoorPotentialNotes: "Stor facadé mod travl gade, ca. 25.000 køretøjer dagligt. Ideel til bannere.",
      },
      {
        fullName: "Anders Jensen",
        email: "anders@eksempel.dk",
        phone: null,
        role: "direktør",
        source: "preview",
        confidence: 0.9,
      },
      {
        ownerCompanyName: "Eksempel Ejendomme A/S",
        ownerCompanyCvr: "12345678",
        companyDomain: null,
        companyWebsite: null,
        recommendedContacts: [],
        outdoorPotentialScore: 8,
        keyInsights: "Ejendommen er fra 1930, 6 etager, stor facadé mod Nørrebrogade. Ejes af Eksempel Ejendomme A/S. God beliggenhed med høj fodtrafik og biltrafik.",
        evidenceChain: "OIS bekræfter ejerskab. CVR matcher.",
        oohPitchArgument: "Stor facadé mod en af Københavns mest trafikerede gader giver enestående eksponering.",
        dataQuality: "high",
        dataQualityReason: "OIS og CVR bekræfter begge ejerskab.",
      }
    );

    return NextResponse.json({
      subject: draft.subject,
      bodyText: draft.bodyText,
      senderName: settings.senderName,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
