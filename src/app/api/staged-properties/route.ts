// ============================================================
// CRUD API for Staged Properties
// GET  /api/staged-properties         – list with filters
// POST /api/staged-properties         – create new staged property
// PUT  /api/staged-properties?id=X    – update
// DELETE /api/staged-properties?id=X  – delete
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  listStagedProperties,
  insertStagedProperty,
  updateStagedProperty,
  deleteStagedProperty,
  getStagedCounts,
} from "@/lib/staging/store";
import type { StagedStage, StagedSource } from "@/lib/staging/store";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get("stage") as StagedStage | null;
    const source = searchParams.get("source") as StagedSource | null;
    const city = searchParams.get("city");
    const search = searchParams.get("search");
    const countsOnly = searchParams.get("counts") === "true";

    if (countsOnly) {
      const counts = await getStagedCounts();
      return NextResponse.json({ counts });
    }

    const properties = await listStagedProperties({
      stage: stage || undefined,
      source: source || undefined,
      city: city || undefined,
      search: search || undefined,
    });

    return NextResponse.json({ properties });
  } catch (error) {
    console.error("[staged-properties] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, address, postalCode, city, outdoorScore, outdoorNotes, dailyTraffic, trafficSource, source } = body;

    if (!name || !address) {
      return NextResponse.json(
        { error: "name and address are required" },
        { status: 400 }
      );
    }

    const property = await insertStagedProperty({
      name,
      address,
      postalCode,
      city,
      outdoorScore,
      outdoorNotes,
      dailyTraffic,
      trafficSource,
      source: source || "manual",
    });

    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    console.error("[staged-properties] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const body = await req.json();
    const updated = await updateStagedProperty(id, body);

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ property: updated });
  } catch (error) {
    console.error("[staged-properties] PUT error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const ok = await deleteStagedProperty(id);
    if (!ok) {
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[staged-properties] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
