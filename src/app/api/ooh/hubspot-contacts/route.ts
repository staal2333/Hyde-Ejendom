// ============================================================
// GET /api/ooh/hubspot-contacts
//
// Bridge endpoint: fetches HubSpot contacts (from CRM) and
// ejendomme (properties) to enrich OOH outreach data.
//
// Returns contacts with associated property/ejendom data.
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

const BASE_URL = "https://api.hubapi.com";

function getHeaders() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

interface HubSpotContact {
  id: string;
  properties: Record<string, string | null>;
}

interface HubSpotProperty {
  id: string;
  properties: Record<string, string | null>;
}

/** GET /api/ooh/hubspot-contacts – fetch HubSpot CRM contacts + ejendomme */
export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search") || "";

    // Fetch HubSpot contacts
    const contactProps = [
      "email", "firstname", "lastname", "phone", "company",
      "jobtitle", "city", "hs_lead_status", "lifecyclestage",
      "notes_last_updated", "num_associated_deals",
    ].join(",");

    let contactUrl = `${BASE_URL}/crm/v3/objects/contacts?limit=100&properties=${contactProps}`;

    const contactsRes = await fetch(contactUrl, { headers: getHeaders() });
    if (!contactsRes.ok) {
      const errText = await contactsRes.text();
      throw new Error(`HubSpot contacts error (${contactsRes.status}): ${errText}`);
    }
    const contactsData = await contactsRes.json();
    const hubspotContacts: HubSpotContact[] = contactsData.results || [];

    // Fetch ejendomme (custom object 0-420)
    const ejendomProps = [
      "hs_name", "hs_address_1", "hs_city", "hs_zip",
      "outreach_status", "outdoor_score", "owner_company_name",
      "kontaktperson", "mailadresse", "telefonnummer", "virksomhed",
      "email_draft_subject", "email_draft_body",
    ].join(",");

    let ejendomme: HubSpotProperty[] = [];
    try {
      const ejRes = await fetch(
        `${BASE_URL}/crm/v3/objects/0-420?limit=100&properties=${ejendomProps}`,
        { headers: getHeaders() }
      );
      if (ejRes.ok) {
        const ejData = await ejRes.json();
        ejendomme = ejData.results || [];
      }
    } catch (e) {
      console.warn("[hubspot-contacts] Could not fetch ejendomme:", e);
    }

    // Map contacts
    const contacts = hubspotContacts
      .filter(c => {
        if (!search) return true;
        const q = search.toLowerCase();
        const p = c.properties;
        return (
          (p.firstname || "").toLowerCase().includes(q) ||
          (p.lastname || "").toLowerCase().includes(q) ||
          (p.email || "").toLowerCase().includes(q) ||
          (p.company || "").toLowerCase().includes(q)
        );
      })
      .map(c => {
        const p = c.properties;
        return {
          hubspotId: c.id,
          name: [p.firstname, p.lastname].filter(Boolean).join(" ") || "Ukendt",
          email: p.email || "",
          phone: p.phone || "",
          company: p.company || "",
          jobTitle: p.jobtitle || "",
          city: p.city || "",
          leadStatus: p.hs_lead_status || "",
          lifecycleStage: p.lifecyclestage || "",
        };
      });

    // Map ejendomme
    const properties = ejendomme.map(e => {
      const p = e.properties;
      return {
        hubspotId: e.id,
        name: p.hs_name || "",
        address: p.hs_address_1 || "",
        city: p.hs_city || "",
        zip: p.hs_zip || "",
        outreachStatus: p.outreach_status || "NY_KRAEVER_RESEARCH",
        outdoorScore: p.outdoor_score ? parseFloat(p.outdoor_score) : undefined,
        ownerCompany: p.owner_company_name || p.virksomhed || "",
        contactPerson: p.kontaktperson || "",
        contactEmail: p.mailadresse || "",
        contactPhone: p.telefonnummer || "",
        emailDraftSubject: p.email_draft_subject || "",
        emailDraftBody: p.email_draft_body || "",
      };
    });

    return NextResponse.json({
      contacts,
      properties,
      totalContacts: contacts.length,
      totalProperties: properties.length,
    });
  } catch (error) {
    console.error("[hubspot-contacts] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error", contacts: [], properties: [] },
      { status: 500 }
    );
  }
}

/** POST /api/ooh/hubspot-contacts – Import HubSpot contacts into OOH contacts */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactIds } = body as { contactIds: string[] };

    if (!contactIds?.length) {
      return NextResponse.json({ error: "No contactIds provided" }, { status: 400 });
    }

    // Fetch selected contacts from HubSpot
    const headers = getHeaders();
    const contactProps = ["email", "firstname", "lastname", "phone", "company", "jobtitle", "city"];

    const imported: { hubspotId: string; oohContactId: string; name: string }[] = [];

    for (const hsId of contactIds) {
      try {
        const res = await fetch(
          `${BASE_URL}/crm/v3/objects/contacts/${hsId}?properties=${contactProps.join(",")}`,
          { headers }
        );
        if (!res.ok) continue;
        const hsContact = await res.json();
        const p = hsContact.properties;

        const name = [p.firstname, p.lastname].filter(Boolean).join(" ") || "Ukendt";

        // Create OOH contact via the contacts API
        const oohRes = await fetch(new URL("/api/ooh/contacts", req.url).toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email: p.email || "",
            phone: p.phone || undefined,
            company: p.company || "",
            industry: p.jobtitle || undefined,
            city: p.city || undefined,
            tags: ["hubspot"],
            notes: `Importeret fra HubSpot (ID: ${hsId})`,
          }),
        });

        if (oohRes.ok) {
          const created = await oohRes.json();
          imported.push({ hubspotId: hsId, oohContactId: created.id, name });
        }
      } catch (err) {
        console.error(`[hubspot-contacts] Error importing ${hsId}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      imported: imported.length,
      contacts: imported,
    });
  } catch (error) {
    console.error("[hubspot-contacts] Import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
