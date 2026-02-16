// ============================================================
// POST /api/staged-properties/reject
// Bulk-reject staged properties – marks as rejected, never touches HubSpot
// Body: { ids: string[] }
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { updateStagedProperty } from "@/lib/staging/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = body.ids;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
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
    console.error("[staged-properties/reject] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
