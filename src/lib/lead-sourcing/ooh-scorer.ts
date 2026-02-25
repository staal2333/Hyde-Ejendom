// ============================================================
// OOH Eligibility Scorer – deterministic scoring for outdoor advertising potential
// ============================================================

import type { LeadCompany } from "./companies";

const HIGH_FIT_INDUSTRIES = new Set([
  "detail", "detailhandel", "retail", "butik", "butikker",
  "restaurant", "restauranter", "cafe", "café", "catering", "hotel", "hoteller",
  "fitness", "sport", "sundhed", "wellness",
  "ejendom", "ejendomme", "ejendomsmægler", "bolig",
  "bil", "biler", "autoværksted", "bilforhandler", "auto",
  "mode", "tøj", "beklædning", "fashion",
  "mad", "fødevarer", "drikkevarer", "food",
  "skønhed", "beauty", "frisør",
  "rejser", "turisme", "travel",
  "underholdning", "event", "events", "koncert",
  "møbler", "boligindretning", "indretning",
  "byggeri", "håndværk", "entreprenør",
]);

const LOW_FIT_INDUSTRIES = new Set([
  "it", "software", "saas", "teknologi", "konsulent", "rådgivning",
  "finans", "forsikring", "bank", "revision",
  "advokat", "jura", "juridisk",
]);

const CATEGORY_HIGH_FIT = new Set([
  "shopping & retail", "retail", "restaurant", "food & beverage",
  "hotel", "fitness", "gym", "beauty", "salon", "automotive",
  "real estate", "clothing", "fashion", "home decor", "furniture",
  "travel", "entertainment", "event", "sports",
  "product/service",
]);

const CATEGORY_LOW_FIT = new Set([
  "software", "consulting", "finance", "insurance",
  "legal", "law", "accounting",
]);

function formatDkk(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface OohScoreResult {
  score: number;
  reason: string;
}

export function scoreOohEligibility(company: LeadCompany): OohScoreResult {
  const reasons: string[] = [];

  // --- Financial strength (40%) ---
  let financialScore = 0;
  const equity = company.egenkapital;
  const revenue = company.omsaetning;
  const profit = company.resultat;

  if (equity != null && equity > 0) {
    if (equity >= 10_000_000) financialScore += 35;
    else if (equity >= 5_000_000) financialScore += 28;
    else if (equity >= 1_000_000) financialScore += 20;
    else if (equity >= 500_000) financialScore += 12;
    else financialScore += 5;
  }
  if (revenue != null && revenue > 0) {
    if (revenue >= 50_000_000) financialScore += 5;
    else if (revenue >= 10_000_000) financialScore += 3;
    else if (revenue >= 2_000_000) financialScore += 1;
  }
  financialScore = clamp(financialScore, 0, 40);

  if (equity != null && equity > 500_000) {
    reasons.push(`Egenkapital ${formatDkk(equity)} DKK`);
  }
  if (profit != null && profit > 0) {
    reasons.push(`Overskud ${formatDkk(profit)} DKK`);
  }

  // --- Ad activity (30%) ---
  let adScore = 0;
  const adCount = company.adCount || 0;
  const platformCount = company.platforms?.length || 0;

  if (adCount >= 10) adScore += 20;
  else if (adCount >= 5) adScore += 15;
  else if (adCount >= 2) adScore += 10;
  else if (adCount >= 1) adScore += 5;

  if (platformCount >= 3) adScore += 10;
  else if (platformCount >= 2) adScore += 7;
  else if (platformCount >= 1) adScore += 3;

  adScore = clamp(adScore, 0, 30);

  if (adCount > 0) {
    const platLabel = company.platforms?.map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(", ") || "";
    reasons.push(`${adCount} aktive annoncer${platLabel ? ` (${platLabel})` : ""}`);
  }

  // --- Industry fit (20%) ---
  let industryScore = 10;
  const industry = (company.industry || "").toLowerCase();
  const category = (company.pageCategory || "").toLowerCase();

  const industryTokens = industry.split(/[\s,/]+/).filter(Boolean);
  const isHighFitIndustry = industryTokens.some(t => HIGH_FIT_INDUSTRIES.has(t));
  const isLowFitIndustry = industryTokens.some(t => LOW_FIT_INDUSTRIES.has(t));
  const isHighFitCategory = CATEGORY_HIGH_FIT.has(category) || Array.from(CATEGORY_HIGH_FIT).some(c => category.includes(c));
  const isLowFitCategory = CATEGORY_LOW_FIT.has(category) || Array.from(CATEGORY_LOW_FIT).some(c => category.includes(c));

  if (isHighFitIndustry || isHighFitCategory) {
    industryScore = 20;
    reasons.push(`Branche: ${company.industry || company.pageCategory || "B2C"}`);
  } else if (isLowFitIndustry || isLowFitCategory) {
    industryScore = 3;
  } else if (company.industry) {
    reasons.push(`Branche: ${company.industry}`);
  }

  // --- Page popularity (10%) ---
  let popularityScore = 0;
  const likes = company.pageLikes || 0;

  if (likes >= 50_000) popularityScore = 10;
  else if (likes >= 10_000) popularityScore = 7;
  else if (likes >= 1_000) popularityScore = 4;
  else if (likes > 0) popularityScore = 2;

  if (likes >= 1_000) {
    reasons.push(`${formatDkk(likes)} følgere`);
  }

  const totalScore = clamp(financialScore + adScore + industryScore + popularityScore, 0, 100);

  if (reasons.length === 0) {
    reasons.push("Begrænset data tilgængelig");
  }

  return {
    score: totalScore,
    reason: reasons.join(" · "),
  };
}

export function scoreOohBatch(companies: LeadCompany[]): LeadCompany[] {
  return companies.map((c) => {
    const { score, reason } = scoreOohEligibility(c);
    return { ...c, oohScore: score, oohReason: reason };
  });
}
