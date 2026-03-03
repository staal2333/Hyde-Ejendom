import { NextRequest, NextResponse } from "next/server";
import { deleteTilbud, getTilbud, upsertTilbud } from "@/lib/tilbud/store";
import { tilbudUpsertInputSchema } from "@/lib/tilbud/types";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tilbud = getTilbud(id);
  if (!tilbud) {
    return NextResponse.json({ error: "Tilbud ikke fundet" }, { status: 404 });
  }
  return NextResponse.json(tilbud);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = tilbudUpsertInputSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Ugyldige data" }, { status: 400 });
    }
    const saved = upsertTilbud(parsed.data);
    return NextResponse.json({ success: true, tilbud: saved });
  } catch (error) {
    logger.error("Kunne ikke opdatere tilbud", { service: "tilbud" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl ved opdatering af tilbud" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteTilbud(id);
  if (!ok) {
    return NextResponse.json({ error: "Tilbud ikke fundet" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
