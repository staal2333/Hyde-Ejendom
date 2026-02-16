// ============================================================
// GET /api/cron/ooh-followup
//
// Cron-triggered auto follow-up. Checks for due follow-ups,
// generates AI drafts, and auto-sends them.
// Protected by CRON_SECRET header.
//
// Config (env vars):
//   OOH_MAX_FOLLOW_UPS       – max follow-ups per send (default: 3)
//   OOH_FOLLOW_UP_DAYS       – days between follow-ups (default: 5)
//   OOH_FOLLOW_UP_AUTO_SEND  – "true" to auto-send, else stores drafts (default: "true")
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import {
  getDueFollowUps,
  getSend,
  upsertSend,
  getContact,
  getCampaign,
} from "@/lib/ooh/store";
import { sendEmail } from "@/lib/email-sender";
import OpenAI from "openai";

const MAX_FOLLOW_UPS = parseInt(process.env.OOH_MAX_FOLLOW_UPS || "3", 10);
const FOLLOW_UP_DAYS = parseInt(process.env.OOH_FOLLOW_UP_DAYS || "5", 10);
const AUTO_SEND = process.env.OOH_FOLLOW_UP_AUTO_SEND !== "false"; // default true

export async function GET(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const dueFollowUps = await getDueFollowUps();

    if (dueFollowUps.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No due follow-ups",
        processed: 0,
      });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const openai = apiKey ? new OpenAI({ apiKey }) : null;

    let sent = 0;
    let skipped = 0;
    let drafted = 0;
    let capped = 0;

    for (const send of dueFollowUps) {
      // Skip if max follow-ups reached
      if (send.followUpCount >= MAX_FOLLOW_UPS) {
        capped++;
        // Clear the next follow-up date so it doesn't keep appearing
        send.nextFollowUpAt = undefined;
        await upsertSend(send);
        continue;
      }

      const contact = send.contactId ? await getContact(send.contactId) : null;
      const campaign = send.campaignId ? await getCampaign(send.campaignId) : null;
      const followUpNum = send.followUpCount + 1;
      const daysSinceSent = send.sentAt
        ? Math.floor((Date.now() - new Date(send.sentAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      let subject = `Opfølgning: ${campaign?.emailSubject || "OOH-oplæg"}`;
      let body = `Hej ${contact?.name || send.contactName || ""},\n\nJeg følger op på min tidligere henvendelse vedrørende OOH-reklame.\n\nHar I haft mulighed for at kigge på oplægget?\n\nVenlig hilsen\nHyde Media`;

      // Try AI draft if OpenAI is available
      if (openai) {
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
- ${followUpNum >= MAX_FOLLOW_UPS ? "Nævn at dette er sidste opfølgning" : ""}

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
            subject = parsed.subject || subject;
            body = parsed.body || body;
          }
        } catch (err) {
          console.error(`[cron/ooh-followup] AI draft error for ${send.id}:`, err);
          // Fall back to default text
        }
      }

      if (AUTO_SEND) {
        // Auto-send the follow-up
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        const trackingPixelUrl = baseUrl
          ? `${baseUrl}/api/ooh/track/open?sendId=${send.id}`
          : undefined;

        try {
          const emailResult = await sendEmail({
            to: send.contactEmail!,
            subject,
            body,
            contactName: send.contactName || undefined,
            propertyId: `ooh-followup-cron-${send.campaignId}`,
            trackingPixelUrl,
            sendId: send.id,
            trackingBaseUrl: baseUrl || undefined,
          });

          if (emailResult.success) {
            const now = new Date();
            const nextFollowUp = new Date(
              now.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000
            );

            send.followUpCount = followUpNum;
            send.status = "sent";
            send.sentAt = now.toISOString();
            send.gmailMessageId = emailResult.messageId;
            send.gmailThreadId = emailResult.threadId || send.gmailThreadId;
            // Only schedule next follow-up if under max
            send.nextFollowUpAt =
              followUpNum < MAX_FOLLOW_UPS
                ? nextFollowUp.toISOString()
                : undefined;
            await upsertSend(send);
            sent++;
          } else {
            console.error(`[cron/ooh-followup] Send failed for ${send.id}:`, emailResult.error);
            skipped++;
          }
        } catch (err) {
          console.error(`[cron/ooh-followup] Error sending ${send.id}:`, err);
          skipped++;
        }
      } else {
        // Store draft only (logged for manual approval)
        drafted++;
        console.log(`[cron/ooh-followup] Draft for ${send.id}: ${subject}`);
      }
    }

    return NextResponse.json({
      success: true,
      totalDue: dueFollowUps.length,
      sent,
      drafted,
      skipped,
      capped,
      maxFollowUps: MAX_FOLLOW_UPS,
      followUpDays: FOLLOW_UP_DAYS,
      autoSend: AUTO_SEND,
    });
  } catch (error) {
    console.error("[cron/ooh-followup] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
