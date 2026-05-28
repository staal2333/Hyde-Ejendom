import { NextRequest, NextResponse } from "next/server";
import {
  upsertPlannedPayment,
  deletePlannedPayment,
  getPlannedPayment,
  plannedPaymentSchema,
} from "@/lib/case/planned-payments";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as Record<string, unknown>;

    // PATCH = delvis opdatering. Hent eksisterende, merge body på top, validér det
    // færdige objekt. Tidligere fejlede status-only PATCH fordi schema'et krævede
    // expectedDate, som ikke var sendt med.
    const existing = await getPlannedPayment(id);
    if (!existing) {
      return NextResponse.json({ error: "Betaling ikke fundet" }, { status: 404 });
    }

    const cleaned = Object.fromEntries(
      Object.entries(body).filter(([k, v]) => v !== undefined && k !== "id")
    );
    const merged = { ...existing, ...cleaned, id };
    const parsed = plannedPaymentSchema.safeParse(merged);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ugyldige data" },
        { status: 400 }
      );
    }
    const saved = await upsertPlannedPayment(parsed.data);
    return NextResponse.json({ success: true, payment: saved });
  } catch (error) {
    logger.error("Kunne ikke opdatere planlagt betaling", { service: "case" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = await deletePlannedPayment(id);
  if (!ok) {
    return NextResponse.json({ error: "Betaling ikke fundet" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
