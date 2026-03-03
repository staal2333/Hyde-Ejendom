import OpenAI from "openai";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getContactContext, contextToPrompt, type ContactContext } from "./contact-context";
import { scoreContact, prioritizeFollowUps, type FollowUpScore } from "./followup-scoring";

let _ai: OpenAI | null = null;
function ai(): OpenAI {
  if (!_ai) _ai = new OpenAI({ apiKey: config.openai.apiKey() });
  return _ai;
}

export interface FollowUpSuggestion {
  email: string;
  name: string;
  score: FollowUpScore;
  subject: string;
  body: string;
  propertyAddress?: string;
}

async function generateFollowUpDraft(ctx: ContactContext, score: FollowUpScore): Promise<{ subject: string; body: string }> {
  const contextPrompt = contextToPrompt(ctx);

  const systemPrompt = [
    "Du er en sælger for Hyde Media, et dansk outdoor-reklamebureau.",
    "Du skriver opfølgnings-emails på dansk.",
    "Regler:",
    "- Skriv kort og personligt (max 150 ord)",
    "- Referer til den konkrete samtale-historik",
    "- Tilføj værdi — nævn en relevant case, ny placering eller markedsdata",
    "- Undgå generiske vendinger som 'Jeg vender lige tilbage'",
    "- Afslut med et konkret spørgsmål eller call-to-action",
    "- Brug venlig men professionel tone",
    "",
    "Svar i dette format:",
    "EMNE: <emne>",
    "---",
    "<email body>",
  ].join("\n");

  const userPrompt = [
    contextPrompt,
    "",
    `## Scoring`,
    `Varme: ${score.warmth} (${score.score}/100)`,
    `Grund: ${score.reason}`,
    `Dage siden sidst: ${score.daysSinceContact}`,
    "",
    "Skriv en opfølgnings-email baseret på ovenstående kontekst.",
  ].join("\n");

  try {
    const res = await ai().chat.completions.create({
      model: config.openai.model,
      temperature: 0.5,
      max_tokens: 500,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = res.choices[0]?.message?.content?.trim() || "";
    const parts = text.split("---");
    const subjectLine = parts[0]?.replace(/^EMNE:\s*/i, "").trim() || "Opfølgning";
    const body = parts.slice(1).join("---").trim() || text;

    return { subject: subjectLine, body };
  } catch (e) {
    logger.error(`[followup-agent] LLM failed: ${e instanceof Error ? e.message : String(e)}`);
    return { subject: "Opfølgning", body: "Kunne ikke generere udkast." };
  }
}

export async function getFollowUpSuggestions(emails: string[], maxResults = 10): Promise<FollowUpSuggestion[]> {
  logger.info(`[followup-agent] Generating suggestions for ${emails.length} contacts`);

  const contexts: { ctx: ContactContext; score: FollowUpScore }[] = [];

  for (const email of emails) {
    try {
      const ctx = await getContactContext(email);
      const score = scoreContact(ctx);
      contexts.push({ ctx, score });
    } catch (e) {
      logger.warn(`[followup-agent] Context failed for ${email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const prioritized = prioritizeFollowUps(contexts.map((c) => c.score));
  const top = prioritized.slice(0, maxResults);

  const suggestions: FollowUpSuggestion[] = [];

  for (const score of top) {
    const match = contexts.find((c) => c.score.email === score.email);
    if (!match) continue;

    const draft = await generateFollowUpDraft(match.ctx, score);
    suggestions.push({
      email: score.email,
      name: score.name,
      score,
      subject: draft.subject,
      body: draft.body,
      propertyAddress: score.propertyAddress,
    });
  }

  logger.info(`[followup-agent] Generated ${suggestions.length} suggestions`);
  return suggestions;
}

export async function generateSingleFollowUp(email: string): Promise<FollowUpSuggestion | null> {
  try {
    const ctx = await getContactContext(email);
    const score = scoreContact(ctx);
    const draft = await generateFollowUpDraft(ctx, score);
    return {
      email: score.email,
      name: score.name,
      score,
      subject: draft.subject,
      body: draft.body,
      propertyAddress: score.propertyAddress,
    };
  } catch (e) {
    logger.error(`[followup-agent] Single followup failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
