// ============================================================
// LLM Client â€“ SPLIT prompts for precision research
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
import { getAISettings } from "./ai-settings";
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

// â”€â”€â”€ Prompt 1: Owner + Quality Assessment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  evidenceChain: string;
  oohPitchArgument: string;
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
    sections.push(`## OIS.dk â€“ OFFICIELLE EJEROPLYSNINGER
- EJER: ${ois.owners.map(o => `${o.name}${o.isPrimary ? " (primÃ¦r)" : ""}`).join(", ") || "Ingen"}
- ADMINISTRATOR: ${ois.administrators.map(a => `${a.name}${a.isPrimary ? " (primÃ¦r)" : ""}`).join(", ") || "Ingen"}
- BFE: ${ois.bfe}
- Ejerforhold: ${ois.ejerforholdstekst || "Ukendt"}
- Kommune: ${ois.kommune || "Ukendt"}`);
  } else {
    sections.push(`## OIS.dk â€“ Ingen data tilgÃ¦ngelig`);
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
    sections.push(`## CVR-data â€“ Ingen fundet`);
  }

  if (research.bbrData) {
    sections.push(`## BBR-data
- ByggeÃ¥r: ${research.bbrData.buildingYear || "Ukendt"}
- Areal: ${research.bbrData.area ? `${research.bbrData.area} mÂ²` : "Ukendt"}
- Anvendelse: ${research.bbrData.usage || "Ukendt"}
- Etager: ${research.bbrData.floors || "Ukendt"}
- Boliger: ${research.bbrData.units || "Ukendt"}`);
  }

  const prompt = sections.join("\n\n") + `

## Instruktion
Baseret KUN pÃ¥ OIS, CVR og BBR data ovenfor:
1. Hvem ejer denne ejendom? Brug OIS som primÃ¦r kilde.
2. Vurder data_quality baseret pÃ¥ hvad vi HAR (ikke hvad vi mangler).
3. Giv en outdoor_potential_score 1-10 baseret pÃ¥ bygningsdata.
4. Lav en detaljeret KILDEKÃ†DE der forklarer PRÃ†CIS hvordan du nÃ¥ede frem til ejeren, trin for trin.

Svar i JSON:
{
  "owner_company_name": "Ejerens navn fra OIS/CVR, eller 'Ukendt'",
  "owner_company_cvr": "CVR-nummer eller null",
  "outdoor_potential_score": 1-10,
  "key_insights": "3-5 sÃ¦tninger om ejendommen â€“ inkl. hvad vi ved om bygningen, omrÃ¥det og potentialet.",
  "evidence_chain": "Struktureret forklaring i punktform:\\nâ€¢ KILDE: OIS.dk â†’ [hvad vi fandt]\\nâ€¢ KILDE: CVR â†’ [hvad vi fandt]\\nâ€¢ KONKLUSION: [hvorfor vi mener X er ejer/bygherre]\\nâ€¢ USIKKERHEDER: [hvad vi ikke kunne bekrÃ¦fte]",
  "ooh_pitch_argument": "En saetning: HVORFOR er netop denne ejendom god til OOH-reklame? Naevn facade, trafik, beliggenhed konkret.",
  "data_quality": "high | medium | low",
  "data_quality_reason": "Kort forklaring med reference til hvilke kilder der bekrÃ¦fter/mangler"
}

REGLER:
- "high" KUN hvis OIS + CVR begge bekrÃ¦fter ejerskab
- "medium" hvis kun OIS eller kun CVR
- "low" hvis ingen af delene har pÃ¥lidelig data
- evidence_chain SKAL forklare HVER kilde der blev brugt, hvad den sagde, og hvordan kilderne hÃ¦nger sammen
- NÃ¦vn specifikt om OIS-ejer matcher CVR-virksomhed, og om adressen stemmer overens
- Opfind ALDRIG navne eller CVR-numre
- Hvis usikker: "Ukendt" er altid bedre end et gÃ¦t`;

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: "system",
        content: `Du er en prÃ¦cis data-analytiker for dansk ejendomsdata.
DU MÃ… ALDRIG OPFINDE DATA. Brug KUN informationen der er givet.
Hvis noget er uklart, skriv "Ukendt".
Temperature: 0.1 â€“ vÃ¦r sÃ¥ deterministisk som muligt.`,
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
    evidenceChain: parsed.evidence_chain || parsed.evidenceChain || "",
    oohPitchArgument: parsed.ooh_pitch_argument || parsed.oohPitchArgument || "",
    dataQuality: (parsed.data_quality || parsed.dataQuality || "medium") as "high" | "medium" | "low",
    dataQualityReason: (parsed.data_quality_reason || parsed.dataQualityReason || "") as string,
  };
}

// â”€â”€â”€ Prompt 2: Contact Ranking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const proffSection = research.proffLeadership && research.proffLeadership.length > 0
    ? `\n## Proff.dk ledelse\n${research.proffLeadership.map(p => `- ${p.name}: ${p.role}`).join("\n")}`
    : "";

  const cvrRolesSection = research.cvrData?.roles && research.cvrData.roles.length > 0
    ? `\n## CVR roller\n${research.cvrData.roles.map(r => `- ${r.name}: ${r.role}`).join("\n")}`
    : "";

  const websitePeopleSection = research.websiteContent?.people && research.websiteContent.people.length > 0
    ? `\n## Website ledelse/team\n${research.websiteContent.people.map(p => `- ${p.name}: ${p.role}${p.email ? ` (${p.email})` : ""}${p.phone ? ` tlf: ${p.phone}` : ""}`).join("\n")}`
    : "";

  const prompt = `## Ejendom
- Adresse: ${property.address}, ${property.postalCode} ${property.city}
- Ejer (fra OIS/CVR): ${ownerInfo.ownerCompanyName}
- CVR: ${ownerInfo.ownerCompanyCvr || "Ukendt"}

## OIS data
- Ejere: ${research.oisData?.owners.map(o => o.name).join(", ") || "Ingen"}
- Administratorer: ${research.oisData?.administrators.map(a => a.name).join(", ") || "Ingen"}
${cvrRolesSection}${proffSection}${websitePeopleSection}

## Kendte kontakter (DU MÃ… KUN VÃ†LGE FRA DENNE LISTE)
${contactList}

## Instruktion
RangÃ©r kontakterne efter relevans for DENNE ejendom og OOH-salg. For HVER kontakt du vÃ¦lger:
1. Referer til kontaktens INDEX-nummer [0], [1], etc.
2. Angiv confidence 0.0-1.0, relevance "direct"/"indirect", og decision_power 1-5
3. Forklar DETALJERET i relevance_reason:
   - HVILKEN KILDE bekrÃ¦fter denne person (OIS, CVR, Proff.dk, website, sÃ¸geresultat)?
   - HVORFOR er personen relevant for denne specifikke ejendom?
   - Er der en DIREKTE forbindelse (f.eks. "nÃ¦vnt som ejer i OIS") eller INDIREKTE (f.eks. "direktÃ¸r i firmaet der ejer bygningen ifÃ¸lge CVR")?
   - Har personen beslutningskraft ift. outdoor-reklame (decision_power)?

PRIORITERING for OOH-salg:
- DirektÃ¸r/CEO/Adm. direktÃ¸r â†’ decision_power 5
- Bestyrelsesformand â†’ decision_power 5
- Marketing-ansvarlig/CMO â†’ decision_power 4
- SalgsdirektÃ¸r/-chef â†’ decision_power 3
- Driftschef/ForretningsfÃ¸rer â†’ decision_power 3
- Ejer (person) â†’ decision_power 4
- Generisk kontakt (info@) â†’ decision_power 1

DU MÃ… IKKE:
- Opfinde nye kontakter
- TilfÃ¸je emails der ikke allerede stÃ¥r i listen
- Ã†ndre navne eller emails

Svar i JSON:
{
  "ranked_contacts": [
    {
      "index": 0,
      "confidence": 0.0-1.0,
      "relevance": "direct | indirect",
      "decision_power": 1-5,
      "relevance_reason": "Detaljeret forklaring med kildehenvisning.",
      "role": "ejer | administrator | bestyrelses_formand | driftschef | direktÃ¸r | marketing | salg | anden"
    }
  ]
}

REGLER:
- confidence >= 0.7 KUN hvis personen er BEVIST ejer/formand for DENNE ejendom OG har email
- confidence 0.3-0.6 for sandsynlige kontakter
- confidence <= 0.3 for generiske emails (info@, kontakt@)
- Udelad kontakter der er irrelevante
- Bedre med 0 kontakter end forkerte
- relevance_reason SKAL altid nÃ¦vne den specifikke kilde (OIS, CVR, Proff.dk, website URL, osv.)
- Inkluder op til 5 kontakter â€“ prioriter dem med hÃ¸jest decision_power`;

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: "system",
        content: `Du er en streng kontakt-vurderingsassistent.
DU MÃ… IKKE OPFINDE NYE EMAILS ELLER NAVNE.
DU MÃ… KUN VÃ†LGE FRA DEN GIVNE LISTE VED INDEX-NUMMER.
Hvis ingen kontakt er god nok, returner en tom liste.
Temperature: 0.1 â€“ vÃ¦r konservativ.`,
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
      continue; // Invalid index â€“ skip (LLM hallucination protection)
    }

    const raw = rawContacts[idx];
    ranked.push({
      fullName: raw.name,
      email: raw.email,
      phone: raw.phone || null,
      role: item.role || raw.role_hint || "anden",
      source: raw.source,
      confidence: typeof item.confidence === "number" ? Math.min(item.confidence, 1) : 0.5,
      decisionPower: typeof item.decision_power === "number" ? Math.min(Math.max(item.decision_power, 1), 5) : undefined,
      relevance: item.relevance === "direct" ? "direct" : "indirect",
      relevanceReason: item.relevance_reason || "",
    });
  }

  return ranked;
}

// â”€â”€â”€ Public: Combined Research Summarization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Two-phase LLM analysis:
 * Phase 1: Assess owner + quality (no web data, no emails)
 * Phase 2: Rank known contacts by relevance (index-based, no hallucination)
 */
export async function summarizeResearch(
  property: Property,
  research: ResearchData
): Promise<ResearchAnalysis> {
  // â”€â”€ Phase 1: Owner assessment â”€â”€
  logger.info("LLM Phase 1: Owner + quality assessment", { service: "llm", propertyAddress: property.address });

  const ownerAssessment = await assessOwnerAndQuality(property, research);

  // â”€â”€ Collect all raw contacts from data sources â”€â”€
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
    // CVR roles (DirektÃ¸r, Bestyrelsesformand, etc.)
    for (const role of (research.cvrData.roles || [])) {
      if (!rawContacts.some(c => c.name?.toLowerCase() === role.name.toLowerCase())) {
        rawContacts.push({
          index: idx++,
          name: role.name,
          email: null,
          phone: null,
          source: `CVR rolle (${research.cvrData.companyName})`,
          role_hint: role.role.toLowerCase(),
        });
      }
    }
  }

  // From Proff.dk leadership
  if (research.proffLeadership) {
    for (const person of research.proffLeadership) {
      if (!rawContacts.some(c => c.name?.toLowerCase() === person.name.toLowerCase())) {
        rawContacts.push({
          index: idx++,
          name: person.name,
          email: null,
          phone: null,
          source: `Proff.dk ledelse`,
          role_hint: person.role.toLowerCase(),
        });
      }
    }
  }

  // From website people (structured extraction)
  if (research.websiteContent?.people) {
    for (const person of research.websiteContent.people) {
      if (!rawContacts.some(c => c.name?.toLowerCase() === person.name.toLowerCase())) {
        rawContacts.push({
          index: idx++,
          name: person.name,
          email: person.email || null,
          phone: person.phone || null,
          source: person.source || `Website`,
          role_hint: person.role.toLowerCase(),
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
          source: `WebsÃ¸gning: ${result.url}`,
          role_hint: "anden",
        });
      }
    }
  }

  // â”€â”€ Phase 2: Contact ranking â”€â”€
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
    evidenceChain: ownerAssessment.evidenceChain,
    oohPitchArgument: ownerAssessment.oohPitchArgument,
    dataQuality: ownerAssessment.dataQuality,
    dataQualityReason: ownerAssessment.dataQualityReason,
  };
}

// â”€â”€â”€ Email Draft Generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Generate an outreach email draft.
 */
export async function generateEmailDraft(
  property: Property,
  contact: Contact,
  analysis: ResearchAnalysis
): Promise<EmailDraft> {
  const client = getClient();

  // Load live settings from DB (cached 60s) - falls back to config defaults
  const aiSettings = await getAISettings();
  const tone = aiSettings.toneOfVoice || config.toneOfVoice;
  const examples = aiSettings.exampleEmails || config.exampleEmails;
  const senderName = aiSettings.senderName || "Mads";

  const prompt = buildEmailPrompt(property, contact, analysis);

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: "system",
        content: `Du er en dansk copywriter der skriver outreach-mails til ejendomsejere og administratorer om outdoor reklame-muligheder pa vegne af ${senderName} fra Hyde Media.

TONE OF VOICE:
${tone}

EKSEMPLER PA GODE MAILS (imiter denne stil praecist):
${examples}

REGLER:
- Max 150 ord i brodteksten
- Start ALDRIG med "Jeg haber denne mail finder dig vel" eller lignende
- Start med noget SPECIFIKT om ejendommen der viser vi har gjort research
- Naevn konkrete fordele (trafiktal, facade-storrelse, beliggenhed)
- Afslut med et lavt-forpligtende spoergsmaal som CTA
- Brug modtagerens navn og rolle naturligt
- Skriv som et menneske, ikke en robot
- Underskriv ALTID: Mvh\n${senderName}

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
    subject: parsed.subject || "UdendÃ¸rsarealer â€“ et uudnyttet potentiale?",
    bodyText: parsed.body_text || parsed.bodyText || "",
    shortInternalNote:
      parsed.short_internal_note || parsed.shortInternalNote || "",
  };
}

// â”€â”€â”€ Email Prompt Builder â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildEmailPrompt(
  property: Property,
  contact: Contact,
  analysis: ResearchAnalysis
): string {
  return `## Kontekst
Vi vil gerne kontakte en person angÃ¥ende outdoor reklame-muligheder pÃ¥ en ejendom.

## Ejendom
- Adresse: ${property.address}, ${property.postalCode} ${property.city}
- Outdoor score: ${analysis.outdoorPotentialScore}/10
- OOH pitch-argument: ${analysis.oohPitchArgument || ""}
- NÃ¸gleindsigter: ${analysis.keyInsights}

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
  "subject": "Konkret, nysgerrighedsvÃ¦kkende emnelinje",
  "body_text": "BrÃ¸dtekst med \\n for linjeskift. Max 150 ord.",
  "short_internal_note": "Kort intern note"
}`;
}


// ─── OOH Pitch Generator for Leads ──────────────────────────

export interface LeadPitchInput {
  name: string;
  industry: string | null;
  address: string | null;
  platforms: string[];
  adCount: number;
  oohReason: string | null;
  egenkapital: number | null;
  omsaetning: number | null;
  pageCategory: string | null;
}

/**
 * Generate a personalized OOH sales pitch for a lead.
 * 2-3 sentences that a salesperson can copy-paste as an opening.
 */
export async function generateOohPitch(lead: LeadPitchInput): Promise<string> {
  const client = getClient();

  const budgetTier =
    lead.omsaetning && lead.omsaetning > 50_000_000 ? "stor virksomhed (50M+ omsaetning)" :
    lead.omsaetning && lead.omsaetning > 10_000_000 ? "mellemstor virksomhed (10-50M omsaetning)" :
    lead.omsaetning && lead.omsaetning > 2_000_000 ? "SMV (2-10M omsaetning)" :
    "lille virksomhed";

  const platformText = lead.platforms.length > 0
    ? `Annoncerer paa: ${lead.platforms.join(", ")} (${lead.adCount} annoncer)`
    : "Ingen kendte annoncer";

  const prompt = `Du er en erfaren dansk OOH (Out-of-Home) saelger. Skriv en kort, specifik salgs-aabner paa 2-3 saetninger paa dansk til denne virksomhed.

Virksomhed: ${lead.name}
Branche: ${lead.industry || "Ukendt"}
Placering: ${lead.address || "Danmark"}
Digital annoncering: ${platformText}
Virksomhedsstrrelse: ${budgetTier}
Kategori: ${lead.pageCategory || "Ukendt"}
OOH potentiale: ${lead.oohReason || "Generelt god kandidat"}

Regler:
- 2-3 saetninger MAX
- Reference til specifik industri eller annonceaktivitet
- Konkret OOH-vinkel (fx "Jer som allerede annoncerer digitalt, kan OOH forstaerke...")
- Direkte og handlingsorienteret - ikke smigrende
- Skriv som du taler - naturlig dansk

Svar KUN med den raa pitch-tekst, ingen JSON, ingen ekstra forklaring.`;

  try {
    const response = await client.chat.completions.create({
      model: config.openai.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.6,
      max_tokens: 200,
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    return text;
  } catch (e) {
    logger.warn(`[generateOohPitch] Failed for "${lead.name}": ${e instanceof Error ? e.message : String(e)}`, { service: "llm" });
    return "";
  }
}
