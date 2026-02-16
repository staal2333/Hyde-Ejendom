// ============================================================
// POST /api/ooh/follow-up
//
// Sends a follow-up email for a specific send record.
// Increments follow_up_count and sets the next follow-up date.
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getSend, upsertSend, getContact, getCampaign } from "@/lib/ooh/store";
import { sendEmail } from "@/lib/email-sender";
import { syncToHubSpot } from "@/lib/ooh/hubspot-sync";

const FOLLOW_UP_DAYS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sendId, emailSubject, emailBody } = body as {
      sendId: string;
      emailSubject?: string;
      emailBody?: string;
    };

    if (!sendId) {
      return NextResponse.json({ error: "Missing sendId" }, { status: 400 });
    }

    const send = await getSend(sendId);
    if (!send) {
      return NextResponse.json({ error: "Send not found" }, { status: 404 });
    }

    if (!send.contactEmail) {
      return NextResponse.json({ error: "No email for this contact" }, { status: 400 });
    }

    // Get the campaign for the original email context
    const campaign = send.campaignId ? await getCampaign(send.campaignId) : null;
    const contact = send.contactId ? await getContact(send.contactId) : null;

    const followUpNum = send.followUpCount + 1;

    // Default follow-up subject/body if not provided
    const subject = emailSubject || 
      `Opfølgning: ${campaign?.emailSubject || "OOH-oplæg"}`.replace(/\{name\}/g, contact?.name || send.contactName || "")
        .replace(/\{company\}/g, contact?.company || send.contactCompany || "");

    const defaultBody = `Hej ${contact?.name || send.contactName || ""},

Jeg følger op på min tidligere henvendelse vedrørende OOH-reklame.

Har I haft mulighed for at kigge på oplægget? Jeg vil meget gerne tage en kort snak om mulighederne.

Venlig hilsen
Hyde Media`;

    const finalBody = emailBody || defaultBody;

    // Build tracking pixel
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const trackingPixelUrl = baseUrl
      ? `${baseUrl}/api/ooh/track/open?sendId=${sendId}`
      : undefined;

    const emailResult = await sendEmail({
      to: send.contactEmail,
      subject,
      body: finalBody,
      contactName: send.contactName || undefined,
      propertyId: `ooh-followup-${send.campaignId}`,
      trackingPixelUrl,
      sendId,                  // enables click tracking
      trackingBaseUrl: baseUrl, // base URL for click tracking redirect
    });

    if (emailResult.success) {
      // Update the send record
      const now = new Date();
      const nextFollowUp = new Date(now.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000);

      send.followUpCount = followUpNum;
      send.nextFollowUpAt = nextFollowUp.toISOString();
      send.status = "sent"; // Reset to sent after follow-up
      send.sentAt = now.toISOString();
      send.gmailMessageId = emailResult.messageId;
      send.gmailThreadId = emailResult.threadId || send.gmailThreadId;
      await upsertSend(send);

      // Sync to HubSpot (non-blocking)
      if (send.contactEmail) {
        syncToHubSpot({
          contactEmail: send.contactEmail,
          status: "sent",
          noteBody: `Opfølgning #${followUpNum} sendt. Emne: ${subject}`,
        }).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        sendId,
        followUpCount: followUpNum,
        nextFollowUpAt: send.nextFollowUpAt,
      });
    } else {
      return NextResponse.json(
        { error: emailResult.error || "Email failed" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[follow-up] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** GET /api/ooh/follow-up – Get all due follow-ups */
export async function GET() {
  try {
    const { getDueFollowUps } = await import("@/lib/ooh/store");
    const due = await getDueFollowUps();
    return NextResponse.json({ followUps: due, count: due.length });
  } catch (error) {
    console.error("[follow-up] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
