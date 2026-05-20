import { NextRequest, NextResponse } from "next/server";
import {
  listPlannedPayments,
  upsertPlannedPayment,
  plannedPaymentUpsertSchema,
} from "@/lib/case/planned-payments";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ items: await listPlannedPayments() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = plannedPaymentUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ugyldige data" },
        { status: 400 }
      );
    }
    const saved = await upsertPlannedPayment(parsed.data);
    return NextResponse.json({ success: true, payment: saved });
  } catch (error) {
    logger.error("Kunne ikke gemme planlagt betaling", { service: "case" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}
