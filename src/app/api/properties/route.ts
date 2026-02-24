// ============================================================
// Properties API – For the dashboard
// GET  /api/properties → list all ejendomme with stats
// POST /api/properties → create a single ejendom by address (→ staging)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { fetchAllEjendomme } from "@/lib/hubspot";
import { insertStagedProperty, stagedExistsByAddress } from "@/lib/staging/store";
import { apiError } from "@/lib/api-error";
import { createPropertySchema, parseBody } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const properties = await fetchAllEjendomme(100);

    // Ejendomme already have contact info on the object itself
    const enriched = properties.map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address,
      postalCode: p.postalCode,
      city: p.city,
      outreachStatus: p.outreachStatus,
      outdoorScore: p.outdoorScore,
      ownerCompanyName: p.ownerCompanyName,
      researchSummary: p.researchSummary,
      emailDraftSubject: p.emailDraftSubject,
      emailDraftBody: p.emailDraftBody,
      contactPerson: p.contactPerson || null,
      contactEmail: p.contactEmail || null,
      contactCount: p.contactPerson ? 1 : 0,
      primaryContact: p.contactPerson
        ? {
            name: p.contactPerson,
            email: p.contactEmail || null,
            role: null,
          }
        : null,
      lastModifiedDate: p.updatedAt || null,
    }));

    return NextResponse.json({
      properties: enriched,
      total: enriched.length,
    });
  } catch (error) {
    logger.error("Failed to fetch ejendomme", {
      service: "api-properties",
      error: { message: error instanceof Error ? error.message : String(error) },
    });
    return NextResponse.json({ properties: [], total: 0 });
  }
}

/**
 * POST /api/properties
 * Create a single ejendom from an address string.
 * Body: { address, city?, postalCode?, startResearch?, outdoorScore?, dailyTraffic?, trafficSource?, outdoorNotes?, source? }
 */
export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = parseBody(createPropertySchema, raw);
    if (!parsed.ok) return apiError(400, parsed.error, parsed.detail);

    const { address, city, postalCode, startResearch, outdoorScore, dailyTraffic, trafficSource, outdoorNotes, source: bodySource } = parsed.data;
    const trimmedAddress = address.trim();

    // Parse address components if not provided separately
    let parsedCity = city?.trim() || "";
    let parsedPostal = postalCode?.trim() || "";

    if (!parsedCity || !parsedPostal) {
      const parts = trimmedAddress.split(",").map((s: string) => s.trim());
      if (parts.length >= 2) {
        const afterComma = parts[1];
        const postalMatch = afterComma.match(/^(\d{4})\s+(.+)$/);
        if (postalMatch) {
          if (!parsedPostal) parsedPostal = postalMatch[1];
          if (!parsedCity) parsedCity = postalMatch[2];
        } else {
          if (!parsedCity) parsedCity = afterComma;
        }
      }
    }

    const streetAddress = trimmedAddress.split(",")[0].trim();
    const exists = await stagedExistsByAddress(streetAddress);
    if (exists) {
      return apiError(409, `Ejendommen "${streetAddress}" eksisterer allerede i staging`);
    }

    const source = bodySource === "discovery" ? "discovery" : "manual";
    const staged = await insertStagedProperty({
      name: streetAddress,
      address: streetAddress,
      postalCode: parsedPostal,
      city: parsedCity,
      outdoorScore: outdoorScore != null ? Number(outdoorScore) : undefined,
      dailyTraffic: dailyTraffic != null ? Number(dailyTraffic) : undefined,
      trafficSource: trafficSource ?? undefined,
      outdoorNotes: outdoorNotes ?? undefined,
      source,
    });

    return NextResponse.json({
      success: true,
      id: staged.id,
      address: streetAddress,
      city: parsedCity,
      postalCode: parsedPostal,
      startResearch: startResearch === true,
      staged: true,
    });
  } catch (error) {
    logger.error("Failed to create ejendom", {
      service: "api-properties",
      error: { message: error instanceof Error ? error.message : String(error) },
    });
    return apiError(500, error instanceof Error ? error.message : "Ukendt fejl ved oprettelse");
  }
}
