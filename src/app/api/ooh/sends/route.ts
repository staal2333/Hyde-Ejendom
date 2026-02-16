import { NextRequest, NextResponse } from "next/server";
import { getSends, getSend, upsertSend } from "@/lib/ooh/store";
import { syncToHubSpot } from "@/lib/ooh/hubspot-sync";

export const runtime = "nodejs";

/** GET /api/ooh/sends – List sends with optional filters */
export async function GET(req: NextRequest) {
  try {
    const campaignId = req.nextUrl.searchParams.get("campaignId") || undefined;
    const contactId = req.nextUrl.searchParams.get("contactId") || undefined;
    const status = req.nextUrl.searchParams.get("status") || undefined;

    const sends = await getSends({ campaignId, contactId, status });
    return NextResponse.json({ sends });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[sends]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT /api/ooh/sends – Update a send (e.g. manual status change) */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existing = await getSend(id);
    if (!existing) return NextResponse.json({ error: "Send not found" }, { status: 404 });

    const updated = {
      ...existing,
      ...updates,
      id: existing.id,
      updatedAt: new Date().toISOString(),
    };

    // Auto-set timestamps based on status transitions
    if (updates.status === "opened" && !existing.openedAt) {
      updated.openedAt = new Date().toISOString();
    }
    if (updates.status === "replied" && !existing.repliedAt) {
      updated.repliedAt = new Date().toISOString();
    }

    await upsertSend(updated);

    // Sync status change to HubSpot (non-blocking)
    if (updates.status && updated.contactEmail) {
      const STATUS_NOTES: Record<string, string> = {
        opened: "Kunden har åbnet OOH-oplæg",
        replied: "Kunden har svaret på OOH-oplæg",
        meeting: "Møde aftalt vedr. OOH-kampagne",
        sold: "OOH-kampagne solgt!",
        rejected: "Kunden har afvist OOH-oplæg",
      };
      syncToHubSpot({
        contactEmail: updated.contactEmail,
        status: updates.status,
        noteBody: STATUS_NOTES[updates.status],
      }).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[sends]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
