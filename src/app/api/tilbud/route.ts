import { NextRequest, NextResponse } from "next/server";
import { listTilbud, upsertTilbud } from "@/lib/tilbud/store";
import { tilbudStatusSchema, tilbudUpsertInputSchema } from "@/lib/tilbud/types";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || undefined;
  const statusRaw = req.nextUrl.searchParams.get("status");
  const status = statusRaw ? tilbudStatusSchema.safeParse(statusRaw).data : undefined;
  const limit = Number(req.nextUrl.searchParams.get("limit") || 30);
  const offset = Number(req.nextUrl.searchParams.get("offset") || 0);

  const result = listTilbud({ q, status, limit: Number.isFinite(limit) ? limit : 30, offset: Number.isFinite(offset) ? offset : 0 });
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = tilbudUpsertInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Ugyldige data" }, { status: 400 });
    }

    const saved = upsertTilbud(parsed.data);
    return NextResponse.json({ success: true, tilbud: saved });
  } catch (error) {
    logger.error("Kunne ikke gemme tilbud", { service: "tilbud" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl ved gem af tilbud" },
      { status: 500 }
    );
  }
}
