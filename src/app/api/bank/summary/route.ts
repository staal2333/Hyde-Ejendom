import { NextResponse } from "next/server";
import { getBankSummary } from "@/lib/bank/store";

export const runtime = "nodejs";

export async function GET() {
  const summary = await getBankSummary();
  return NextResponse.json(summary);
}
