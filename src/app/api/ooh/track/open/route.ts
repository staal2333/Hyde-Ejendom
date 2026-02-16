// ============================================================
// GET /api/ooh/track/open?sendId=xxx
//
// Tracking pixel endpoint. Returns a 1x1 transparent GIF and
// records an "opened" event for the given sendId.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getSend, upsertSend } from "@/lib/ooh/store";

export const runtime = "nodejs";

// 1x1 transparent GIF
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: NextRequest) {
  const sendId = req.nextUrl.searchParams.get("sendId");

  if (sendId) {
    try {
      const send = await getSend(sendId);
      if (send && send.status === "sent") {
        send.status = "opened";
        send.openedAt = new Date().toISOString();
        await upsertSend(send);
        console.log(`[track/open] Send ${sendId} marked as opened`);
      }
    } catch (err) {
      console.error("[track/open] Error updating send:", err);
    }
  }

  return new NextResponse(TRACKING_PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
