import { NextRequest, NextResponse } from "next/server";
import { listCases, upsertCase } from "@/lib/case/store";
import { caseStatusSchema, caseUpsertInputSchema } from "@/lib/case/types";
import { caseFromTilbud } from "@/lib/case/from-tilbud";
import { getCostSettings } from "@/lib/case/settings-store";
import { getTilbud } from "@/lib/tilbud/store";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || undefined;
  const statusRaw = req.nextUrl.searchParams.get("status");
  const status = statusRaw ? caseStatusSchema.safeParse(statusRaw).data : undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || 100);
  const offset = Number(req.nextUrl.searchParams.get("offset") || 0);

  const result = listCases({
    q,
    status,
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0,
  });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Support: { fromTilbudId: "..." } → seed case from existing tilbud
    if (typeof body === "object" && body && typeof body.fromTilbudId === "string") {
      const tilbud = getTilbud(body.fromTilbudId);
      if (!tilbud) {
        return NextResponse.json({ error: "Tilbud ikke fundet" }, { status: 404 });
      }
      const settings = getCostSettings();
      const input = caseFromTilbud(tilbud, settings);
      const saved = upsertCase(input);
      return NextResponse.json({ success: true, case: saved });
    }

    const parsed = caseUpsertInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ugyldige data" },
        { status: 400 }
      );
    }

    const saved = upsertCase(parsed.data);
    return NextResponse.json({ success: true, case: saved });
  } catch (error) {
    logger.error("Kunne ikke gemme case", { service: "case" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl ved gem af case" },
      { status: 500 }
    );
  }
}
