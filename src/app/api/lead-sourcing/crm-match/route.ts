// POST /api/lead-sourcing/crm-match
// Cross-reference HubSpot companies with Meta Ad Library advertisers.

import { NextRequest, NextResponse } from "next/server";
import { matchCrmCompaniesOnMeta } from "@/lib/lead-sourcing/crm-matcher";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const searchTerms = typeof body.searchTerms === "string" ? body.searchTerms : undefined;
    const country = typeof body.country === "string" ? body.country : "DK";

    const results = await matchCrmCompaniesOnMeta(searchTerms, country);
    const advertising = results.filter((r) => r.isAdvertising).length;

    return NextResponse.json({
      ok: true,
      total: results.length,
      advertising,
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
