// ============================================================
// GET /api/leads/candidates
// Returns lead candidates with optional filtering
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAllCandidates } from "@/lib/leads/candidate-store";
import type { CandidateStatus } from "@/lib/leads/candidate-store";
import { scoreToPriority } from "@/lib/leads/scanner";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") as CandidateStatus | null;
  const minScore = parseInt(searchParams.get("minScore") || "0", 10);
  const account = searchParams.get("account");

  const all = await getAllCandidates();

  const filtered = all
    .filter((c) => {
      if (status && c.status !== status) return false;
      if (minScore > 0 && c.lead_score < minScore) return false;
      if (account && account !== "all" && c.source_account !== account) return false;
      return true;
    })
    .sort((a, b) => b.lead_score - a.lead_score);

  const withPriority = filtered.map((c) => ({
    ...c,
    priority: scoreToPriority(c.lead_score),
  }));

  const stats = {
    total: withPriority.length,
    needs_review: withPriority.filter((c) => c.status === "needs_review").length,
    approved: withPriority.filter((c) => c.status === "approved").length,
    rejected: withPriority.filter((c) => c.status === "rejected").length,
    synced: withPriority.filter((c) => c.status === "synced").length,
    high: withPriority.filter((c) => c.priority === "high").length,
    medium: withPriority.filter((c) => c.priority === "medium").length,
    low: withPriority.filter((c) => c.priority === "low").length,
  };

  return NextResponse.json({ candidates: withPriority, stats });
}
