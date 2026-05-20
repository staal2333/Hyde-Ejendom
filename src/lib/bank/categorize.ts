import type { BankCategory } from "./types";

/**
 * Regelbaseret kategorisering af bank-transaktioner ud fra titlen.
 * Konservativ — falder tilbage til "andet" når intet matcher.
 */
export function categorizeTransaction(title: string, amount: number): BankCategory {
  const t = title.toLowerCase().trim();

  // ─── Skat, moms, kommune ───
  if (/skat|skattekonto|\bmoms\b|told/.test(t)) return "skat_moms";
  if (/kommune|kommun\b/.test(t)) return "skat_moms";

  // ─── Løn ───
  if (/\bl[øo]n\b|datal[øo]n|payroll/.test(t)) return "loen";

  // ─── Leverandører (stillads, lift, banner-print) ───
  if (
    /monsterprint|monster print|liftservice|liftudlejni|slagelse lift|krabbe as|stillads/.test(t)
  ) {
    return "leverandoer";
  }

  // ─── Software / SaaS-abonnementer ───
  if (
    /capcut|canva|cursor|lovable|builder\.io|builder io|supabase|mailchimp|google|gsuite|workspace|render\b|render\.com|render inc|shopify|squarespace|sqsp|higgsfield|kling|pykaso|dinero|hubspot|openai|anthropic|claude|vercel|netify|nitify|godaddy|one\.com|lunar plan|n8n|crm-syn|crm-sync|builder\b|data render|skinport/.test(
      t
    )
  ) {
    return "software";
  }

  // ─── Indtægter ───
  if (amount > 0) {
    if (
      /faktura|fak\.no|fakturanr|fak nr|kreditor betaling|tilbagebetaling|refund|selskabskapital|lidl danmark|polly-nicole|oister\b/.test(
        t
      )
    ) {
      return "indtaegt";
    }
    if (/moms reded?g[øo]relse/.test(t)) return "skat_moms"; // moms-tilbagebetaling
    if (/overf[øo]rsel|transfer|income sorter|momme|sebastian|m[øo]llegaard|overf[øo]rt/.test(t)) {
      return "overfoersel";
    }
    // Ukendt positiv postering — antag indtægt
    return "indtaegt";
  }

  // ─── Interne overførsler ───
  if (/^transfer$|overf[øo]rsel|overf[øo]rselsservice|income sorter|momme/.test(t)) {
    return "overfoersel";
  }

  return "andet";
}
