import { NextRequest, NextResponse } from "next/server";
import { getCostSettings, updateCostSettings } from "@/lib/case/settings-store";
import { costSettingsSchema } from "@/lib/case/types";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getCostSettings());
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = costSettingsSchema.partial().safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ugyldige data" },
        { status: 400 }
      );
    }
    const saved = await updateCostSettings(parsed.data);
    return NextResponse.json({ success: true, settings: saved });
  } catch (error) {
    logger.error("Kunne ikke opdatere case-settings", { service: "case" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}
