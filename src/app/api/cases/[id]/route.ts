import { NextRequest, NextResponse } from "next/server";
import { deleteCase, getCase, upsertCase } from "@/lib/case/store";
import { caseUpsertInputSchema } from "@/lib/case/types";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCase(id);
  if (!c) {
    return NextResponse.json({ error: "Case ikke fundet" }, { status: 404 });
  }
  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = caseUpsertInputSchema.safeParse({ ...body, id });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ugyldige data" },
        { status: 400 }
      );
    }
    const saved = upsertCase(parsed.data);
    return NextResponse.json({ success: true, case: saved });
  } catch (error) {
    logger.error("Kunne ikke opdatere case", { service: "case" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl ved opdatering af case" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ok = deleteCase(id);
  if (!ok) {
    return NextResponse.json({ error: "Case ikke fundet" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
