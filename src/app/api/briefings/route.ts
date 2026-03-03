import { NextRequest, NextResponse } from "next/server";
import { listBriefings, markBriefingRead, runDailyBriefing } from "@/lib/agents/briefing-agent";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") || "14");
  const result = await listBriefings(limit);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string };

  if (body.action === "mark_read" && body.id) {
    await markBriefingRead(body.id);
    return NextResponse.json({ success: true });
  }

  if (body.action === "generate") {
    const briefing = await runDailyBriefing();
    return NextResponse.json({ success: true, briefing });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
