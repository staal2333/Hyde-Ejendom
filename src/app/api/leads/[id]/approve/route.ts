// ============================================================
// POST /api/leads/:id/approve
// Marks a lead candidate as approved
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
    companyName?: string;
    jobTitle?: string;
    phone?: string;
  };

  const candidate = await getCandidateById(id);
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const updated = await updateCandidate(id, {
    status: "approved",
    approved_at: new Date().toISOString(),
    ...(body.companyName ? { company_name: body.companyName } : {}),
    ...(body.jobTitle ? { job_title: body.jobTitle } : {}),
    ...(body.phone ? { phone: body.phone } : {}),
  });

  return NextResponse.json({ candidate: updated });
}
