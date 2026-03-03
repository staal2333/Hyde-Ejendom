import OpenAI from "openai";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { createDefaultTilbud } from "@/lib/tilbud/types";
import { placementToLines, type Placement } from "@/lib/tilbud/placement-types";
import { calcMediaDiscountPct } from "@/lib/tilbud/calculations";
import type { Tilbud } from "@/lib/tilbud/types";

let _ai: OpenAI | null = null;
function ai(): OpenAI {
  if (!_ai) _ai = new OpenAI({ apiKey: config.openai.apiKey() });
  return _ai;
}

export interface TilbudRequest {
  clientName: string;
  budget?: number;
  fromWeek?: number;
  toWeek?: number;
  area?: string;
  notes?: string;
}

export interface TilbudSuggestion {
  placement: Placement;
  tilbud: Tilbud;
  discountPct: number;
  summary: string;
}

export interface TilbudAgentResult {
  suggestions: TilbudSuggestion[];
  aiRecommendation: string;
}

function matchPlacements(
  placements: Placement[],
  request: TilbudRequest
): Placement[] {
  let candidates = [...placements];

  if (request.area) {
    const area = request.area.toLowerCase();
    const areaMatches = candidates.filter((p) => p.name.toLowerCase().includes(area));
    if (areaMatches.length > 0) candidates = areaMatches;
  }

  if (request.budget) {
    candidates.sort((a, b) => {
      const weeklyA = a.listPricePerSqmPerWeek * a.areaSqm;
      const weeklyB = b.listPricePerSqmPerWeek * b.areaSqm;
      return Math.abs(weeklyA * 4 - request.budget!) - Math.abs(weeklyB * 4 - request.budget!);
    });
  }

  return candidates.slice(0, 3);
}

function buildTilbudForPlacement(
  placement: Placement,
  request: TilbudRequest
): { tilbud: Tilbud; discountPct: number } {
  const weeks = (request.fromWeek && request.toWeek)
    ? request.toWeek - request.fromWeek + 1
    : 4;

  const lines = placementToLines(placement, weeks);

  if (request.fromWeek != null) {
    for (const line of lines) {
      line.fromWeek = request.fromWeek;
      line.toWeek = request.toWeek;
    }
  }

  const tilbud: Tilbud = {
    ...createDefaultTilbud(Date.now()),
    clientName: request.clientName,
    title: `Tilbud — ${placement.name}`,
    lines,
    comments: request.notes || "",
  };

  let discountPct = 0;
  if (request.budget && request.budget > 0) {
    discountPct = calcMediaDiscountPct(lines, request.budget);
    const mediaLine = lines.find((l) => l.name.toLowerCase() === "medievisning");
    if (mediaLine) {
      mediaLine.discountPct = discountPct;
    }
  }

  return { tilbud, discountPct };
}

export async function parseNaturalRequest(text: string): Promise<TilbudRequest> {
  const prompt = [
    "Udtræk tilbuds-information fra denne tekst. Svar som JSON:",
    '{ "clientName": "...", "budget": number|null, "fromWeek": number|null, "toWeek": number|null, "area": "..."|null, "notes": "..."|null }',
    "",
    `Tekst: "${text}"`,
    "",
    "Regler:",
    "- budget er i DKK",
    "- fromWeek/toWeek er ugenumre (1-53)",
    "- area er geografisk område eller adresse",
    "- Svar KUN med JSON, ingen anden tekst",
  ].join("\n");

  try {
    const res = await ai().chat.completions.create({
      model: config.openai.model,
      temperature: 0.1,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = res.choices[0]?.message?.content?.trim() || "{}";
    const cleaned = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned) as TilbudRequest;
  } catch (e) {
    logger.error(`[tilbud-agent] NLP parse failed: ${e instanceof Error ? e.message : String(e)}`);
    return { clientName: text.slice(0, 50) };
  }
}

export async function suggestTilbud(
  request: TilbudRequest,
  placements: Placement[]
): Promise<TilbudAgentResult> {
  if (placements.length === 0) {
    return { suggestions: [], aiRecommendation: "Ingen placeringer tilgængelige." };
  }

  const matched = matchPlacements(placements, request);

  const suggestions: TilbudSuggestion[] = matched.map((placement) => {
    const { tilbud, discountPct } = buildTilbudForPlacement(placement, request);
    const weeklyPrice = placement.listPricePerSqmPerWeek * placement.areaSqm;
    return {
      placement,
      tilbud,
      discountPct,
      summary: `${placement.name} (${placement.areaSqm} m²) — Listepris: ${weeklyPrice.toLocaleString("da-DK")} DKK/uge — Rabat: ${discountPct.toFixed(1)}%`,
    };
  });

  let aiRecommendation = "";
  try {
    const prompt = [
      "Du er salgsrådgiver for Hyde Media (outdoor-reklame).",
      `Kunde: ${request.clientName}. Budget: ${request.budget ? request.budget.toLocaleString("da-DK") + " DKK" : "Ukendt"}.`,
      request.fromWeek ? `Periode: uge ${request.fromWeek}–${request.toWeek}` : "",
      "",
      "Foreslåede placeringer:",
      ...suggestions.map((s) => `- ${s.summary}`),
      "",
      "Giv en kort anbefaling (max 80 ord) på dansk. Hvilken placering passer bedst og hvorfor?",
    ].join("\n");

    const res = await ai().chat.completions.create({
      model: config.openai.model,
      temperature: 0.4,
      max_tokens: 200,
      messages: [
        { role: "system", content: "Du er Hyde Medias tilbuds-assistent." },
        { role: "user", content: prompt },
      ],
    });
    aiRecommendation = res.choices[0]?.message?.content?.trim() || "";
  } catch (e) {
    logger.warn(`[tilbud-agent] AI recommendation failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { suggestions, aiRecommendation };
}
