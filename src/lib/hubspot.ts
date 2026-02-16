// ============================================================
// HubSpot API Client
// Uses custom object "Ejendomme" (type 0-420 / Listings)
// ============================================================

import { config } from "./config";
import type {
  Property,
  Contact,
  OutreachStatus,
} from "@/types";

// ─── Constants ──────────────────────────────────────────────

const EJENDOMME_OBJECT_TYPE = "0-420";

const BASE_URL = "https://api.hubapi.com";

/** All properties we want to read from the Ejendomme object */
const EJENDOM_PROPERTIES = [
  "hs_name",
  "hs_address_1",
  "hs_address_2",
  "hs_city",
  "hs_zip",
  "hs_neighborhood",
  "hs_listing_type",
  "hs_price",
  "hs_lot_size",
  "hs_year_built",
  "hs_bedrooms",
  "hs_bathrooms",
  "hs_square_footage",
  // Existing custom fields
  "kontaktperson",
  "mailadresse",
  "telefonnummer",
  "virksomhed",
  // Our AI fields
  "outreach_status",
  "outdoor_score",
  "owner_company_name",
  "owner_company_cvr",
  "research_summary",
  "research_links",
  "outdoor_potential_notes",
  "email_draft_subject",
  "email_draft_body",
  "email_draft_note",
];

// ─── HTTP Helpers ───────────────────────────────────────────

function getHeaders() {
  return {
    Authorization: `Bearer ${config.hubspot.accessToken()}`,
    "Content-Type": "application/json",
  };
}

async function hubspotGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: getHeaders() });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`HubSpot GET ${path} failed (${res.status}): ${error}`);
  }
  return res.json();
}

async function hubspotPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`HubSpot POST ${path} failed (${res.status}): ${error}`);
  }
  return res.json();
}

async function hubspotPatch(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`HubSpot PATCH ${path} failed (${res.status}): ${error}`);
  }
  return res.json();
}

// ─── Ejendomme (Listings / Custom Object 0-420) ────────────

/**
 * Fetch all ejendomme with a given outreach_status
 */
export async function fetchEjendommeByStatus(
  status: OutreachStatus,
  limit = 50
): Promise<Property[]> {
  const data = await hubspotPost(
    `/crm/v3/objects/${EJENDOMME_OBJECT_TYPE}/search`,
    {
      filterGroups: [
        {
          filters: [
            {
              propertyName: "outreach_status",
              operator: "EQ",
              value: status,
            },
          ],
        },
      ],
      properties: EJENDOM_PROPERTIES,
      limit,
      sorts: [{ propertyName: "hs_createdate", direction: "ASCENDING" }],
    }
  );

  return ((data.results as HubSpotRecord[]) || []).map(mapRecordToProperty);
}

/**
 * Fetch all ejendomme (for dashboard)
 */
export async function fetchAllEjendomme(limit = 100): Promise<Property[]> {
  const props = EJENDOM_PROPERTIES.join(",");
  const data = await hubspotGet(
    `/crm/v3/objects/${EJENDOMME_OBJECT_TYPE}?limit=${limit}&properties=${props}`
  );

  return ((data.results as HubSpotRecord[]) || []).map(mapRecordToProperty);
}

/**
 * Fetch a single ejendom by ID
 */
export async function fetchEjendomById(id: string): Promise<Property> {
  const props = EJENDOM_PROPERTIES.join(",");
  const data = await hubspotGet(
    `/crm/v3/objects/${EJENDOMME_OBJECT_TYPE}/${id}?properties=${props}`
  );
  return mapRecordToProperty(data as unknown as HubSpotRecord);
}

/**
 * Update an ejendom's properties
 */
export async function updateEjendom(
  id: string,
  properties: Record<string, string>
): Promise<void> {
  await hubspotPatch(`/crm/v3/objects/${EJENDOMME_OBJECT_TYPE}/${id}`, {
    properties,
  });
}

/**
 * Update ejendom after research is done
 */
export async function updateEjendomResearch(
  id: string,
  data: {
    ownerCompanyName?: string;
    ownerCompanyCvr?: string | null;
    outdoorScore?: number;
    researchSummary?: string;
    researchLinks?: string;
    outreachStatus: OutreachStatus;
  }
): Promise<void> {
  const properties: Record<string, string> = {
    outreach_status: data.outreachStatus,
  };

  if (data.ownerCompanyName) properties.owner_company_name = data.ownerCompanyName;
  if (data.ownerCompanyCvr) properties.owner_company_cvr = data.ownerCompanyCvr;
  if (data.outdoorScore !== undefined) properties.outdoor_score = String(data.outdoorScore);
  if (data.researchSummary) properties.research_summary = data.researchSummary;
  if (data.researchLinks) properties.research_links = data.researchLinks;

  await updateEjendom(id, properties);
}

/**
 * Save email draft directly on the ejendom
 */
export async function saveEmailDraft(
  ejendomId: string,
  subject: string,
  body: string,
  internalNote: string
): Promise<void> {
  await updateEjendom(ejendomId, {
    email_draft_subject: subject,
    email_draft_body: body,
    email_draft_note: internalNote,
  });
}

// ─── Create New Ejendom ─────────────────────────────────────

/**
 * Create a new ejendom in HubSpot (custom object 0-420).
 * Returns the new record ID.
 */
export async function createEjendom(data: {
  name: string;
  address: string;
  postalCode: string;
  city: string;
  outdoorScore?: number;
  outdoorPotentialNotes?: string;
  outreachStatus?: OutreachStatus;
}): Promise<string> {
  const properties: Record<string, string> = {
    hs_name: data.name,
    hs_address_1: data.address,
    hs_zip: data.postalCode,
    hs_city: data.city,
    outreach_status: data.outreachStatus || "NY_KRAEVER_RESEARCH",
  };

  if (data.outdoorScore !== undefined) {
    properties.outdoor_score = String(data.outdoorScore);
  }
  if (data.outdoorPotentialNotes) {
    properties.outdoor_potential_notes = data.outdoorPotentialNotes;
  }

  const result = await hubspotPost(
    `/crm/v3/objects/${EJENDOMME_OBJECT_TYPE}`,
    { properties }
  ) as { id: string };

  return result.id;
}

/**
 * Check if an ejendom already exists by address (dedup).
 */
export async function ejendomExistsByAddress(address: string): Promise<boolean> {
  try {
    const data = await hubspotPost(
      `/crm/v3/objects/${EJENDOMME_OBJECT_TYPE}/search`,
      {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "hs_address_1",
                operator: "EQ",
                value: address,
              },
            ],
          },
        ],
        properties: ["hs_name"],
        limit: 1,
      }
    ) as { total: number };

    return (data.total || 0) > 0;
  } catch {
    return false;
  }
}

// ─── Contacts ───────────────────────────────────────────────

/**
 * Upsert a contact (create or update based on email).
 * Also updates the ejendom's kontaktperson/mailadresse/telefonnummer fields.
 */
export async function upsertContact(
  contact: Contact,
  ejendomId: string
): Promise<string> {
  // Split full name
  const nameParts = (contact.fullName || "").trim().split(/\s+/);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.slice(1).join(" ") || "";

  const properties: Record<string, string> = {
    firstname: firstName,
    lastname: lastName,
  };

  if (contact.email) properties.email = contact.email;
  if (contact.phone) properties.phone = contact.phone;

  let contactId: string;

  // Try to find existing contact by email
  if (contact.email) {
    try {
      const searchResult = await hubspotPost("/crm/v3/objects/contacts/search", {
        filterGroups: [
          {
            filters: [
              { propertyName: "email", operator: "EQ", value: contact.email },
            ],
          },
        ],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      }) as { results: { id: string }[] };

      if (searchResult.results?.length > 0) {
        contactId = searchResult.results[0].id;
        await hubspotPatch(`/crm/v3/objects/contacts/${contactId}`, { properties });
      } else {
        const created = await hubspotPost("/crm/v3/objects/contacts", { properties }) as { id: string };
        contactId = created.id;
      }
    } catch {
      const created = await hubspotPost("/crm/v3/objects/contacts", { properties }) as { id: string };
      contactId = created.id;
    }
  } else {
    const created = await hubspotPost("/crm/v3/objects/contacts", { properties }) as { id: string };
    contactId = created.id;
  }

  // Also update the ejendom's own contact fields with the best contact
  try {
    const ejendomUpdate: Record<string, string> = {};
    if (contact.fullName) ejendomUpdate.kontaktperson = contact.fullName;
    if (contact.email) ejendomUpdate.mailadresse = contact.email;
    if (contact.phone) ejendomUpdate.telefonnummer = contact.phone;
    if (Object.keys(ejendomUpdate).length > 0) {
      await updateEjendom(ejendomId, ejendomUpdate);
    }
  } catch (e) {
    console.warn("Could not update ejendom contact fields:", e);
  }

  return contactId;
}

// ─── Notes (via Engagements API) ────────────────────────────

/**
 * Add a note via the engagements API. Falls back gracefully.
 */
export async function addDraftNoteToContact(
  contactId: string,
  noteTitle: string,
  noteBody: string
): Promise<string> {
  try {
    const data = await hubspotPost("/engagements/v1/engagements", {
      engagement: { active: true, type: "NOTE", timestamp: Date.now() },
      associations: { contactIds: [parseInt(contactId, 10)] },
      metadata: {
        body: `<strong>${noteTitle}</strong><br><br>${noteBody.replace(/\n/g, "<br>")}`,
      },
    }) as { engagement?: { id?: number } };

    return data?.engagement?.id?.toString() || "ok";
  } catch (e) {
    console.warn("Note creation failed:", e);
    return "skipped";
  }
}

/**
 * Create a follow-up task via engagements API.
 */
export async function createFollowUpTask(
  contactId: string,
  title: string,
  _dueDays = 2,
  _priority: "HIGH" | "MEDIUM" | "LOW" = "HIGH"
): Promise<string> {
  try {
    const data = await hubspotPost("/engagements/v1/engagements", {
      engagement: { active: true, type: "TASK", timestamp: Date.now() },
      associations: { contactIds: [parseInt(contactId, 10)] },
      metadata: {
        body: title,
        subject: title,
        status: "NOT_STARTED",
        forObjectType: "CONTACT",
      },
    }) as { engagement?: { id?: number } };

    return data?.engagement?.id?.toString() || "ok";
  } catch (e) {
    console.warn("Task creation failed:", e);
    return "skipped";
  }
}

// ─── Dashboard Stats ────────────────────────────────────────

export async function getDashboardStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
}> {
  const ejendomme = await fetchAllEjendomme(100);
  const byStatus: Record<string, number> = {};

  for (const e of ejendomme) {
    const status = e.outreachStatus || "UKENDT";
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  return { total: ejendomme.length, byStatus };
}

// ─── Helpers ────────────────────────────────────────────────

interface HubSpotRecord {
  id: string;
  properties: Record<string, string | null>;
}

function mapRecordToProperty(record: HubSpotRecord): Property {
  const p = record.properties;
  return {
    id: record.id,
    name: p.hs_name || "",
    address: [p.hs_address_1, p.hs_address_2].filter(Boolean).join(" "),
    postalCode: p.hs_zip || "",
    city: p.hs_city || "",
    outreachStatus: (p.outreach_status as OutreachStatus) || "NY_KRAEVER_RESEARCH",
    outdoorScore: p.outdoor_score ? parseFloat(p.outdoor_score) : undefined,
    ownerCompanyName: p.owner_company_name || p.virksomhed || undefined,
    ownerCompanyCvr: p.owner_company_cvr || undefined,
    researchSummary: p.research_summary || undefined,
    researchLinks: p.research_links || undefined,
    outdoorPotentialNotes: p.outdoor_potential_notes || undefined,
    // Extra fields from the Ejendomme object
    neighborhood: p.hs_neighborhood || undefined,
    listingType: p.hs_listing_type || undefined,
    yearBuilt: p.hs_year_built ? parseInt(p.hs_year_built) : undefined,
    squareFootage: p.hs_square_footage ? parseFloat(p.hs_square_footage) : undefined,
    lotSize: p.hs_lot_size ? parseFloat(p.hs_lot_size) : undefined,
    price: p.hs_price ? parseFloat(p.hs_price) : undefined,
    // Contact info from the ejendom itself
    contactPerson: p.kontaktperson || undefined,
    contactEmail: p.mailadresse || undefined,
    contactPhone: p.telefonnummer || undefined,
    companyName: p.virksomhed || undefined,
    // Email draft
    emailDraftSubject: p.email_draft_subject || undefined,
    emailDraftBody: p.email_draft_body || undefined,
    emailDraftNote: p.email_draft_note || undefined,
  };
}
