// ============================================================
// POST /api/ooh/agent/draft-email
//
// Email Draft Agent: Generates a personalized OOH outreach
// email for a specific contact + frame/network combination.
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getContact, getFrame, getNetwork } from "@/lib/ooh/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactId, frameIds, networkId, tone } = body as {
      contactId: string;
      frameIds?: string[];
      networkId?: string;
      tone?: string;
    };

    if (!contactId) {
      return NextResponse.json({ error: "Missing contactId" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    const contact = await getContact(contactId);
    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Load frames
    const framesToUse: { name: string; city?: string; type: string; traffic?: number }[] = [];
    
    if (networkId) {
      const network = await getNetwork(networkId);
      if (network) {
        for (const fid of network.frameIds) {
          const f = await getFrame(fid);
          if (f) framesToUse.push({ name: f.name, city: f.locationCity, type: f.frameType, traffic: f.dailyTraffic });
        }
      }
    }
    
    if (frameIds?.length) {
      for (const fid of frameIds) {
        const f = await getFrame(fid);
        if (f && !framesToUse.some(ff => ff.name === f.name)) {
          framesToUse.push({ name: f.name, city: f.locationCity, type: f.frameType, traffic: f.dailyTraffic });
        }
      }
    }

    const toneGuide = tone || "Professionel, personlig og direkte. Ingen floskler.";

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Du er en dansk copywriter der skriver outreach-mails for OOH (Out-of-Home) reklame.

TONE OF VOICE: ${toneGuide}

REGLER:
- Max 150 ord i brødteksten
- Start ALDRIG med "Jeg håber denne mail finder dig vel" eller lignende
- Start med noget SPECIFIKT om modtagerens virksomhed/branche
- Nævn konkrete fordele ved placeringen (trafik, beliggenhed, synlighed)
- Afslut med et klart, lavt-forpligtende call-to-action
- Brug modtagerens navn naturligt
- Skriv som et menneske, ikke en robot
- Tilpas til branchen (restaurant, retail, event, etc.)

Du svarer ALTID i valid JSON: {"subject": "...", "body": "...", "internal_note": "..."}`,
        },
        {
          role: "user",
          content: `## Modtager
- Navn: ${contact.name}
- Virksomhed: ${contact.company}
- Branche: ${contact.industry || "Ukendt"}
- By: ${contact.city || "Ukendt"}
- Tags: ${contact.tags.join(", ") || "Ingen"}
- Tidligere oplæg sendt: ${contact.totalProposalsSent}

## OOH-placeringer
${framesToUse.length > 0
  ? framesToUse.map(f => `- ${f.name} (${f.city || "?"}): ${f.type}, ${f.traffic ? f.traffic.toLocaleString() + " daglig trafik" : "trafik ukendt"}`).join("\n")
  : "Ingen specifikke placeringer valgt – skriv en generel OOH-pitch"}

Skriv en personlig outreach-email til denne kontakt.`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "AI returned empty response" }, { status: 500 });
    }

    const parsed = JSON.parse(content);

    return NextResponse.json({
      success: true,
      subject: parsed.subject || "",
      body: parsed.body || parsed.body_text || "",
      internalNote: parsed.internal_note || parsed.internalNote || "",
      contactId,
      contactName: contact.name,
    });
  } catch (error) {
    console.error("[agent/draft-email] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
