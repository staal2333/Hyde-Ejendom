// ============================================================
// Properties API – For the dashboard
// GET  /api/properties → list all ejendomme with stats
// POST /api/properties → create a single ejendom by address (→ staging)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { fetchAllEjendomme } from "@/lib/hubspot";
import { insertStagedProperty, stagedExistsByAddress } from "@/lib/staging/store";

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
    }));

    return NextResponse.json({
      properties: enriched,
      total: enriched.length,
    });
  } catch (error) {
    console.error("[API] Failed to fetch ejendomme:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        properties: [],
        total: 0,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/properties
 * Create a single ejendom from an address string.
 * Body: { address: string, city?: string, postalCode?: string, startResearch?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, city, postalCode, startResearch } = body;

    if (!address || typeof address !== "string" || address.trim().length < 3) {
      return NextResponse.json(
        { error: "En gyldig adresse er påkrævet (min. 3 tegn)" },
        { status: 400 }
      );
    }

    const trimmedAddress = address.trim();

    // Parse address components if not provided separately
    // Handles formats like "Jagtvej 43, 2200 København" or just "Jagtvej 43"
    let parsedCity = city?.trim() || "";
    let parsedPostal = postalCode?.trim() || "";

    if (!parsedCity || !parsedPostal) {
      // Try to parse from a full address string with comma
      const parts = trimmedAddress.split(",").map(s => s.trim());
      if (parts.length >= 2) {
        const afterComma = parts[1];
        // Try to extract postal code (4 digits) and city
        const postalMatch = afterComma.match(/^(\d{4})\s+(.+)$/);
        if (postalMatch) {
          if (!parsedPostal) parsedPostal = postalMatch[1];
          if (!parsedCity) parsedCity = postalMatch[2];
        } else {
          if (!parsedCity) parsedCity = afterComma;
        }
      }
    }

    // The actual street address (first part before comma, or the full string)
    const streetAddress = trimmedAddress.split(",")[0].trim();

    // Check for duplicates in staging
    const exists = await stagedExistsByAddress(streetAddress);
    if (exists) {
      return NextResponse.json(
        { error: `Ejendommen "${streetAddress}" eksisterer allerede i staging` },
        { status: 409 }
      );
    }

    // Create in staging (NOT HubSpot directly)
    const staged = await insertStagedProperty({
      name: streetAddress,
      address: streetAddress,
      postalCode: parsedPostal,
      city: parsedCity,
      source: "manual",
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
    console.error("[API] Failed to create ejendom:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl ved oprettelse" },
      { status: 500 }
    );
  }
}
