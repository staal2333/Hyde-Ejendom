// ============================================================
// GET /api/ooh/track/click?sendId=xxx&url=xxx
//
// Click tracking redirect. Records a click event and redirects
// the user to the target URL.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getSend, upsertSend } from "@/lib/ooh/store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sendId = req.nextUrl.searchParams.get("sendId");
  const targetUrl = req.nextUrl.searchParams.get("url");

  if (sendId) {
    try {
      const send = await getSend(sendId);
      if (send) {
        const now = new Date().toISOString();
        // If status is "sent", upgrade to "opened" (they clicked a link)
        if (send.status === "sent") {
          send.status = "opened";
          send.openedAt = now;
        }
        // Always record the click timestamp (latest click)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (send as any).clickedAt = now;
        await upsertSend(send);
        console.log(`[track/click] Send ${sendId} click recorded`);
      }
    } catch (err) {
      console.error("[track/click] Error updating send:", err);
    }
  }

  // Redirect to the target URL, or fallback to homepage
  const redirectTo = targetUrl || "/";

  return NextResponse.redirect(redirectTo, { status: 302 });
}
