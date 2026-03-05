// ============================================================
// GET /api/mail/threads/[threadId] – Full thread with messages
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getThreadWithMessages } from "@/lib/email-sender";
import { getPropertyIdForThread } from "@/lib/mail-threads";
import { logger } from "@/lib/logger";

export const maxDuration = 30;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  if (!threadId) {
    return NextResponse.json({ error: "Manglende threadId" }, { status: 400 });
  }
  try {
    const accountEmail = request.nextUrl.searchParams.get("account") || undefined;
    const thread = await getThreadWithMessages(threadId, accountEmail);
    if (!thread) {
      return NextResponse.json({ error: "Tråd ikke fundet" }, { status: 404 });
    }
    const propertyId = getPropertyIdForThread(threadId) ?? null;
    return NextResponse.json({ thread, propertyId });
  } catch (error) {
    logger.error("Thread get failed", { service: "mail-threads" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente tråd" },
      { status: 500 }
    );
  }
}
