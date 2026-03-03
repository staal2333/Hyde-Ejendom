// ============================================================
// POST /api/staged-properties/reject
// Bulk-reject staged properties – marks as rejected, never touches HubSpot
// Body: { ids: string[] }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { updateStagedProperty } from "@/lib/staging/store";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  let body: { ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const ids = body.ids;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 }
      );
    }

    if (ids.length > 50) {
      return NextResponse.json(
        { error: "Max 50 ids per request" },
        { status: 400 }
      );
    }

    let rejected = 0;
    let failed = 0;

    for (const id of ids) {
      const updated = await updateStagedProperty(id, { stage: "rejected" });
      if (updated) {
        rejected++;
      } else {
        failed++;
      }
    }

    return NextResponse.json({ ok: true, rejected, failed });
  } catch (error) {
    logger.error("Reject error", { service: "staged-properties-reject" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
