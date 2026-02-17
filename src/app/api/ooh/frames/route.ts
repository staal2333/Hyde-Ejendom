import { NextRequest, NextResponse } from "next/server";
import { getFrames, getFrame, upsertFrame, deleteFrame, seedDemoData } from "@/lib/ooh/store";
import type { Frame } from "@/lib/ooh/types";

export const runtime = "nodejs";

// Ensure demo data on first call
let seeded = false;
function ensureSeeded() {
  if (!seeded) { seedDemoData(); seeded = true; }
}

export async function GET(req: NextRequest) {
  try {
    ensureSeeded();
    const { searchParams } = req.nextUrl;
    const city = searchParams.get("city") || undefined;
    const type = searchParams.get("type") || undefined;
    const search = searchParams.get("search") || undefined;

    const framesList = await getFrames({ city, type, search });
    return NextResponse.json({ frames: framesList, total: framesList.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[frames]", msg);
    return NextResponse.json({ frames: [], total: 0, error: msg });
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const body = await req.json();

    const frame: Frame = {
      id: `frame_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: body.name,
      locationAddress: body.locationAddress,
      locationCity: body.locationCity,
      frameType: body.frameType || "scaffolding",
      driveFileId: body.driveFileId,
      frameImageUrl: body.frameImageUrl || "",
      placement: body.placement || { x: 0, y: 0, width: 600, height: 400, label: "Front" },
      placements: body.placements || [body.placement || { x: 0, y: 0, width: 600, height: 400, label: "Front" }],
      frameWidth: body.frameWidth || 800,
      frameHeight: body.frameHeight || 600,
      dailyTraffic: body.dailyTraffic,
      listPrice: body.listPrice,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertFrame(frame);
    return NextResponse.json(frame, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[frames]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT – update an existing frame (placement, name, etc.) */
export async function PUT(req: NextRequest) {
  try {
    ensureSeeded();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const existing = await getFrame(id);
    if (!existing) {
      return NextResponse.json({ error: "Frame not found" }, { status: 404 });
    }

    const updated: Frame = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    await upsertFrame(updated);
    return NextResponse.json(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[frames]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE – remove a frame by id */
export async function DELETE(req: NextRequest) {
  try {
    ensureSeeded();
    const { searchParams } = req.nextUrl;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id query param" }, { status: 400 });
    }

    const existed = await deleteFrame(id);
    if (!existed) {
      return NextResponse.json({ error: "Frame not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[frames]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
