// ============================================================
// AI Email Composer – generates personalized OOH sales emails
// Uses lead/contact data to write relevant, specific content
// ============================================================

import OpenAI from "openai";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { defaultSubject, type EmailTemplateType } from "./templates";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: config.openai.apiKey() });
  return _client;
}

export interface ComposeEmailInput {
  type: EmailTemplateType;

  // Lead/company context
  companyName: string;
  industry?: string | null;
  oohReason?: string | null;       // why they're a good OOH fit
  platforms?: string[];            // ["meta", "tiktok"] – existing digital ad activity
  adCount?: number;
  egenkapital?: number | null;
  omsaetning?: number | null;
  address?: string | null;

  // Contact context
  recipientName?: string | null;
  recipientRole?: string | null;

  // Sender context
  senderName: string;
  senderTitle?: string;
  senderCompany?: string;
  senderEmail: string;
  senderPhone?: string;

  // Optional overrides
  toneOfVoice?: string;
  previousSubject?: string;        // for follow-ups
  customContext?: string;          // extra notes from user
}

export interface ComposedEmail {
  subject: string;
  bodyHtml: string;      // HTML paragraphs for template insertion
  bodyText: string;      // plain text version
}

function platformLabel(p: string): string {
  if (p.includes("meta") || p.includes("facebook") || p.includes("instagram")) return "Meta (Facebook/Instagram)";
  if (p.includes("tiktok")) return "TikTok";
  if (p.includes("linkedin")) return "LinkedIn";
  if (p.includes("google") || p.includes("youtube")) return "Google/YouTube";
  return p;
}

function formatMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M kr.`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K kr.`;
  return `${n} kr.`;
}

export async function composeEmail(input: ComposeEmailInput): Promise<ComposedEmail> {
  const client = getClient();

  const tone = input.toneOfVoice || config.toneOfVoice;
  const recipientFirst = (input.recipientName || "").split(" ")[0] || "der";
  const platformList = (input.platforms || []).map(platformLabel).join(", ") || "digitale kanaler";
  const isKnownAdvertiser = (input.platforms?.length || 0) > 0;

  const contextBlocks: string[] = [
    `Virksomhed: ${input.companyName}`,
    input.industry ? `Branche: ${input.industry}` : "",
    input.address ? `Lokation: ${input.address}` : "",
    isKnownAdvertiser
      ? `Digital annoncering: ${platformList} (${input.adCount || "?"} annoncer fundet)`
      : "Ingen kendt digital annoncering",
    input.oohReason ? `OOH-potentiale: ${input.oohReason}` : "",
    input.egenkapital ? `Egenkapital: ${formatMoney(input.egenkapital)}` : "",
    input.omsaetning ? `Omsætning: ${formatMoney(input.omsaetning)}` : "",
    input.recipientName ? `Modtager: ${input.recipientName} (${input.recipientRole || "kontaktperson"})` : "",
    input.customContext ? `Ekstra kontekst: ${input.customContext}` : "",
  ].filter(Boolean);

  const typeInstructions: Record<EmailTemplateType, string> = {
    cold: `Dette er en KOLD henvendelse. 
- Åbn med noget specifikt om virksomheden (ikke generisk)
- Vis at du kender deres digitale annoncering og at OOH er et naturligt næste skridt
- 2-3 korte afsnit MAX
- Afslut med en konkret, lav-friktions CTA (fx "Er det noget I overvejer?" eller "Ville det give mening med en kort snak?")`,

    followup: `Dette er en OPFØLGNING på en tidligere mail (emne: "${input.previousSubject || "OOH-samarbejde"}").
- Gør det kort: 2-4 sætninger
- Ny vinkel eller ny indsigt – ikke bare "hørte bare fra dig"
- Let og venlig tone – ikke pushy
- Enkel CTA`,

    customer: `Dette er til en EKSISTERENDE KUNDE.
- Anerkend eksisterende samarbejde
- Præsenter ny mulighed (nyt format, ny lokation, ny sæson)
- Fortrolig og varm tone
- Konkret forslag`,
  };

  const prompt = `Du er ${input.senderName}, ${input.senderTitle || "OOH Specialist"} hos ${input.senderCompany || "Hyde Media"}.
Skriv en personlig salgsemail på DANSK til ${recipientFirst} fra ${input.companyName}.

Tone of voice: ${tone}

Kontekst om virksomheden:
${contextBlocks.join("\n")}

Instruktioner:
${typeInstructions[input.type]}

Format:
- Skriv KUN email-brødteksten (ikke emnelinjen, ikke hilsen, ikke signatur – de tilføjes automatisk)
- Brug HTML-formatering: <p> tags for afsnit, <strong> for nøgleord
- Skriv naturlig dansk – ikke oversættelses-agtig
- Ingen klichéer som "Håber du har det godt" eller "Jeg tillader mig at kontakte"
- Maks 150 ord i brødteksten`;

  try {
    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
    });

    const rawHtml = response.choices[0]?.message?.content?.trim() || "";

    // Clean up: ensure wrapped in <p> tags if not already
    const bodyHtml = rawHtml.includes("<p") ? rawHtml : `<p>${rawHtml.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;

    // Strip HTML for plain text
    const bodyText = bodyHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .trim();

    // Generate subject
    const subject = await generateSubject(input, bodyText);

    logger.info(`[ai-composer] Generated ${input.type} email for "${input.companyName}"`, { service: "email" });
    return { subject, bodyHtml, bodyText };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[ai-composer] Failed for "${input.companyName}": ${msg}`, { service: "email" });
    throw new Error(`Kunne ikke generere email: ${msg}`);
  }
}

async function generateSubject(input: ComposeEmailInput, bodyText: string): Promise<string> {
  // For follow-ups, keep the Re: prefix
  if (input.type === "followup" && input.previousSubject) {
    return `Re: ${input.previousSubject}`;
  }

  const client = getClient();
  try {
    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages: [{
        role: "user",
        content: `Skriv en kort, specifik email-emnelinje (max 8 ord) til denne salgsemail på dansk.
Virksomhed: ${input.companyName}
Type: ${input.type === "cold" ? "kold henvendelse" : input.type === "customer" ? "eksisterende kunde" : "opfølgning"}
Email-preview: ${bodyText.slice(0, 200)}

Svar KUN med emnelinjen. Ingen anførselstegn.`
      }],
      temperature: 0.5,
      max_tokens: 30,
    });
    return response.choices[0]?.message?.content?.trim() || defaultSubject(input.type, input.companyName);
  } catch {
    return defaultSubject(input.type, input.companyName);
  }
}
