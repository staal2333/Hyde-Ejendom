// ============================================================
// Dashboard Stats API
// GET /api/dashboard → overview stats (HubSpot + Staging + Analytics)
// ============================================================

import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/hubspot";
import { getRecentRuns } from "@/lib/workflow/engine";
import { getStagedCounts } from "@/lib/staging/store";
import { getQueueStats } from "@/lib/email-queue";
import { getSends } from "@/lib/ooh/store";

export async function GET() {
  try {
    const [stats, recentRuns, stagingCounts] = await Promise.all([
      getDashboardStats(),
      Promise.resolve(getRecentRuns()),
      getStagedCounts(),
    ]);

    // Email queue stats (lightweight, in-memory)
    const emailStats = getQueueStats();

    // OOH send analytics (track opens, clicks, etc.)
    let oohAnalytics = { totalSent: 0, opened: 0, clicked: 0, replied: 0, meetings: 0, sold: 0 };
    try {
      const sends = await getSends();
      oohAnalytics = {
        totalSent: sends.filter(s => s.status !== "queued" && s.status !== "error").length,
        opened: sends.filter(s => s.openedAt).length,
        clicked: sends.filter(s => s.clickedAt).length,
        replied: sends.filter(s => s.status === "replied" || s.repliedAt).length,
        meetings: sends.filter(s => s.status === "meeting").length,
        sold: sends.filter(s => s.status === "sold").length,
      };
    } catch {
      // OOH sends table may not exist yet
    }

    return NextResponse.json({
      totalProperties: stats.total,
      pendingResearch: stats.byStatus["NY_KRAEVER_RESEARCH"] || 0,
      researchInProgress: stats.byStatus["RESEARCH_IGANGSAT"] || 0,
      researchDone: stats.byStatus["RESEARCH_DONE_CONTACT_PENDING"] || 0,
      readyToSend: stats.byStatus["KLAR_TIL_UDSENDELSE"] || 0,
      mailsSent: stats.byStatus["FOERSTE_MAIL_SENDT"] || 0,
      errors: stats.byStatus["FEJL"] || 0,
      byStatus: stats.byStatus,
      recentRuns: recentRuns.slice(0, 10),
      lastRunAt: recentRuns.length > 0 ? recentRuns[0].startedAt : null,
      // Staging counts
      staging: {
        new: stagingCounts.new,
        researching: stagingCounts.researching,
        researched: stagingCounts.researched,
        approved: stagingCounts.approved,
        rejected: stagingCounts.rejected,
        pushed: stagingCounts.pushed,
        awaitingAction: stagingCounts.new + stagingCounts.researched,
        total: Object.values(stagingCounts).reduce((a, b) => a + b, 0),
      },
      // Analytics
      analytics: {
        emailQueue: {
          queued: emailStats.queued,
          sent: emailStats.sent,
          failed: emailStats.failed,
          sentThisHour: emailStats.sentThisHour,
          rateLimitPerHour: emailStats.rateLimitPerHour,
        },
        ooh: oohAnalytics,
        // Conversion funnel
        funnel: {
          discovered: (stagingCounts.new + stagingCounts.researching + stagingCounts.researched + stagingCounts.approved + stagingCounts.rejected + stagingCounts.pushed),
          staged: stagingCounts.new + stagingCounts.researched,
          approved: stagingCounts.pushed,
          inHubSpot: stats.total,
          ready: stats.byStatus["KLAR_TIL_UDSENDELSE"] || 0,
          sent: stats.byStatus["FOERSTE_MAIL_SENDT"] || 0,
        },
      },
    });
  } catch (error) {
    console.error("[API] Dashboard stats failed:", error);
    // Return 200 with fallback so the app loads on Vercel when HubSpot/Supabase env is missing
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      error: msg,
      totalProperties: 0,
      pendingResearch: 0,
      researchInProgress: 0,
      researchDone: 0,
      readyToSend: 0,
      mailsSent: 0,
      errors: 0,
      byStatus: {},
      recentRuns: [],
      lastRunAt: null,
      staging: { new: 0, researching: 0, researched: 0, approved: 0, rejected: 0, pushed: 0, awaitingAction: 0, total: 0 },
      analytics: {
        emailQueue: { queued: 0, sent: 0, failed: 0, sentThisHour: 0, rateLimitPerHour: 200 },
        ooh: { totalSent: 0, opened: 0, clicked: 0, replied: 0, meetings: 0, sold: 0 },
        funnel: { discovered: 0, staged: 0, approved: 0, inHubSpot: 0, ready: 0, sent: 0 },
      },
    });
  }
}
