// ============================================================
// GET /api/mail/inbox – List inbox threads with property mapping
// ============================================================

import { NextResponse } from "next/server";
import { listInboxThreads } from "@/lib/email-sender";
import { getPropertyIdForThread, loadThreadPropertiesFromDb } from "@/lib/mail-threads";

export async function GET() {
  try {
    await loadThreadPropertiesFromDb();
    const threads = await listInboxThreads(50);
    const withProperty = threads.map((t) => ({
      ...t,
      propertyId: getPropertyIdForThread(t.id) ?? null,
    }));
    return NextResponse.json({ threads: withProperty });
  } catch (error) {
    console.error("[API] Inbox list failed:", error);
    const message = error instanceof Error ? error.message : "Kunne ikke hente indbakke";
    const isScope =
      message.includes("insufficient") ||
      message.includes("scope") ||
      message.includes("403");
    return NextResponse.json(
      {
        error: message,
        hint: isScope
          ? "Tilføj Gmail scope gmail.readonly (eller gmail.modify) til OAuth og genautoriser."
          : undefined,
      },
      { status: 500 }
    );
  }
}
