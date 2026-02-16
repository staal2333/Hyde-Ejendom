// ============================================================
// POST /api/ooh/hubspot-sync
//
// Auto-syncs ALL HubSpot contacts into ooh_contacts.
// Matches by email to avoid duplicates – updates existing,
// creates new. Also pulls ejendomme for context.
// ============================================================

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getContacts, upsertContact } from "@/lib/ooh/store";
import type { OOHContact } from "@/lib/ooh/types";

const BASE_URL = "https://api.hubapi.com";

function getHeaders() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function POST() {
  try {
    const headers = getHeaders();

    // 1. Fetch ALL HubSpot contacts (paginated)
    const contactProps = [
      "email", "firstname", "lastname", "phone", "company",
      "jobtitle", "city", "hs_lead_status", "lifecyclestage",
    ].join(",");

    interface HSContact {
      id: string;
      properties: Record<string, string | null>;
    }

    let allHsContacts: HSContact[] = [];
    let after: string | undefined = undefined;

    // Paginate through all contacts
    for (let page = 0; page < 20; page++) {
      const fetchUrl: string = `${BASE_URL}/crm/v3/objects/contacts?limit=100&properties=${contactProps}${after ? `&after=${after}` : ""}`;
      const fetchRes: Response = await fetch(fetchUrl, { headers });
      if (!fetchRes.ok) {
        const err = await fetchRes.text();
        throw new Error(`HubSpot error (${fetchRes.status}): ${err}`);
      }
      const pageData: { results?: HSContact[]; paging?: { next?: { after?: string } } } = await fetchRes.json();
      allHsContacts = allHsContacts.concat(pageData.results || []);

      if (pageData.paging?.next?.after) {
        after = pageData.paging.next.after;
      } else {
        break; // No more pages
      }
    }

    // 2. Also fetch ejendomme contacts (people from ejendom contact fields)
    let ejendomContacts: { name: string; email: string; phone: string; company: string; city: string }[] = [];
    try {
      const ejProps = ["hs_name", "hs_city", "kontaktperson", "mailadresse", "telefonnummer", "virksomhed"].join(",");
      const ejRes = await fetch(
        `${BASE_URL}/crm/v3/objects/0-420?limit=100&properties=${ejProps}`,
        { headers }
      );
      if (ejRes.ok) {
        const ejData = await ejRes.json();
        for (const ej of ejData.results || []) {
          const p = ej.properties;
          if (p.mailadresse) {
            ejendomContacts.push({
              name: p.kontaktperson || p.hs_name || "",
              email: p.mailadresse,
              phone: p.telefonnummer || "",
              company: p.virksomhed || "",
              city: p.hs_city || "",
            });
          }
        }
      }
    } catch {
      // Non-critical, ejendomme contacts are a bonus
    }

    // 3. Get existing OOH contacts for dedup
    const existing = await getContacts();
    const existingByEmail = new Map<string, OOHContact>();
    for (const c of existing) {
      if (c.email) existingByEmail.set(c.email.toLowerCase(), c);
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // 4. Sync HubSpot CRM contacts
    for (const hc of allHsContacts) {
      const p = hc.properties;
      const email = (p.email || "").trim().toLowerCase();
      if (!email) { skipped++; continue; }

      const name = [p.firstname, p.lastname].filter(Boolean).join(" ") || "Ukendt";
      const company = p.company || "";
      const phone = p.phone || "";
      const city = p.city || "";
      const industry = p.jobtitle || "";

      const existingContact = existingByEmail.get(email);

      if (existingContact) {
        // Update if HubSpot has more data
        let changed = false;
        if (!existingContact.company && company) { existingContact.company = company; changed = true; }
        if (!existingContact.phone && phone) { existingContact.phone = phone; changed = true; }
        if (!existingContact.city && city) { existingContact.city = city; changed = true; }
        if (!existingContact.industry && industry) { existingContact.industry = industry; changed = true; }
        if (!existingContact.tags.includes("hubspot")) { existingContact.tags.push("hubspot"); changed = true; }
        if (changed) {
          await upsertContact(existingContact);
          updated++;
        } else {
          skipped++;
        }
      } else {
        // Create new
        const newContact: OOHContact = {
          id: `contact_hs_${hc.id}_${Date.now().toString(36)}`,
          name,
          email,
          phone: phone || undefined,
          company,
          industry: industry || undefined,
          city: city || undefined,
          tags: ["hubspot"],
          notes: `Synkroniseret fra HubSpot (ID: ${hc.id})`,
          totalProposalsSent: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await upsertContact(newContact);
        existingByEmail.set(email, newContact);
        created++;
      }
    }

    // 5. Also sync ejendomme contact persons (if not already in)
    for (const ec of ejendomContacts) {
      const email = ec.email.trim().toLowerCase();
      if (!email || existingByEmail.has(email)) continue;

      const newContact: OOHContact = {
        id: `contact_ej_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: ec.name || "Ukendt",
        email,
        phone: ec.phone || undefined,
        company: ec.company || "",
        city: ec.city || undefined,
        tags: ["hubspot", "ejendom"],
        notes: "Kontakt fra HubSpot ejendom",
        totalProposalsSent: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await upsertContact(newContact);
      existingByEmail.set(email, newContact);
      created++;
    }

    return NextResponse.json({
      success: true,
      hubspotTotal: allHsContacts.length,
      ejendommeContacts: ejendomContacts.length,
      created,
      updated,
      skipped,
      totalOohContacts: existingByEmail.size,
    });
  } catch (error) {
    console.error("[hubspot-sync] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
