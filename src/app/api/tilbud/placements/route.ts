import { NextRequest, NextResponse } from "next/server";
import { listPlacements, upsertPlacement } from "@/lib/tilbud/placement-store";
import { placementUpsertSchema } from "@/lib/tilbud/placement-types";

export const runtime = "nodejs";

export async function GET() {
  const result = await listPlacements();
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = placementUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ugyldige data" },
        { status: 400 }
      );
    }

    const saved = await upsertPlacement(parsed.data);
    if (!saved) {
      return NextResponse.json(
        { error: "Kunne ikke gemme placering (Supabase ikke tilgængelig)" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, placement: saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}
