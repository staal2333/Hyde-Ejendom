// POST /api/email/send
// Send an email via Gmail SMTP and mark lead/property as contacted

import { NextRequest, NextResponse } from "next/server";
import { sendSmtpEmail, isSmtpConfigured } from "@/lib/email/smtp";
import { logger } from "@/lib/logger";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    if (!isSmtpConfigured()) {
      return NextResponse.json(
        { error: "Gmail SMTP ikke konfigureret. Tilføj SMTP_USER og SMTP_PASSWORD i Vercel settings.", notConfigured: true },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { to, toName, subject, html, text, replyTo, leadId, propertyId } = body;

    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Mangler: to, subject, html" }, { status: 400 });
    }

    if (!to.includes("@")) {
      return NextResponse.json({ error: `Ugyldig email-adresse: ${to}` }, { status: 400 });
    }

    const result = await sendSmtpEmail({ to, toName, subject, html, text, replyTo });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Sending fejlede" }, { status: 500 });
    }

    // Mark lead as contacted if leadId provided
    if (leadId) {
      try {
        const { updateLead } = await import("@/lib/lead-sourcing/lead-store");
        await updateLead(leadId, {
          status: "contacted",
          last_contacted_at: new Date().toISOString(),
        });
      } catch (e) {
        logger.warn(`[email/send] Could not update lead ${leadId}: ${e instanceof Error ? e.message : String(e)}`, { service: "email" });
      }
    }

    logger.info(`[email/send] Sent to ${to} (lead=${leadId || "none"}, property=${propertyId || "none"})`, { service: "email" });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      to,
      subject,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[email/send] Error: ${msg}`, { service: "email" });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET – check if SMTP is configured
export async function GET() {
  return NextResponse.json({
    configured: isSmtpConfigured(),
    fromEmail: isSmtpConfigured() ? process.env.SMTP_USER || "" : null,
  });
}
