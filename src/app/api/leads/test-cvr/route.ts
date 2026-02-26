// POST /api/leads/test-cvr
// Debug endpoint: test CVR AI matching for a specific company name
// Body: { name: string, industry?: string, domain?: string, address?: string }

import { NextRequest, NextResponse } from "next/server";
import { findCvrForLead } from "@/lib/research/cvr-ai-match";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, industry, domain, address } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const start = Date.now();
    const result = await findCvrForLead({ brandName: name, industry, domain, address });
    const ms = Date.now() - start;

    return NextResponse.json({
      input: { name, industry, domain, address },
      result,
      found: !!result,
      ms,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
