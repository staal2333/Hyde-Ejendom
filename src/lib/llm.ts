// ============================================================
// LLM Client – SPLIT prompts for precision research
//
// Prompt 1 (summarizeOwnerAndQuality): Assess owner + CVR + data quality
//   from structured OIS/CVR/BBR data ONLY. No web data, no email guessing.
//
// Prompt 2 (rankContacts): Rank ALREADY KNOWN contacts/emails from a
//   provided list. LLM may NOT introduce new values.
//
// Both prompts use temperature 0.1 for deterministic output.
// ============================================================

import OpenAI from "openai";
import { config } from "./config";
import { logger } from "./logger";
import type {
  Property,
  ResearchData,
  ResearchAnalysis,
  Contact,
  EmailDraft,
} from "@/types";

// Lazy singleton
let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: config.openai.apiKey() });
  }
  return _client;
}

// ─── Prompt 1: Owner + Quality Assessment ────────────────

/**
 * LLM Prompt 1: Analyze structured data (OIS, CVR, BBR) to determine:
 * - Who owns this property
 * - Data quality
 * - Outdoor potential score
 *
 * This prompt NEVER sees web scraping results or emails.
 * It CANNOT hallucinate contacts or emails.
 */
async function assessOwnerAndQuality(
  property: Property,
  research: ResearchData
): Promise<{
  ownerCompanyName: string;
  ownerCompanyCvr: string | null;
  outdoorPotentialScore: number;
  keyInsights: string;
  dataQuality: "high" | "medium" | "low";
  dataQualityReason: string;
}> {
  const client = getClient();

  const sections: string[] = [];

  sections.push(`## Ejendom
- Adresse: ${property.address}, ${property.postalCode} ${property.city}
- Outdoor score (discovery): ${property.outdoorScore || "Ikke vurderet"}`);

  if (research.oisData) {
    const ois = research.oisData;
    sections.push(`## OIS.dk – OFFICIELLE EJEROPLYSNINGER
- EJER: ${ois.owners.map(o => `${o.name}${o.isPrimary ? " (primær)" : ""}`).join(", ") || "Ingen"}
- ADMINISTRATOR: ${ois.administrators.map(a => `${a.name}${a.isPrimary ? " (primær)" : ""}`).join(", ") || "Ingen"}
- BFE: ${ois.bfe}
- Ejerforhold: ${ois.ejerforholdstekst || "Ukendt"}
- Kommune: ${ois.kommune || "Ukendt"}`);
  } else {
    sections.push(`## OIS.dk – Ingen data tilgængelig`);
  }

  if (research.cvrData) {
    sections.push(`## CVR-data
- CVR: ${research.cvrData.cvr}
- Virksomhedsnavn: ${research.cvrData.companyName}
- Adresse: ${research.cvrData.address}
- Status: ${research.cvrData.status}
- Type: ${research.cvrData.type}
- Branche: ${research.cvrData.industry || "Ukendt"}
- Ejere: ${research.cvrData.owners?.join(", ") || "Ukendt"}`);
  } else {
    sections.push(`## CVR-data – Ingen fundet`);
  }

  if (research.bbrData) {
    sections.push(`## BBR-data
- Byggeår: ${research.bbrData.buildingYear || "Ukendt"}
- Areal: ${research.bbrData.area ? `${research.bbrData.area} m²` : "Ukendt"}
- Anvendelse: ${research.bbrData.usage || "Ukendt"}
- Etager: ${research.bbrData.floors || "Ukendt"}
- Boliger: ${research.bbrData.units || "Ukendt"}`);
  }

  const prompt = sections.join("\n\n") + `

## Instruktion
Baseret KUN på OIS, CVR og BBR data ovenfor:
1. Hvem ejer denne ejendom? Brug OIS som primær kilde.
2. Vurder data_quality baseret på hvad vi HAR (ikke hvad vi mangler).
3. Giv en outdoor_potential_score 1-10 baseret på bygningsdata.

Svar i JSON:
{
  "owner_company_name": "Ejerens navn fra OIS/CVR, eller 'Ukendt'",
  "owner_company_cvr": "CVR-nummer eller null",
  "outdoor_potential_score": 1-10,
  "key_insights": "3-5 sætninger om ejendommen",
  "data_quality": "high | medium | low",
  "data_quality_reason": "Kort forklaring"
}

REGLER:
- "high" KUN hvis OIS + CVR begge bekræfter ejerskab
- "medium" hvis kun OIS eller kun CVR
- "low" hvis ingen af delene har pålidelig data
- Opfind ALDRIG navne eller CVR-numre
- Hvis usikker: "Ukendt" er altid bedre end et gæt`;

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: "system",
        content: `Du er en præcis data-analytiker for dansk ejendomsdata.
DU MÅ ALDRIG OPFINDE DATA. Brug KUN informationen der er givet.
Hvis noget er uklart, skriv "Ukendt".
Temperature: 0.1 – vær så deterministisk som muligt.`,
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty response for owner assessment");

  const parsed = JSON.parse(content);
  return {
    ownerCompanyName: parsed.owner_company_name || parsed.ownerCompanyName || "Ukendt",
    ownerCompanyCvr: parsed.owner_company_cvr || parsed.ownerCompanyCvr || null,
    outdoorPotentialScore: parsed.outdoor_potential_score || parsed.outdoorPotentialScore || 5,
    keyInsights: parsed.key_insights || parsed.keyInsights || "",
    dataQuality: (parsed.data_quality || parsed.dataQuality || "medium") as "high" | "medium" | "low",
    dataQualityReason: (parsed.data_quality_reason || parsed.dataQualityReason || "") as string,
  };
}

// ─── Prompt 2: Contact Ranking ───────────────────────────

interface RawContact {
  index: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  role_hint: string;
}

/**
 * LLM Prompt 2: Rank a list of KNOWN contacts by relevance.
 * The LLM sees the contacts as indexed items and must reference them by index.
 * It may NOT create new contacts, emails, or names.
 */
async function rankContacts(
  property: Property,
  research: ResearchData,
  ownerInfo: { ownerCompanyName: string; ownerCompanyCvr: string | null },
  rawContacts: RawContact[]
): Promise<Contact[]> {
  if (rawContacts.length === 0) return [];

  const client = getClient();

  const contactList = rawContacts.map(c =>
    `[${c.index}] Navn: ${c.name || "?"} | Email: ${c.email || "INGEN"} | Tlf: ${c.phone || "INGEN"} | Kilde: ${c.source} | Rolle-hint: ${c.role_hint}`
  ).join("\n");

  const prompt = `## Ejendom
- Adresse: ${property.address}, ${property.postalCode} ${property.city}
- Ejer (fra OIS/CVR): ${ownerInfo.ownerCompanyName}
- CVR: ${ownerInfo.ownerCompanyCvr || "Ukendt"}

## OIS data
- Ejere: ${research.oisData?.owners.map(o => o.name).join(", ") || "Ingen"}
- Administratorer: ${research.oisData?.administrators.map(a => a.name).join(", ") || "Ingen"}

## Kendte kontakter (DU MÅ KUN VÆLGE FRA DENNE LISTE)
${contactList}

## Instruktion
Rangér kontakterne efter relevans for DENNE ejendom. For HVER kontakt du vælger:
1. Referer til kontaktens INDEX-nummer [0], [1], etc.
2. Angiv confidence 0.0-1.0 og relevance "direct"/"indirect"
3. Forklar HVORFOR denne kontakt er relevant

DU MÅ IKKE:
- Opfinde nye kontakter
- Tilføje emails der ikke allerede står i listen
- Ændre navne eller emails

Svar i JSON:
{
  "ranked_contacts": [
    {
      "index": 0,
      "confidence": 0.0-1.0,
      "relevance": "direct | indirect",
      "relevance_reason": "Hvorfor",
      "role": "ejer | administrator | bestyrelses_formand | driftschef | direktør | anden"
    }
  ]
}

REGLER:
- confidence >= 0.7 KUN hvis personen er BEVIST ejer/formand for DENNE ejendom OG har email
- confidence 0.3-0.6 for sandsynlige kontakter
- confidence <= 0.3 for generiske emails (info@, kontakt@)
- Udelad kontakter der er irrelevante
- Bedre med 0 kontakter end forkerte`;

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: "system",
        content: `Du er en streng kontakt-vurderingsassistent.
DU MÅ IKKE OPFINDE NYE EMAILS ELLER NAVNE.
DU MÅ KUN VÆLGE FRA DEN GIVNE LISTE VED INDEX-NUMMER.
Hvis ingen kontakt er god nok, returner en tom liste.
Temperature: 0.1 – vær konservativ.`,
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  const parsed = JSON.parse(content);
  const ranked: Contact[] = [];

  for (const item of (parsed.ranked_contacts || [])) {
    const idx = item.index;
    if (typeof idx !== "number" || idx < 0 || idx >= rawContacts.length) {
      logger.warn(`LLM referenced invalid contact index ${idx}`, { service: "llm" });
      continue; // Invalid index – skip (LLM hallucination protection)
    }

    const raw = rawContacts[idx];
    ranked.push({
      fullName: raw.name,
      email: raw.email,
      phone: raw.phone || null,
      role: item.role || raw.role_hint || "anden",
      source: raw.source,
      confidence: typeof item.confidence === "number" ? Math.min(item.confidence, 1) : 0.5,
      relevance: item.relevance === "direct" ? "direct" : "indirect",
      relevanceReason: item.relevance_reason || "",
    });
  }

  return ranked;
}

// ─── Public: Combined Research Summarization ─────────────

/**
 * Two-phase LLM analysis:
 * Phase 1: Assess owner + quality (no web data, no emails)
 * Phase 2: Rank known contacts by relevance (index-based, no hallucination)
 */
export async function summarizeResearch(
  property: Property,
  research: ResearchData
): Promise<ResearchAnalysis> {
  // ── Phase 1: Owner assessment ──
  logger.info("LLM Phase 1: Owner + quality assessment", { service: "llm", propertyAddress: property.address });

  const ownerAssessment = await assessOwnerAndQuality(property, research);

  // ── Collect all raw contacts from data sources ──
  const rawContacts: RawContact[] = [];
  let idx = 0;

  // From OIS owners
  if (research.oisData) {
    for (const owner of research.oisData.owners) {
      rawContacts.push({
        index: idx++,
        name: owner.name,
        email: null,
        phone: null,
        source: "OIS.dk (officiel ejer)",
        role_hint: "ejer",
      });
    }
    for (const admin of research.oisData.administrators) {
      rawContacts.push({
        index: idx++,
        name: admin.name,
        email: null,
        phone: null,
        source: "OIS.dk (administrator)",
        role_hint: "administrator",
      });
    }
  }

  // From CVR
  if (research.cvrData) {
    if (research.cvrData.email) {
      const cvrOwnerName = research.cvrData.owners?.[0] || null;
      rawContacts.push({
        index: idx++,
        name: cvrOwnerName,
        email: research.cvrData.email,
        phone: research.cvrData.phone || null,
        source: `CVR ${research.cvrData.cvr} (${research.cvrData.companyName})`,
        role_hint: "ejer",
      });
    }
    // CVR owners without email
    for (const owner of (research.cvrData.owners || [])) {
      if (!rawContacts.some(c => c.name?.toLowerCase() === owner.toLowerCase())) {
        rawContacts.push({
          index: idx++,
          name: owner,
          email: null,
          phone: null,
          source: `CVR ejer (${research.cvrData.companyName})`,
          role_hint: "ejer",
        });
      }
    }
  }

  // From web scraping
  if (research.websiteContent) {
    for (const email of research.websiteContent.emails) {
      if (!rawContacts.some(c => c.email?.toLowerCase() === email.toLowerCase())) {
        rawContacts.push({
          index: idx++,
          name: null,
          email: email,
          phone: null,
          source: `Website: ${research.websiteContent.url}`,
          role_hint: "anden",
        });
      }
    }
  }

  // From search result snippets
  const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  for (const result of research.companySearchResults.slice(0, 8)) {
    const text = `${result.title} ${result.snippet}`;
    const emails = text.match(emailRegex) || [];
    for (const email of emails) {
      if (!rawContacts.some(c => c.email?.toLowerCase() === email.toLowerCase())) {
        rawContacts.push({
          index: idx++,
          name: null,
          email: email,
          phone: null,
          source: `Websøgning: ${result.url}`,
          role_hint: "anden",
        });
      }
    }
  }

  // ── Phase 2: Contact ranking ──
  logger.info(`LLM Phase 2: Ranking ${rawContacts.length} contacts`, { service: "llm", propertyAddress: property.address });

  const rankedContacts = rawContacts.length > 0
    ? await rankContacts(property, research, ownerAssessment, rawContacts)
    : [];

  // Extract company domain from CVR or ranked contacts
  let companyDomain: string | null = null;
  let companyWebsite: string | null = null;

  if (research.cvrData?.website) {
    companyWebsite = research.cvrData.website.startsWith("http") ? research.cvrData.website : `https://${research.cvrData.website}`;
    try {
      companyDomain = new URL(companyWebsite).hostname.replace(/^www\./, "");
    } catch { /* ignore */ }
  }

  return {
    ownerCompanyName: ownerAssessment.ownerCompanyName,
    ownerCompanyCvr: ownerAssessment.ownerCompanyCvr,
    companyDomain,
    companyWebsite,
    recommendedContacts: rankedContacts,
    outdoorPotentialScore: ownerAssessment.outdoorPotentialScore,
    keyInsights: ownerAssessment.keyInsights,
    dataQuality: ownerAssessment.dataQuality,
    dataQualityReason: ownerAssessment.dataQualityReason,
  };
}

// ─── Email Draft Generation ─────────────────────────────────

/**
 * Generate an outreach email draft.
 */
export async function generateEmailDraft(
  property: Property,
  contact: Contact,
  analysis: ResearchAnalysis
): Promise<EmailDraft> {
  const client = getClient();

  const prompt = buildEmailPrompt(property, contact, analysis);

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: "system",
        content: `Du er en dansk copywriter der skriver outreach-mails til ejendomsejere og administratorer om outdoor reklame-muligheder.

TONE OF VOICE:
${config.toneOfVoice}

EKSEMPLER PÅ GODE MAILS:
${config.exampleEmails}

REGLER:
- Max 150 ord i brødteksten
- Start ALDRIG med "Jeg håber denne mail finder dig vel" eller lignende
- Start med noget SPECIFIKT om ejendommen der viser vi har gjort research
- Nævn konkrete fordele (trafiktal, facade-størrelse, beliggenhed)
- Afslut med et klart, lavt-forpligtende call-to-action
- Brug modtagerens navn og rolle naturligt
- Skriv som et menneske, ikke en robot

Du svarer ALTID i valid JSON med felterne: subject, body_text, short_internal_note.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty response for email generation");
  }

  const parsed = JSON.parse(content);

  return {
    subject: parsed.subject || "Udendørsarealer – et uudnyttet potentiale?",
    bodyText: parsed.body_text || parsed.bodyText || "",
    shortInternalNote:
      parsed.short_internal_note || parsed.shortInternalNote || "",
  };
}

// ─── Email Prompt Builder ────────────────────────────────────

function buildEmailPrompt(
  property: Property,
  contact: Contact,
  analysis: ResearchAnalysis
): string {
  return `## Kontekst
Vi vil gerne kontakte en person angående outdoor reklame-muligheder på en ejendom.

## Ejendom
- Adresse: ${property.address}, ${property.postalCode} ${property.city}
- Outdoor score: ${analysis.outdoorPotentialScore}/10
- Nøgleindsigter: ${analysis.keyInsights}

## Kontaktperson
- Navn: ${contact.fullName || "Ukendt"}
- Rolle: ${contact.role || "Ukendt"}
- Email: ${contact.email || "Ukendt"}
- Virksomhed: ${analysis.ownerCompanyName}

## Opgave
Skriv en kort, personlig outreach-mail. Brug vores tone of voice.
Referer til noget SPECIFIKT om ejendommen.

Svar i JSON:
{
  "subject": "Konkret, nysgerrighedsvækkende emnelinje",
  "body_text": "Brødtekst med \\n for linjeskift. Max 150 ord.",
  "short_internal_note": "Kort intern note"
}`;
}
