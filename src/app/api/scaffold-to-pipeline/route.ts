// ============================================================
// Scaffold-to-Pipeline Endpoint
// POST /api/scaffold-to-pipeline
// Creates a HubSpot property from a high-scoring scaffold find
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createEjendom, ejendomExistsByAddress } from "@/lib/hubspot";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { address, city, postalCode, score, source, category, applicant } = body as {
      address: string;
      city?: string;
      postalCode?: string;
      score?: number;
      source?: string;
      category?: string;
      applicant?: string;
    };

    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    // Check for duplicates
    const exists = await ejendomExistsByAddress(address);
    if (exists) {
      logger.info(`Scaffold-to-pipeline: ${address} already exists in HubSpot`, { service: "scaffold-pipeline" });
      return NextResponse.json({
        success: false,
        reason: "already_exists",
        message: `${address} findes allerede i pipeline`,
      });
    }

    // Create the property
    const result = await createEjendom({
      address,
      postalCode: postalCode || "",
      city: city || "København",
      name: address,
      outdoorScore: score || 0,
      outdoorPotentialNotes: `Kilde: ${source || "scaffolding"}. Kategori: ${category || "N/A"}. Entrepr: ${applicant || "N/A"}`,
    });

    logger.info(`Scaffold-to-pipeline: Created ${address} in HubSpot`, {
      service: "scaffold-pipeline",
      metadata: { hubspotId: result, category, applicant },
    });

    return NextResponse.json({
      success: true,
      hubspotId: result,
      address,
    });
  } catch (err) {
    logger.error(`Scaffold-to-pipeline error: ${err instanceof Error ? err.message : "Unknown"}`, {
      service: "scaffold-pipeline",
      error: { message: err instanceof Error ? err.message : "Unknown" },
    });

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
