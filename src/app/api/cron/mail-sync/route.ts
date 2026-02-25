// ============================================================
// GET /api/cron/mail-sync – Sync threads + auto-update reply status
// Call every 10–15 min from Vercel Cron or cron-job.org.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { loadThreadPropertiesFromDb, getAllThreadProperties } from "@/lib/mail-threads";
import { getThreadWithMessages } from "@/lib/email-sender";
import { updateEjendom } from "@/lib/hubspot";
import { verifyCronSecret } from "@/lib/cron-auth";
import { logger } from "@/lib/logger";

export const maxDuration = 60;

const REPLY_STATUS_MAP: Record<string, string> = {
  interested: "SVAR_MODTAGET_POSITIV",
  meeting: "MOEDE_AFTALT",
  not_interested: "SVAR_MODTAGET_NEGATIV",
  auto_reply: "FOERSTE_MAIL_SENDT",
};

function classifyReply(text: string): string {
  const lower = text.toLowerCase();
  if (/møde|meeting|kalender|tidspu|lad os|ring til mig|kan vi tale/i.test(lower)) return "meeting";
  if (/interesse|høre mere|lyder godt|fortæl|send.*info|gerne/i.test(lower)) return "interested";
  if (/ikke interesse|nej tak|afmeld|fjern.*mail|stop|unsubscribe|no.*thank/i.test(lower)) return "not_interested";
  if (/auto.?svar|out of office|fraværende|automatisk/i.test(lower)) return "auto_reply";
  return "unknown";
}

export async function GET(request: NextRequest) {
  const authErr = verifyCronSecret(request);
  if (authErr) return authErr;

  try {
    await loadThreadPropertiesFromDb();
    const mappings = getAllThreadProperties();

    let statusUpdates = 0;
    const errors: string[] = [];

    // Check threads with property mappings for new replies
    for (const { threadId, propertyId } of mappings.slice(0, 50)) {
      try {
        const thread = await getThreadWithMessages(threadId);
        if (!thread || thread.messages.length < 2) continue;

        // Find replies (messages not sent by us)
        const ourEmail = process.env.GMAIL_SENDER_EMAIL?.toLowerCase() || "";
        const replies = thread.messages.filter(
          m => !m.from.toLowerCase().includes(ourEmail)
        );

        if (replies.length === 0) continue;

        const latestReply = replies[replies.length - 1];
        const category = classifyReply(latestReply.bodyPlain || latestReply.snippet);
        const newStatus = REPLY_STATUS_MAP[category];

        if (newStatus && newStatus !== "FOERSTE_MAIL_SENDT") {
          try {
            await updateEjendom(propertyId, { outreach_status: newStatus });
            statusUpdates++;
            logger.info(`Mail-sync: ${propertyId} → ${newStatus} (${category})`, { service: "cron-mail-sync" });
          } catch (e) {
            errors.push(`${propertyId}: ${e instanceof Error ? e.message : e}`);
          }
        }
      } catch {
        // Thread may have been deleted or inaccessible
      }
    }

    return NextResponse.json({
      ok: true,
      threadsMapped: mappings.length,
      statusUpdates,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error(`cron/mail-sync error: ${error instanceof Error ? error.message : error}`, { service: "cron-mail-sync" });
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
