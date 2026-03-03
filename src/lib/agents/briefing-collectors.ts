import { logger } from "@/lib/logger";
import type { BriefingData } from "./briefing-types";

async function collectPipeline(): Promise<BriefingData["pipeline"]> {
  try {
    const { getDashboardStats } = await import("@/lib/hubspot");
    const stats = await getDashboardStats();
    return { total: stats.total, byStatus: stats.byStatus };
  } catch (e) {
    logger.warn(`[briefing] pipeline collect failed: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

async function collectStaged(): Promise<BriefingData["staged"]> {
  try {
    const { getStagedCounts } = await import("@/lib/staging/store");
    const counts = await getStagedCounts();
    return counts;
  } catch (e) {
    logger.warn(`[briefing] staged collect failed: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

async function collectTilbud(): Promise<BriefingData["tilbud"]> {
  try {
    const { listTilbud } = await import("@/lib/tilbud/store");
    const drafts = listTilbud({ status: "draft", limit: 200 });
    const finals = listTilbud({ status: "final", limit: 200 });
    return { drafts: drafts.total, finals: finals.total };
  } catch (e) {
    logger.warn(`[briefing] tilbud collect failed: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

async function collectMail(): Promise<BriefingData["mail"]> {
  try {
    const { listInboxThreads } = await import("@/lib/email-sender");
    const threads = await listInboxThreads(100);
    return { inboxCount: threads.length, unreadCount: threads.length };
  } catch (e) {
    logger.warn(`[briefing] mail collect failed: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

async function collectFollowUps(): Promise<BriefingData["followUps"]> {
  try {
    const { getDueFollowUps } = await import("@/lib/ooh/store");
    const due = await getDueFollowUps();
    return {
      due: due.length,
      names: due.slice(0, 10).map((s) => (s as unknown as Record<string, unknown>).contactName as string || s.id).filter(Boolean),
    };
  } catch (e) {
    logger.warn(`[briefing] followups collect failed: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

async function collectOoh(): Promise<BriefingData["ooh"]> {
  try {
    const { getCampaigns, getSends } = await import("@/lib/ooh/store");
    const campaigns = await getCampaigns({ status: "active" });
    const pending = await getSends({ status: "queued" });
    return { activeCampaigns: campaigns.length, pendingSends: pending.length };
  } catch (e) {
    logger.warn(`[briefing] ooh collect failed: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

export async function collectAllBriefingData(): Promise<BriefingData> {
  const [pipeline, staged, tilbud, mail, followUps, ooh] = await Promise.allSettled([
    collectPipeline(),
    collectStaged(),
    collectTilbud(),
    collectMail(),
    collectFollowUps(),
    collectOoh(),
  ]);

  return {
    pipeline: pipeline.status === "fulfilled" ? pipeline.value : undefined,
    staged: staged.status === "fulfilled" ? staged.value : undefined,
    tilbud: tilbud.status === "fulfilled" ? tilbud.value : undefined,
    mail: mail.status === "fulfilled" ? mail.value : undefined,
    followUps: followUps.status === "fulfilled" ? followUps.value : undefined,
    ooh: ooh.status === "fulfilled" ? ooh.value : undefined,
  };
}
