// POST /api/lead-sourcing/companies – resolve CVR/names, Proff financials, dedupe vs Contacts

import { NextRequest, NextResponse } from "next/server";
import { resolveCompanies } from "@/lib/lead-sourcing/companies";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cvrs = [], names = [] } = body as { cvrs?: string[]; names?: string[] };
    const list = await resolveCompanies({
      cvrs: Array.isArray(cvrs) ? cvrs : [cvrs].filter(Boolean),
      names: Array.isArray(names) ? names : [names].filter(Boolean),
    });
    return NextResponse.json({ companies: list });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
