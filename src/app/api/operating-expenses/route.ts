import { NextRequest, NextResponse } from "next/server";
import {
  listOperatingExpenses,
  upsertOperatingExpense,
} from "@/lib/case/operating-expenses-store";
import { operatingExpenseUpsertSchema } from "@/lib/case/types";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ items: await listOperatingExpenses() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = operatingExpenseUpsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Ugyldige data" },
        { status: 400 }
      );
    }
    const saved = await upsertOperatingExpense(parsed.data);
    return NextResponse.json({ success: true, expense: saved });
  } catch (error) {
    logger.error("Kunne ikke gemme driftsudgift", { service: "case" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}
