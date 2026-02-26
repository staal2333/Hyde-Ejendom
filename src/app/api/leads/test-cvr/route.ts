// POST /api/leads/test-cvr
// Debug: test CVR AI matching for a given brand name
// Shows all steps: domain lookup, Google CVR extraction, name variations, LLM pick
// Body: { name: string, domain?: string, industry?: string, address?: string }

import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, domain, industry, address } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "name er påkrævet" }, { status: 400 });
    }

    const { findCvrForLead } = await import("@/lib/research/cvr-ai-match");

    const start = Date.now();
    const result = await findCvrForLead({
      brandName: name.trim(),
      domain: domain?.trim() || null,
      industry: industry?.trim() || null,
      address: address?.trim() || null,
    });
    const ms = Date.now() - start;

    return NextResponse.json({
      input: { name, domain, industry, address },
      found: !!result,
      result: result || null,
      ms,
      tip: result
        ? `CVR ${result.cvr} fundet: "${result.name}" (${result.industry || "branche ukendt"})`
        : "Ingen CVR fundet. Prøv at angive domain eller mere specifikt firmanavn.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
