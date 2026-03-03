import type { ContactContext } from "./contact-context";

export interface FollowUpScore {
  email: string;
  name: string;
  score: number;
  warmth: "hot" | "warm" | "cool" | "cold";
  daysSinceContact: number;
  reason: string;
  propertyAddress?: string;
  propertyStatus?: string;
}

export function scoreContact(ctx: ContactContext): FollowUpScore {
  let score = 50;
  const reasons: string[] = [];

  if (ctx.stats.hasReplied) {
    score += 20;
    reasons.push("Har svaret tidligere");
  }

  if (ctx.stats.oohOpens > 0) {
    score += 10;
    reasons.push(`${ctx.stats.oohOpens} OOH åbninger`);
  }

  if (ctx.stats.oohClicks > 0) {
    score += 15;
    reasons.push(`${ctx.stats.oohClicks} OOH klik`);
  }

  const days = ctx.stats.daysSinceLastContact;
  if (days <= 3) {
    score += 10;
    reasons.push("Kontaktet for nylig");
  } else if (days >= 7 && days <= 14) {
    score += 5;
    reasons.push(`${days} dage siden sidst — god timing for opfølgning`);
  } else if (days > 14 && days <= 30) {
    score -= 5;
    reasons.push(`${days} dage siden sidst — ved at gå koldt`);
  } else if (days > 30) {
    score -= 15;
    reasons.push(`${days} dage siden sidst — koldt lead`);
  }

  if (ctx.stats.totalEmails === 0) {
    score -= 10;
    reasons.push("Ingen emails endnu");
  }

  if (ctx.tilbud.length > 0) {
    score += 10;
    reasons.push(`${ctx.tilbud.length} tilbud sendt`);
  }

  const activeProperty = ctx.properties.find((p) =>
    p.outreachStatus === "FOERSTE_MAIL_SENDT" ||
    p.outreachStatus === "OPFOELGNING_SENDT" ||
    p.outreachStatus === "SVAR_MODTAGET"
  );
  if (activeProperty) {
    score += 5;
    reasons.push(`Aktiv ejendom: ${activeProperty.address}`);
  }

  score = Math.max(0, Math.min(100, score));

  let warmth: FollowUpScore["warmth"];
  if (score >= 75) warmth = "hot";
  else if (score >= 55) warmth = "warm";
  else if (score >= 35) warmth = "cool";
  else warmth = "cold";

  return {
    email: ctx.contact.email,
    name: [ctx.contact.firstName, ctx.contact.lastName].filter(Boolean).join(" ") || ctx.contact.email,
    score,
    warmth,
    daysSinceContact: days,
    reason: reasons.join(" · "),
    propertyAddress: activeProperty?.address || ctx.properties[0]?.address,
    propertyStatus: activeProperty?.outreachStatus || ctx.properties[0]?.outreachStatus,
  };
}

export function prioritizeFollowUps(scores: FollowUpScore[]): FollowUpScore[] {
  return scores
    .filter((s) => s.daysSinceContact >= 3 && s.warmth !== "cold")
    .sort((a, b) => {
      if (a.warmth !== b.warmth) {
        const order = { hot: 0, warm: 1, cool: 2, cold: 3 };
        return order[a.warmth] - order[b.warmth];
      }
      return b.score - a.score;
    });
}
