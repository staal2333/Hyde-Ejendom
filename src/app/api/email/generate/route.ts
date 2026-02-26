// POST /api/email/generate
// AI generates a personalized OOH sales email for a lead

import { NextRequest, NextResponse } from "next/server";
import { composeEmail, type ComposeEmailInput } from "@/lib/email/ai-composer";
import { buildEmailFromTemplate, type EmailTemplateType } from "@/lib/email/templates";
import { config } from "@/lib/config";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      type = "cold",
      companyName,
      industry,
      oohReason,
      platforms,
      adCount,
      egenkapital,
      omsaetning,
      address,
      recipientName,
      recipientRole,
      toneOfVoice,
      previousSubject,
      customContext,
    } = body;

    if (!companyName) {
      return NextResponse.json({ error: "companyName er påkrævet" }, { status: 400 });
    }

    const senderName = config.smtp.fromName.split(/[–\-]/)[0].trim();
    const senderEmail = config.smtp.fromEmail();
    const senderCompany = "Hyde Media";
    const senderTitle = "OOH Specialist";

    const input: ComposeEmailInput = {
      type: type as EmailTemplateType,
      companyName,
      industry,
      oohReason,
      platforms: Array.isArray(platforms) ? platforms : [],
      adCount: adCount ? Number(adCount) : undefined,
      egenkapital: egenkapital ? Number(egenkapital) : null,
      omsaetning: omsaetning ? Number(omsaetning) : null,
      address,
      recipientName,
      recipientRole,
      senderName,
      senderEmail,
      senderTitle,
      senderCompany,
      senderPhone: undefined,
      toneOfVoice,
      previousSubject,
      customContext,
    };

    const composed = await composeEmail(input);

    // Build the full HTML with template wrapper
    const html = buildEmailFromTemplate(type as EmailTemplateType, {
      recipientName: (recipientName || "").split(" ")[0] || "der",
      companyName,
      senderName,
      senderTitle,
      senderCompany,
      senderEmail,
      bodyText: composed.bodyHtml,
      subject: composed.subject,
    });

    return NextResponse.json({
      subject: composed.subject,
      html,
      text: composed.bodyText,
      type,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
