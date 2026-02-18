// ============================================================
// POST /api/mail/reply-draft – AI draft reply for a thread
// Body: { threadId } or { threadId, propertyId }
// Returns: { subject, body, error? }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { config } from "@/lib/config";
import { getThreadWithMessages } from "@/lib/email-sender";
import { getPropertyIdForThread, loadThreadPropertiesFromDb } from "@/lib/mail-threads";
import { fetchEjendomById } from "@/lib/hubspot";

const client = new OpenAI({ apiKey: config.openai.apiKey() });

export type ReplyCategory = "positive_interest" | "rejection" | "question" | "meeting_request" | "unclear";

async function classifyReply(text: string): Promise<ReplyCategory> {
  const lower = text.slice(0, 1500).toLowerCase();
  if (
    /\b(nej|tak nej|ikke interesseret|vi er ikke|afviser|desværre ikke|passer ikke)\b/.test(lower)
  ) return "rejection";
  if (
    /\b(møde|møder|book|kalender|ring|ringe|kalde|samtale|præsentation)\b/.test(lower)
  ) return "meeting_request";
  if (
    /\b(ja|interesseret|lyder godt|gerne|kom gerne|mere info|information|pris|tilbud)\b/.test(lower) ||
    /\?/.test(text.slice(0, 500))
  ) return "question";
  if (
    /\b(ja|super|tak|fint|lyder interessant|kontakt os)\b/.test(lower)
  ) return "positive_interest";
  return "unclear";
}

export async function POST(request: NextRequest) {
  try {
    await loadThreadPropertiesFromDb();
    const body = await request.json();
    const threadId = body?.threadId;
    if (!threadId) {
      return NextResponse.json({ error: "threadId påkrævet" }, { status: 400 });
    }
    const propertyId = body?.propertyId ?? getPropertyIdForThread(threadId);
    const thread = await getThreadWithMessages(threadId);
    if (!thread || thread.messages.length === 0) {
      return NextResponse.json({ error: "Tråd ikke fundet eller tom" }, { status: 404 });
    }

    const lastMessage = thread.messages[thread.messages.length - 1];
    const theirReply = (lastMessage.bodyPlain || lastMessage.snippet || "").trim();
    const ourMessage = thread.messages.find((m) => m !== lastMessage);
    const ourText = ourMessage ? (ourMessage.bodyPlain || ourMessage.snippet || "").trim() : "";

    const category = await classifyReply(theirReply);

    let propertyContext = "";
    if (propertyId) {
      try {
        const prop = await fetchEjendomById(propertyId);
        propertyContext = `Ejendom: ${prop.name || prop.address}, ${prop.city}.`;
        if (prop.ownerCompanyName) propertyContext += ` Ejer/virksomhed: ${prop.ownerCompanyName}.`;
      } catch {
        // ignore
      }
    }

    const subject = thread.subject?.startsWith("Re:")
      ? thread.subject
      : `Re: ${thread.subject || "Din henvendelse"}`;

    const categoryHint =
      category === "rejection"
        ? "Modtageren har sagt nej. Skriv et kort, venligt afsluttende svar (tak for svar, vi ringer ikke igen)."
        : category === "meeting_request"
          ? "Modtageren vil gerne have møde/ringes op. Skriv et kort svar der bekræfter og foreslår næste skridt."
          : category === "positive_interest"
            ? "Modtageren viser interesse. Skriv et kort, varmt svar og tilbyd næste skridt (møde, opfølgning)."
            : category === "question"
              ? "Modtageren stiller spørgsmål eller beder om mere info. Svar kort på spørgsmålene i vores tone."
              : "Svar kort og professionelt i vores tone.";

    const system = `Du er en medarbejder hos Hyde Media / Ejendom AI. Du skriver svar på dansk til ejendomskontakter om udendørs arealer og reklame.

Tone og stil: ${config.toneOfVoice}

${categoryHint}

Vigtigt: Skriv KUN brødteksten til emailen (ingen emnefelt, ingen signatur med navn – det tilføjes i systemet). Hold svaret kort og handlingorienteret.`;

    const user = `Kontekst: ${propertyContext || "Ukendt ejendom."}

${ourText ? `Det vi skrev tidligere:\n---\n${ourText.slice(0, 1500)}\n---\n\n` : ""}Modtagerens svar:
---
${theirReply.slice(0, 3000)}
---

Skriv et kort svar til modtageren i vores tone.`;

    const completion = await client.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const replyBody =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Tak for din henvendelse. Vi vender tilbage med mere information.";

    return NextResponse.json({
      subject,
      body: replyBody,
      category,
    });
  } catch (error) {
    console.error("[API] Reply draft failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Kunne ikke generere udkast",
        subject: "",
        body: "",
      },
      { status: 500 }
    );
  }
}
