// ============================================================
// POST /api/leads/:id/reject
// Marks a lead candidate as rejected
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { getCandidateById, updateCandidate } from "@/lib/leads/candidate-store";

export const maxDuration = 15;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    reason?: string;
  };

  const candidate = await getCandidateById(id);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const updated = await updateCandidate(id, {
    status: "rejected",
    rejected_reason: body.reason ?? null,
  });

  return NextResponse.json({ candidate: updated });
}
