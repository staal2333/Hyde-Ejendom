// ============================================================
// POST /api/send-email – Enqueue email for rate-limited sending
// POST /api/send-email (batch) – Enqueue multiple emails
// GET  /api/send-email – Get queue stats and items
// DELETE /api/send-email – Cancel a queued email
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { enqueueEmail, enqueueBatch, getQueueStats, getQueueItems, cancelQueuedEmail } from "@/lib/email-queue";
import { checkGmailHealth } from "@/lib/email-sender";

/**
 * POST /api/send-email
 * Body: { propertyId: string } or { propertyIds: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Batch mode
    if (body.propertyIds && Array.isArray(body.propertyIds)) {
      const result = await enqueueBatch(body.propertyIds);
      return NextResponse.json({
        success: true,
        ...result,
        stats: getQueueStats(),
      });
    }

    // Single mode
    const { propertyId, attachmentUrl, attachmentFile, subject, body: emailBody, to } = body;
    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400 }
      );
    }

    // PDF attachment: from drag-and-drop (base64) or from URL
    let attachments: { filename: string; mimeType: string; content: string }[] | undefined;
    if (attachmentFile && typeof attachmentFile === "object" && attachmentFile.filename && attachmentFile.content) {
      const name = typeof attachmentFile.filename === "string" ? attachmentFile.filename : "attachment.pdf";
      attachments = [{
        filename: name.endsWith(".pdf") ? name : `${name}.pdf`,
        mimeType: "application/pdf",
        content: String(attachmentFile.content),
      }];
    } else if (attachmentUrl && typeof attachmentUrl === "string") {
      try {
        const pdfRes = await fetch(attachmentUrl.startsWith("/") ? `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}${attachmentUrl}` : attachmentUrl);
        if (pdfRes.ok) {
          const buffer = await pdfRes.arrayBuffer();
          attachments = [{
            filename: "OOH-Proposal.pdf",
            mimeType: "application/pdf",
            content: Buffer.from(buffer).toString("base64"),
          }];
        }
      } catch {
        // Silently skip attachment if fetch fails
      }
    }

    const result = await enqueueEmail(propertyId, {
      ...(attachments ? { attachments } : {}),
      ...(typeof subject === "string" && subject.trim() ? { subject: subject.trim() } : {}),
      ...(typeof emailBody === "string" ? { body: emailBody } : {}),
      ...(typeof to === "string" && to.trim() ? { to: to.trim() } : {}),
    });
    return NextResponse.json({
      ...result,
      stats: getQueueStats(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/send-email – Queue stats + recent items + Gmail health
 */
export async function GET() {
  try {
    const stats = getQueueStats();
    const items = getQueueItems();
    const gmailHealth = await checkGmailHealth();

    return NextResponse.json({
      stats,
      items: items.slice(0, 100),
      gmail: gmailHealth,
    });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/send-email – Cancel a queued email
 * Body: { queueId: string }
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { queueId } = body;

    if (!queueId) {
      return NextResponse.json(
        { error: "queueId is required" },
        { status: 400 }
      );
    }

    const cancelled = cancelQueuedEmail(queueId);
    return NextResponse.json({ success: cancelled });
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
