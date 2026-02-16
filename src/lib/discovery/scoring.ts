// ============================================================
// LLM Scoring – Batch-score buildings for outdoor ad potential
// ============================================================

import OpenAI from "openai";
import { config } from "../config";
import type { BuildingCandidate, ScoredCandidate } from "@/types";

const BATCH_SIZE = 15;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: config.openai.apiKey() });
  }
  return _client;
}

/** Callback for batch progress */
export type BatchProgressCallback = (
  batchIndex: number,
  batchTotal: number,
  batchResults: ScoredCandidate[]
) => void;

/**
 * Score a list of building candidates for outdoor advertising potential.
 * Sends to LLM in batches and returns scored + sorted results.
 */
export async function scoreForOutdoorPotential(
  candidates: BuildingCandidate[],
  streetName: string,
  city: string,
  onBatchDone?: BatchProgressCallback
): Promise<ScoredCandidate[]> {
  if (candidates.length === 0) return [];

  const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);

  console.log(
    `[Scoring] Scoring ${candidates.length} candidates in ${totalBatches} batches...`
  );

  const allScored: ScoredCandidate[] = [];

  // Process in batches
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE);

    console.log(`[Scoring] Batch ${batchNum + 1}/${totalBatches} (${batch.length} buildings)`);

    const scored = await scoreBatch(batch, streetName, city);
    allScored.push(...scored);

    if (onBatchDone) {
      onBatchDone(batchNum, totalBatches, scored);
    }
  }

  // Sort by score descending
  allScored.sort((a, b) => b.outdoorScore - a.outdoorScore);

  return allScored;
}

/**
 * Score a single batch of candidates via LLM.
 */
async function scoreBatch(
  batch: BuildingCandidate[],
  streetName: string,
  city: string
): Promise<ScoredCandidate[]> {
  const client = getClient();

  // Build the building list for the prompt
  const trafficInfo = batch[0]?.estimatedDailyTraffic
    ? `\nEstimeret daglig trafik på ${streetName}: ca. ${batch[0].estimatedDailyTraffic.toLocaleString("da-DK")} køretøjer/dag (kilde: ${batch[0].trafficSource || "estimat"})\n`
    : "";

  const buildingList = batch
    .map((b, i) => {
      const parts = [
        `${i + 1}. ${b.address}, ${b.postalCode} ${b.city}`,
      ];
      if (b.area) parts.push(`   Areal: ${b.area} m2`);
      if (b.floors) parts.push(`   Etager: ${b.floors}`);
      if (b.units) parts.push(`   Boliger: ${b.units}`);
      if (b.usageText) parts.push(`   Anvendelse: ${b.usageText}`);
      if (b.buildingYear) parts.push(`   Byggeår: ${b.buildingYear}`);
      if (b.estimatedDailyTraffic) parts.push(`   Daglig trafik: ca. ${b.estimatedDailyTraffic.toLocaleString("da-DK")} køretøjer`);
      return parts.join("\n");
    })
    .join("\n\n");

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: "system",
        content: `Du er ekspert i outdoor reklame, trafikdata og ejendomsvurdering i Danmark.

Din opgave er at vurdere bygninger for deres potentiale til outdoor reklame (facadereklame, stillads-reklame, bannere, digital signage, gavlreklame etc.).

VIGTIGSTE KRITERIUM: TRAFIK
- Veje med 20.000+ daglige trafikanter = meget attraktivt
- Veje med 10.000-20.000 = godt potentiale
- Under 10.000 = sjældent relevant
- Trafikdata er inkluderet hvis tilgængeligt – brug det aktivt i din vurdering

KRITERIER for høj score (7-10):
- Bygningen ligger ud til en befærdet vej med mange forbipasserende (kig på trafiktal!)
- Stor, synlig facade mod vejen (gerne flere etager)
- Erhvervsejendomme, store boligforeninger, hjørneejendomme
- Tæt på kryds, busstoppesteder, stationer, lyskryds
- Store gavle der kan bruges til gavlreklame
- Bygninger under renovering/stillads = ekstra bonus

KRITERIER for lav score (1-4):
- Små bygninger med lille eller tilbagetrukket facade
- Bygninger der ikke er synlige fra vejen
- Parcelhuse, rækkehuse uden facade mod trafikeret vej
- Baghuse, sidebygninger
- Veje med meget lav trafik

BEGRUNDELSE: Forklar ALTID specifikt HVORFOR du giver den score. Nævn trafik, facade-størrelse, bygningstype og placering.

Du svarer ALTID i valid JSON-format.`,
      },
      {
        role: "user",
        content: `Vurder følgende ${batch.length} bygninger på ${streetName}, ${city} for outdoor reklame-potentiale.
${trafficInfo}
${buildingList}

Svar i JSON med et array "scores":
{
  "scores": [
    {
      "index": 1,
      "score": 7,
      "reason": "Konkret begrundelse: nævn trafik, facade, bygningstype og placering (2-3 sætninger)"
    }
  ]
}

Score fra 1 (intet potentiale) til 10 (perfekt til outdoor reklame).
Vær realistisk og konkret i din begrundelse. Brug trafikdata aktivt.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.warn("[Scoring] LLM returned empty response");
    return batch.map((b) => ({ ...b, outdoorScore: 5, scoreReason: "Ingen vurdering" }));
  }

  try {
    const parsed = JSON.parse(content);
    const scores = parsed.scores || parsed.results || [];

    return batch.map((b, i) => {
      const scoreEntry = scores.find(
        (s: { index: number }) => s.index === i + 1
      ) || scores[i];

      return {
        ...b,
        outdoorScore: scoreEntry?.score ?? 5,
        scoreReason: scoreEntry?.reason || scoreEntry?.begrundelse || "Ingen begrundelse",
      };
    });
  } catch (e) {
    console.warn("[Scoring] Failed to parse LLM response:", e);
    return batch.map((b) => ({ ...b, outdoorScore: 5, scoreReason: "Parse-fejl" }));
  }
}
