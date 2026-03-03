import { NextRequest, NextResponse } from "next/server";
import { getPlacement, upsertPlacement, deletePlacement } from "@/lib/tilbud/placement-store";
import { placementUpsertSchema } from "@/lib/tilbud/placement-types";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getPlacement(id);
  if (!item) {
    return NextResponse.json({ error: "Placering ikke fundet" }, { status: 404 });
  }
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = placementUpsertSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ugyldige data" },
        { status: 400 }
      );
    }
    const saved = await upsertPlacement(parsed.data);
    if (!saved) {
      return NextResponse.json({ error: "Kunne ikke opdatere placering" }, { status: 500 });
    }
    return NextResponse.json({ success: true, placement: saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deletePlacement(id);
  if (!deleted) {
    return NextResponse.json({ error: "Kunne ikke slette placering" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
