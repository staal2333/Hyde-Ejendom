import { NextRequest, NextResponse } from "next/server";
import { getNetworks, getNetwork, upsertNetwork, deleteNetwork, seedDemoData } from "@/lib/ooh/store";
import type { Network } from "@/lib/ooh/types";

export const runtime = "nodejs";

let seeded = false;
function ensureSeeded() {
  if (!seeded) { seedDemoData(); seeded = true; }
}

/** GET /api/ooh/networks – List all networks */
export async function GET() {
  try {
    ensureSeeded();
    return NextResponse.json({ networks: await getNetworks() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[networks]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/ooh/networks – Create a new network */
export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const body = await req.json();

    const network: Network = {
      id: `net_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: body.name || "Nyt Netværk",
      description: body.description,
      frameIds: body.frameIds || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertNetwork(network);
    return NextResponse.json(network, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[networks]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT /api/ooh/networks – Update a network */
export async function PUT(req: NextRequest) {
  try {
    ensureSeeded();
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existing = await getNetwork(id);
    if (!existing) return NextResponse.json({ error: "Network not found" }, { status: 404 });

    const updated: Network = { ...existing, ...updates, id: existing.id, updatedAt: new Date().toISOString() };
    await upsertNetwork(updated);
    return NextResponse.json(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[networks]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/ooh/networks?id=xxx – Delete a network */
export async function DELETE(req: NextRequest) {
  try {
    ensureSeeded();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existed = await deleteNetwork(id);
    if (!existed) return NextResponse.json({ error: "Network not found" }, { status: 404 });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[networks]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
