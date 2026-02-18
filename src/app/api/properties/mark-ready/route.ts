// ============================================================
// Mark property ready for outreach (push to pipeline)
// POST /api/properties/mark-ready
// Sets outreachStatus to KLAR_TIL_UDSENDELSE – only after user chooses.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { updateEjendomResearch } from "@/lib/hubspot";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { propertyId } = body as { propertyId?: string };

    if (!propertyId || typeof propertyId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid propertyId" },
        { status: 400 }
      );
    }

    await updateEjendomResearch(propertyId, {
      outreachStatus: "KLAR_TIL_UDSENDELSE",
    });

    return NextResponse.json({
      success: true,
      propertyId,
      outreachStatus: "KLAR_TIL_UDSENDELSE",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
