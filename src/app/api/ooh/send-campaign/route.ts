// ============================================================
// POST /api/ooh/send-campaign
//
// Executes a campaign: for each contact, generates a presentation
// PDF, sends email with attachment, and records the send.
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import {
  getCampaign,
  upsertCampaign,
  getContact,
  upsertContact,
  upsertSend,
  getFrame,
  getCreative,
  getPresentationTemplate,
} from "@/lib/ooh/store";
import { sendEmail } from "@/lib/email-sender";
import { PDFDocument } from "pdf-lib";
import { compositeMultiplePlacements } from "@/lib/ooh/image-processor";
import { loadImageBuffer } from "@/lib/ooh/load-image";
import type { OOHSend } from "@/lib/ooh/types";
import { syncToHubSpot } from "@/lib/ooh/hubspot-sync";

const FOLLOW_UP_DAYS = 5;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaignId } = body as { campaignId: string };

    if (!campaignId) {
      return NextResponse.json({ error: "Missing campaignId" }, { status: 400 });
    }

    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (campaign.status !== "draft" && campaign.status !== "active") {
      return NextResponse.json(
        { error: `Campaign status is '${campaign.status}', cannot send` },
        { status: 400 }
      );
    }

    if (!campaign.contactIds.length) {
      return NextResponse.json({ error: "No contacts in campaign" }, { status: 400 });
    }
    if (!campaign.creativeId) {
      return NextResponse.json({ error: "No creative assigned to campaign" }, { status: 400 });
    }
    if (!campaign.emailSubject || !campaign.emailBody) {
      return NextResponse.json({ error: "Email subject and body required" }, { status: 400 });
    }

    const creative = await getCreative(campaign.creativeId);
    if (!creative) {
      return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    }

    // Load frames for mockup generation
    const frameList = [];
    for (const fid of campaign.frameIds) {
      const f = await getFrame(fid);
      if (f) frameList.push(f);
    }

    // Load template if assigned
    const template = campaign.templateId
      ? await getPresentationTemplate(campaign.templateId)
      : null;

    // Generate a single PDF to attach to all contacts (same creative+frames)
    let pdfBase64: string | null = null;
    let pdfFilename = "oplaeg.pdf";

    if (template && frameList.length > 0) {
      // Generate mockups and compose PDF
      const templatePdfBuf = await loadImageBuffer(template.pdfFileUrl);
      const pdfDoc = await PDFDocument.load(templatePdfBuf);

      for (const page of template.pages) {
        if (page.pageIndex >= pdfDoc.getPageCount()) continue;
        const pdfPage = pdfDoc.getPage(page.pageIndex);

        for (const slot of page.imageSlots) {
          // Find a matching frame for this slot
          const matchFrame = slot.linkedFrameId
            ? frameList.find((f) => f.id === slot.linkedFrameId)
            : frameList[0];
          if (!matchFrame) continue;

          try {
            const frameImgBuf = await loadImageBuffer(matchFrame.frameImageUrl);
            const creativeImgBuf = await loadImageBuffer(
              creative.thumbnailUrl || creative.filename
            );

            const placements = matchFrame.placements?.length > 0 ? matchFrame.placements : [matchFrame.placement];
            const assignments = placements.map(p => ({ placement: p, creativeBuffer: creativeImgBuf }));
            const mockupPng = await compositeMultiplePlacements(
              frameImgBuf, assignments, matchFrame.frameWidth, matchFrame.frameHeight
            );

            const embeddedImg = await pdfDoc.embedPng(mockupPng);
            const pageHeight = pdfPage.getHeight();
            const objectFit = slot.objectFit || "cover";

            let drawX = slot.x;
            let drawY = pageHeight - slot.y - slot.height;
            let drawW = slot.width;
            let drawH = slot.height;

            if (objectFit === "contain") {
              const imgAspect = embeddedImg.width / embeddedImg.height;
              const slotAspect = slot.width / slot.height;
              if (imgAspect > slotAspect) {
                drawH = slot.width / imgAspect;
                drawY += (slot.height - drawH) / 2;
              } else {
                drawW = slot.height * imgAspect;
                drawX += (slot.width - drawW) / 2;
              }
            }

            pdfPage.drawImage(embeddedImg, {
              x: drawX,
              y: drawY,
              width: drawW,
              height: drawH,
            });
          } catch (err) {
            console.error(`[send-campaign] Mockup error for slot ${slot.id}:`, err);
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      pdfBase64 = Buffer.from(pdfBytes).toString("base64");
      pdfFilename = `${campaign.name.replace(/[^a-zA-Z0-9æøåÆØÅ ]/g, "")}.pdf`;
    }

    // Send to each contact
    const results: { contactId: string; success: boolean; error?: string }[] = [];
    const now = new Date();
    const followUpDate = new Date(now.getTime() + FOLLOW_UP_DAYS * 24 * 60 * 60 * 1000);

    for (const contactId of campaign.contactIds) {
      const contact = await getContact(contactId);
      if (!contact) {
        results.push({ contactId, success: false, error: "Contact not found" });
        continue;
      }

      // Personalize email body (simple template vars)
      const personalizedBody = campaign.emailBody
        .replace(/\{name\}/g, contact.name)
        .replace(/\{company\}/g, contact.company)
        .replace(/\{city\}/g, contact.city || "");

      const personalizedSubject = campaign.emailSubject
        .replace(/\{name\}/g, contact.name)
        .replace(/\{company\}/g, contact.company);

      // Create send record
      const sendId = `send_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const send: OOHSend = {
        id: sendId,
        campaignId: campaign.id,
        contactId: contact.id,
        contactName: contact.name,
        contactEmail: contact.email,
        contactCompany: contact.company,
        status: "sending",
        followUpCount: 0,
        nextFollowUpAt: followUpDate.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      try {
        // Build tracking URLs
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
        const trackingPixelUrl = `${baseUrl}/api/ooh/track/open?sendId=${sendId}`;

        const emailResult = await sendEmail({
          to: contact.email,
          subject: personalizedSubject,
          body: personalizedBody,
          contactName: contact.name,
          propertyId: `ooh-campaign-${campaign.id}`,
          trackingPixelUrl,
          sendId,                   // enables click tracking
          trackingBaseUrl: baseUrl,  // base URL for click tracking redirect
          attachments: pdfBase64
            ? [
                {
                  filename: pdfFilename,
                  mimeType: "application/pdf",
                  content: pdfBase64,
                },
              ]
            : undefined,
        });

        if (emailResult.success) {
          send.status = "sent";
          send.sentAt = new Date().toISOString();
          send.gmailMessageId = emailResult.messageId;
          send.gmailThreadId = emailResult.threadId;
          results.push({ contactId, success: true });

          // Update contact stats
          contact.lastContactedAt = now.toISOString();
          contact.totalProposalsSent += 1;
          await upsertContact(contact);

          // Sync to HubSpot (non-blocking)
          syncToHubSpot({
            contactEmail: contact.email,
            status: "sent",
            noteBody: `OOH-kampagne "${campaign.name}" sendt med oplæg${pdfBase64 ? " (PDF vedhæftet)" : ""}. Emne: ${personalizedSubject}`,
          }).catch(() => {});
        } else {
          send.status = "error";
          send.errorMessage = emailResult.error;
          results.push({ contactId, success: false, error: emailResult.error });
        }
      } catch (err) {
        send.status = "error";
        send.errorMessage = err instanceof Error ? err.message : String(err);
        results.push({
          contactId,
          success: false,
          error: send.errorMessage,
        });
      }

      await upsertSend(send);
    }

    // Update campaign status
    campaign.status = "active";
    campaign.sentAt = now.toISOString();
    await upsertCampaign(campaign);

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: true,
      campaignId: campaign.id,
      totalContacts: campaign.contactIds.length,
      sent: successCount,
      failed: campaign.contactIds.length - successCount,
      results,
    });
  } catch (error) {
    console.error("[send-campaign] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
