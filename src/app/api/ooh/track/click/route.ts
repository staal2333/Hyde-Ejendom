// ============================================================
// GET /api/ooh/track/click?sendId=xxx&url=xxx
//
// Click tracking redirect. Records a click event and redirects
// the user to the target URL.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getSend, upsertSend } from "@/lib/ooh/store";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sendId = req.nextUrl.searchParams.get("sendId");
  const targetUrl = req.nextUrl.searchParams.get("url");

  if (sendId) {
    try {
      const send = await getSend(sendId);
      if (send) {
        const now = new Date().toISOString();
        if (send.status === "sent") {
          send.status = "opened";
          send.openedAt = now;
        }
        send.clickedAt = now;
        await upsertSend(send);
        logger.info(`Send ${sendId} click recorded`, { service: "ooh-tracking" });
      }
    } catch (err) {
      logger.error(`Error updating send: ${err}`, { service: "ooh-tracking" });
    }
  }

  const redirectTo = targetUrl || "/";
  return NextResponse.redirect(redirectTo, { status: 302 });
}
