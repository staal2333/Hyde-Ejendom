// ============================================================
// GET /api/mail/threads/[threadId] – Full thread with messages
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getThreadWithMessages } from "@/lib/email-sender";
import { getPropertyIdForThread } from "@/lib/mail-threads";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  if (!threadId) {
    return NextResponse.json({ error: "Manglende threadId" }, { status: 400 });
  }
  try {
    const thread = await getThreadWithMessages(threadId);
    if (!thread) {
      return NextResponse.json({ error: "Tråd ikke fundet" }, { status: 404 });
    }
    const propertyId = getPropertyIdForThread(threadId) ?? null;
    return NextResponse.json({ thread, propertyId });
  } catch (error) {
    console.error("[API] Thread get failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente tråd" },
      { status: 500 }
    );
  }
}
