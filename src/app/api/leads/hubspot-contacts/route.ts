// ============================================================
// GET /api/leads/hubspot-contacts
// Returns all HubSpot contacts for the Lead Scanner view
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

export interface HubSpotContact {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  company: string | null;
  jobtitle: string | null;
  phone: string | null;
  city: string | null;
  lifecyclestage: string | null;
  createdate: string | null;
  lastmodifieddate: string | null;
  hubspotUrl: string;
}

const BASE_URL = "https://api.hubapi.com";

function authHeaders() {
  return {
    Authorization: `Bearer ${config.hubspot.accessToken()}`,
    "Content-Type": "application/json",
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") || "";

  try {
    const contacts: HubSpotContact[] = [];
    let after: string | undefined;

    const properties = [
      "email", "firstname", "lastname", "company",
      "jobtitle", "phone", "city", "lifecyclestage",
      "createdate", "lastmodifieddate",
    ];
    const propQuery = properties.map(p => `properties=${p}`).join("&");

    // Paginate through ALL contacts with no artificial cap
    do {
      const url = `${BASE_URL}/crm/v3/objects/contacts?limit=100${after ? `&after=${after}` : ""}&${propQuery}&sort=-createdate`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) {
        logger.warn(`[hubspot-contacts] Fetch failed: ${res.status}`);
        break;
      }
      const json = await res.json() as {
        results?: { id: string; properties?: Record<string, string | null> }[];
        paging?: { next?: { after: string } };
      };

      for (const c of json.results ?? []) {
        const p = c.properties ?? {};
        const fullName = [p.firstname, p.lastname].filter(Boolean).join(" ") || p.email || c.id;
        contacts.push({
          id: c.id,
          email: p.email ?? null,
          firstName: p.firstname ?? null,
          lastName: p.lastname ?? null,
          fullName,
          company: p.company ?? null,
          jobtitle: p.jobtitle ?? null,
          phone: p.phone ?? null,
          city: p.city ?? null,
          lifecyclestage: p.lifecyclestage ?? null,
          createdate: p.createdate ?? null,
          lastmodifieddate: p.lastmodifieddate ?? null,
          hubspotUrl: `https://app.hubspot.com/contacts/${c.id}`,
        });
      }

      after = json.paging?.next?.after;
    } while (after);

    // Apply search filter
    const filtered = search
      ? contacts.filter((c) => {
          const q = search.toLowerCase();
          return (
            c.fullName.toLowerCase().includes(q) ||
            (c.email ?? "").toLowerCase().includes(q) ||
            (c.company ?? "").toLowerCase().includes(q)
          );
        })
      : contacts;

    return NextResponse.json({
      contacts: filtered,
      total: filtered.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[hubspot-contacts] Error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
