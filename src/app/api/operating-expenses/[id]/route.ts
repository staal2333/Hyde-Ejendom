import { NextRequest, NextResponse } from "next/server";
import {
  deleteOperatingExpense,
  upsertOperatingExpense,
} from "@/lib/case/operating-expenses-store";
import { operatingExpenseUpsertSchema } from "@/lib/case/types";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = operatingExpenseUpsertSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ugyldige data" },
        { status: 400 }
      );
    }
    const saved = upsertOperatingExpense(parsed.data);
    return NextResponse.json({ success: true, expense: saved });
  } catch (error) {
    logger.error("Kunne ikke opdatere driftsudgift", { service: "case" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteOperatingExpense(id);
  if (!ok) {
    return NextResponse.json({ error: "Driftsudgift ikke fundet" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
