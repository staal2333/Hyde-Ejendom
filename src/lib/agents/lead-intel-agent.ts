import OpenAI from "openai";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import type { Placement } from "@/lib/tilbud/placement-types";

let _ai: OpenAI | null = null;
function ai(): OpenAI {
  if (!_ai) _ai = new OpenAI({ apiKey: config.openai.apiKey() });
  return _ai;
}

export interface LeadScore {
  companyName: string;
  industry?: string;
  estimatedAdSpend?: number;
  adPlatforms: string[];
  geoMatch: boolean;
  score: number;
  tier: "A" | "B" | "C";
  matchedPlacements: { name: string; areaSqm: number; reason: string }[];
  recommendation: string;
}

export interface LeadIntelResult {
  leads: LeadScore[];
  summary: string;
}

export function scoreLeadForPlacements(
  lead: {
    companyName: string;
    industry?: string;
    city?: string;
    estimatedAdSpend?: number;
    adPlatforms?: string[];
    employeeCount?: number;
  },
  placements: Placement[]
): LeadScore {
  let score = 30;
  const reasons: string[] = [];
  const matchedPlacements: LeadScore["matchedPlacements"] = [];

  if (lead.estimatedAdSpend) {
    if (lead.estimatedAdSpend > 100000) { score += 30; reasons.push("Højt ad spend"); }
    else if (lead.estimatedAdSpend > 30000) { score += 20; reasons.push("Medium ad spend"); }
    else { score += 10; reasons.push("Lavt ad spend"); }
  }

  const outdoorIndustries = [
    "retail", "detailhandel", "restaurant", "café", "fitness", "ejendom",
    "bolig", "bank", "forsikring", "bil", "auto", "mode", "tøj",
    "elektronik", "teknologi", "telekommunikation", "medie",
  ];
  if (lead.industry) {
    const lower = lead.industry.toLowerCase();
    if (outdoorIndustries.some((ind) => lower.includes(ind))) {
      score += 15;
      reasons.push(`Branche-match: ${lead.industry}`);
    }
  }

  if (lead.adPlatforms && lead.adPlatforms.length > 0) {
    score += 5 * Math.min(lead.adPlatforms.length, 3);
    reasons.push(`Aktiv på: ${lead.adPlatforms.join(", ")}`);
  }

  if (lead.employeeCount && lead.employeeCount > 20) {
    score += 5;
    reasons.push(`${lead.employeeCount} ansatte`);
  }

  const geoMatch = lead.city
    ? ["københavn", "kbh", "frederiksberg", "aarhus", "odense", "aalborg"].some((c) =>
        lead.city!.toLowerCase().includes(c)
      )
    : false;

  if (geoMatch) {
    score += 10;
    reasons.push("Geografisk match");

    for (const p of placements) {
      const weeklyPrice = p.listPricePerSqmPerWeek * p.areaSqm;
      const monthlyPrice = weeklyPrice * 4;
      if (!lead.estimatedAdSpend || monthlyPrice <= lead.estimatedAdSpend * 0.5) {
        matchedPlacements.push({
          name: p.name,
          areaSqm: p.areaSqm,
          reason: `${p.areaSqm} m² — ${weeklyPrice.toLocaleString("da-DK")} DKK/uge`,
        });
      }
    }
  }

  score = Math.max(0, Math.min(100, score));

  let tier: LeadScore["tier"];
  if (score >= 70) tier = "A";
  else if (score >= 45) tier = "B";
  else tier = "C";

  return {
    companyName: lead.companyName,
    industry: lead.industry,
    estimatedAdSpend: lead.estimatedAdSpend,
    adPlatforms: lead.adPlatforms || [],
    geoMatch,
    score,
    tier,
    matchedPlacements,
    recommendation: reasons.join(" · "),
  };
}

export async function generateLeadIntelSummary(leads: LeadScore[]): Promise<string> {
  if (leads.length === 0) return "Ingen leads at analysere.";

  const tierA = leads.filter((l) => l.tier === "A");
  const tierB = leads.filter((l) => l.tier === "B");

  const prompt = [
    "Du er en salgs-analytiker for Hyde Media (outdoor-reklame).",
    "Lav en kort opsummering (max 100 ord) af disse leads på dansk:",
    "",
    ...leads.slice(0, 10).map((l) =>
      `- ${l.companyName} (${l.tier}) — Score: ${l.score} — ${l.recommendation}`
    ),
    "",
    `Tier A: ${tierA.length} leads. Tier B: ${tierB.length} leads.`,
    "Fremhæv de mest lovende og foreslå næste skridt.",
  ].join("\n");

  try {
    const res = await ai().chat.completions.create({
      model: config.openai.model,
      temperature: 0.4,
      max_tokens: 300,
      messages: [
        { role: "system", content: "Du er Hyde Medias lead intelligence assistent." },
        { role: "user", content: prompt },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || "Ingen opsummering.";
  } catch (e) {
    logger.error(`[lead-intel] LLM failed: ${e instanceof Error ? e.message : String(e)}`);
    return "Kunne ikke generere opsummering.";
  }
}
