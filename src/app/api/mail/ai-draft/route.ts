// ============================================================
// POST /api/mail/ai-draft
// Generates an AI reply draft based on email thread context
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { config } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subject, from, snippet, messages, fromAccount, fromName } = body;

    if (!subject && !snippet) {
      return NextResponse.json({ error: "Mangler email-indhold" }, { status: 400 });
    }

    const OpenAI = (await import("openai")).default;
    const openai = new OpenAI({ apiKey: config.openai.apiKey() });

    // Build conversation context from messages array if available
    const conversationContext = messages && messages.length > 0
      ? messages.map((m: { from: string; bodyPlain: string; date: string }) =>
          `[${m.date}] Fra: ${m.from}\n${m.bodyPlain?.slice(0, 600) || "(ingen tekst)"}`
        ).join("\n\n---\n\n")
      : `Fra: ${from}\nEmne: ${subject}\n\n${snippet}`;

    const senderName = fromName || fromAccount?.split("@")[0] || "Sebastian";

    const prompt = `Du er ${senderName} fra Hyde Media – et dansk udendørs reklame- og markedsføringsbureau.

Du skal skrive et kortfattet, professionelt og venligt svar på denne email-tråd.

EMAILTRÅD:
${conversationContext}

INSTRUKTIONER:
- Skriv på dansk
- Vær personlig men professionel
- Svar direkte og konkret på det der er skrevet
- Brug kortere sætninger
- Max 3-5 korte afsnit
- Slut altid med "Venlig hilsen,\n${senderName}\nHyde Media"
- Undgå buzzwords og tomme floskler
- Hvis det drejer sig om et tilbud, møde eller konkret sag – adresser det direkte

Skriv KUN svaret – ingen forklaringer eller kommentarer.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0.7,
    });

    const draft = completion.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({ draft });
  } catch (error) {
    logger.error(`[ai-draft] Failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke generere udkast" },
      { status: 500 }
    );
  }
}
