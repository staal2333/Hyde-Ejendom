// ============================================================
// POST /api/mail/send-reply – Send reply in thread (rate-limited)
// Body: { threadId, to, subject, body, propertyId, contactName? }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { sendReply } from "@/lib/email-sender";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threadId, to, subject, body: emailBody, propertyId, contactName } = body;

    if (!threadId || !to || !subject || emailBody == null || !propertyId) {
      return NextResponse.json(
        { error: "threadId, to, subject, body og propertyId er påkrævet" },
        { status: 400 }
      );
    }

    const result = await sendReply({
      threadId,
      to,
      subject: String(subject),
      body: String(emailBody),
      propertyId,
      contactName: contactName ? String(contactName) : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (error) {
    console.error("[API] Send reply failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke sende svar" },
      { status: 500 }
    );
  }
}
