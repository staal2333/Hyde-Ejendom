// ============================================================
// Setup endpoint – Create custom properties on Ejendomme object
// POST /api/setup/create-properties
// ============================================================

import { NextResponse } from "next/server";
import { config } from "@/lib/config";

const EJENDOMME_OBJECT_TYPE = "0-420";

const CUSTOM_PROPERTIES = [
  {
    name: "outreach_status",
    label: "Outreach Status",
    type: "enumeration",
    fieldType: "select",
    groupName: "ejendom_ai",
    description: "Status for outreach-processen",
    options: [
      { label: "Ny – kræver research", value: "NY_KRAEVER_RESEARCH", displayOrder: 1 },
      { label: "Research igangsat", value: "RESEARCH_IGANGSAT", displayOrder: 2 },
      { label: "Research done – kontakt mangler", value: "RESEARCH_DONE_CONTACT_PENDING", displayOrder: 3 },
      { label: "Klar til udsendelse", value: "KLAR_TIL_UDSENDELSE", displayOrder: 4 },
      { label: "Første mail sendt", value: "FOERSTE_MAIL_SENDT", displayOrder: 5 },
      { label: "Opfølgning sendt", value: "OPFOELGNING_SENDT", displayOrder: 6 },
      { label: "Svar modtaget", value: "SVAR_MODTAGET", displayOrder: 7 },
      { label: "Lukket – vundet", value: "LUKKET_VUNDET", displayOrder: 8 },
      { label: "Lukket – tabt", value: "LUKKET_TABT", displayOrder: 9 },
      { label: "Fejl", value: "FEJL", displayOrder: 10 },
    ],
  },
  {
    name: "outdoor_score",
    label: "Outdoor Score",
    type: "number",
    fieldType: "number",
    groupName: "ejendom_ai",
    description: "AI-vurderet outdoor potentiale (1-10)",
  },
  {
    name: "owner_company_name",
    label: "Ejerselskab",
    type: "string",
    fieldType: "text",
    groupName: "ejendom_ai",
    description: "Navn på ejerselskab/administrator fundet via research",
  },
  {
    name: "owner_company_cvr",
    label: "Ejer CVR",
    type: "string",
    fieldType: "text",
    groupName: "ejendom_ai",
    description: "CVR-nummer på ejerselskab",
  },
  {
    name: "research_summary",
    label: "Research Opsummering",
    type: "string",
    fieldType: "textarea",
    groupName: "ejendom_ai",
    description: "AI-genereret opsummering af research",
  },
  {
    name: "research_links",
    label: "Research Links",
    type: "string",
    fieldType: "textarea",
    groupName: "ejendom_ai",
    description: "Links til kilder brugt i research",
  },
  {
    name: "outdoor_potential_notes",
    label: "Outdoor Potentiale Noter",
    type: "string",
    fieldType: "textarea",
    groupName: "ejendom_ai",
    description: "Noter om ejendommens outdoor potentiale",
  },
  {
    name: "email_draft_subject",
    label: "Email Udkast – Emne",
    type: "string",
    fieldType: "text",
    groupName: "ejendom_ai",
    description: "Autogenereret emne til outreach-mail",
  },
  {
    name: "email_draft_body",
    label: "Email Udkast – Brødtekst",
    type: "string",
    fieldType: "textarea",
    groupName: "ejendom_ai",
    description: "Autogenereret mailudkast til outreach",
  },
  {
    name: "email_draft_note",
    label: "Email Udkast – Intern Note",
    type: "string",
    fieldType: "textarea",
    groupName: "ejendom_ai",
    description: "Intern note om mailudkastet",
  },
];

export async function POST() {
  const token = config.hubspot.accessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const results: { property: string; status: string; error?: string }[] = [];

  // First, try to create the property group
  try {
    await fetch(
      `https://api.hubapi.com/crm/v3/properties/${EJENDOMME_OBJECT_TYPE}/groups`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "ejendom_ai",
          label: "Ejendom AI",
          displayOrder: 1,
        }),
      }
    );
  } catch {
    // Group might already exist, that's fine
  }

  // Create each property
  for (const prop of CUSTOM_PROPERTIES) {
    try {
      const response = await fetch(
        `https://api.hubapi.com/crm/v3/properties/${EJENDOMME_OBJECT_TYPE}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(prop),
        }
      );

      if (response.ok) {
        results.push({ property: prop.name, status: "created" });
      } else {
        const error = await response.json();
        if (error.message?.includes("already exists")) {
          results.push({ property: prop.name, status: "already_exists" });
        } else {
          results.push({
            property: prop.name,
            status: "error",
            error: error.message || JSON.stringify(error),
          });
        }
      }
    } catch (e) {
      results.push({
        property: prop.name,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const created = results.filter((r) => r.status === "created").length;
  const existing = results.filter((r) => r.status === "already_exists").length;
  const errors = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    message: `${created} oprettet, ${existing} eksisterede allerede, ${errors} fejl`,
    results,
  });
}
