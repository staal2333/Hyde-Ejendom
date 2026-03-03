import OpenAI from "openai";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { collectAllBriefingData } from "./briefing-collectors";
import type { Briefing, BriefingData, BriefingListResult } from "./briefing-types";

let _ai: OpenAI | null = null;
function ai(): OpenAI {
  if (!_ai) _ai = new OpenAI({ apiKey: config.openai.apiKey() });
  return _ai;
}

function buildPrompt(data: BriefingData): string {
  const lines: string[] = [
    "Du er en AI-assistent for Hyde Media, et dansk outdoor-reklamebureau.",
    "Generer en kort, skarp morgen-briefing baseret på følgende data.",
    "Skriv på dansk. Brug bullets. Fremhæv det vigtigste først.",
    "Max 200 ord. Tonefald: professionelt men venligt.",
    "",
  ];

  if (data.pipeline) {
    lines.push(`## Pipeline (HubSpot)`);
    lines.push(`Total ejendomme: ${data.pipeline.total}`);
    for (const [status, count] of Object.entries(data.pipeline.byStatus)) {
      if (count > 0) lines.push(`- ${status}: ${count}`);
    }
    lines.push("");
  }

  if (data.staged) {
    lines.push(`## Staging`);
    lines.push(`Nye: ${data.staged.new} | Under research: ${data.staged.researching} | Klar: ${data.staged.researched} | Godkendt: ${data.staged.approved} | Pushed: ${data.staged.pushed}`);
    lines.push("");
  }

  if (data.tilbud) {
    lines.push(`## Tilbud`);
    lines.push(`Kladder: ${data.tilbud.drafts} | Endelige: ${data.tilbud.finals}`);
    lines.push("");
  }

  if (data.mail) {
    lines.push(`## Mail`);
    lines.push(`Indbakke: ${data.mail.inboxCount} tråde`);
    lines.push("");
  }

  if (data.followUps) {
    lines.push(`## Opfølgninger`);
    lines.push(`Forfaldne: ${data.followUps.due}`);
    if (data.followUps.names.length > 0) {
      lines.push(`Navne: ${data.followUps.names.join(", ")}`);
    }
    lines.push("");
  }

  if (data.ooh) {
    lines.push(`## OOH Kampagner`);
    lines.push(`Aktive kampagner: ${data.ooh.activeCampaigns} | Afventende sends: ${data.ooh.pendingSends}`);
    lines.push("");
  }

  lines.push("Lav nu briefingen.");
  return lines.join("\n");
}

async function generateSummary(data: BriefingData): Promise<string> {
  const prompt = buildPrompt(data);

  try {
    const res = await ai().chat.completions.create({
      model: config.openai.model,
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        { role: "system", content: "Du er Hyde Medias daglige AI-briefing assistent." },
        { role: "user", content: prompt },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || "Ingen data tilgængelig for briefing.";
  } catch (e) {
    logger.error(`[briefing-agent] LLM failed: ${e instanceof Error ? e.message : String(e)}`);
    return "Briefing kunne ikke genereres — AI-fejl.";
  }
}

export async function runDailyBriefing(): Promise<Briefing> {
  logger.info("[briefing-agent] Collecting data...");
  const data = await collectAllBriefingData();

  logger.info("[briefing-agent] Generating summary...");
  const summary = await generateSummary(data);

  const today = new Date().toISOString().slice(0, 10);
  const briefing: Briefing = {
    id: crypto.randomUUID(),
    date: today,
    summary,
    data,
    read: false,
    createdAt: new Date().toISOString(),
  };

  if (HAS_SUPABASE) {
    try {
      const { error } = await supabase!
        .from("agent_briefings")
        .upsert({ id: briefing.id, date: today, summary, data, read: false }, { onConflict: "id" });
      if (error) logger.error(`[briefing-agent] Supabase save failed: ${error.message}`);
      else logger.info("[briefing-agent] Saved to Supabase");
    } catch (e) {
      logger.error(`[briefing-agent] Supabase error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return briefing;
}

export async function listBriefings(limit = 14): Promise<BriefingListResult> {
  if (!HAS_SUPABASE) return { items: [], total: 0 };

  const { data, error, count } = await supabase!
    .from("agent_briefings")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error(`[briefing-agent] list failed: ${error?.message}`);
    return { items: [], total: 0 };
  }

  const items: Briefing[] = (data || []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    date: row.date as string,
    summary: row.summary as string,
    data: row.data as BriefingData,
    read: row.read as boolean,
    createdAt: row.created_at as string,
  }));

  return { items, total: count || items.length };
}

export async function markBriefingRead(id: string): Promise<void> {
  if (!HAS_SUPABASE) return;
  await supabase!.from("agent_briefings").update({ read: true }).eq("id", id);
}
