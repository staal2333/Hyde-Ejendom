// POST /api/lead-sourcing/companies – resolve CVR/names, Proff financials, dedupe vs Contacts

import { NextRequest, NextResponse } from "next/server";
import { resolveCompanies } from "@/lib/lead-sourcing/companies";
import { apiError } from "@/lib/api-error";
import { leadCompaniesSchema, parseBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = parseBody(leadCompaniesSchema, raw);
    if (!parsed.ok) return apiError(400, parsed.error, parsed.detail);

    const { cvrs, names } = parsed.data;
    const list = await resolveCompanies({ cvrs, names });
    return NextResponse.json({ companies: list });
  } catch (e) {
    return apiError(500, e instanceof Error ? e.message : "Unknown error");
  }
}
