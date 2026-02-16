// ============================================================
// POST /api/ooh/agent/follow-up
//
// Auto Follow-up Agent: Checks all due follow-ups and generates
// personalized follow-up email drafts. Does NOT send them
// automatically — they go into an approval queue.
// ============================================================

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getDueFollowUps, getContact, getCampaign } from "@/lib/ooh/store";

export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });
    const dueFollowUps = await getDueFollowUps();

    if (dueFollowUps.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Ingen forfaldne opfølgninger",
        drafts: [],
      });
    }

    const drafts: {
      sendId: string;
      contactName: string;
      contactEmail: string;
      followUpNumber: number;
      subject: string;
      body: string;
    }[] = [];

    for (const send of dueFollowUps) {
      const contact = send.contactId ? await getContact(send.contactId) : null;
      const campaign = send.campaignId ? await getCampaign(send.campaignId) : null;

      const followUpNum = send.followUpCount + 1;
      const daysSinceSent = send.sentAt
        ? Math.floor((Date.now() - new Date(send.sentAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      try {
        const response = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Du er en dansk sælger der skriver opfølgningsmails for OOH-reklame.

REGLER:
- Opfølgning #${followUpNum}: ${followUpNum === 1 ? "Venlig og uformel" : followUpNum === 2 ? "Lidt mere direkte" : "Kort og konkret, sidste forsøg"}
- Max 80 ord
- Referer til den tidligere henvendelse
- Giv en ny vinkel eller fordel
- Klart call-to-action
- ${followUpNum >= 3 ? "Nævn at dette er sidste opfølgning" : ""}

Svar i valid JSON: {"subject": "...", "body": "..."}`,
            },
            {
              role: "user",
              content: `Skriv opfølgning #${followUpNum} til:
- Navn: ${contact?.name || send.contactName || "Ukendt"}
- Virksomhed: ${contact?.company || send.contactCompany || "Ukendt"}
- Branche: ${contact?.industry || "Ukendt"}
- Original kampagne: ${campaign?.name || "OOH-oplæg"}
- Dage siden sendt: ${daysSinceSent}`,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 500,
        });

        const content = response.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          drafts.push({
            sendId: send.id,
            contactName: contact?.name || send.contactName || "Ukendt",
            contactEmail: send.contactEmail || contact?.email || "",
            followUpNumber: followUpNum,
            subject: parsed.subject || `Opfølgning: ${campaign?.emailSubject || "OOH-oplæg"}`,
            body: parsed.body || "",
          });
        }
      } catch (err) {
        console.error(`[agent/follow-up] Error drafting for send ${send.id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      totalDue: dueFollowUps.length,
      draftsGenerated: drafts.length,
      drafts,
    });
  } catch (error) {
    console.error("[agent/follow-up] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
