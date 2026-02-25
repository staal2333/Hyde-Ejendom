// GET /api/leads – list leads with filters
// POST /api/leads – save discovered leads

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { z } from "zod";

const postSchema = z.object({
  companies: z.array(z.object({
    name: z.string(),
    cvr: z.string().optional().default(""),
    address: z.string().optional().default(""),
    industry: z.string().optional(),
    website: z.string().optional(),
    domain: z.string().nullable().optional(),
    egenkapital: z.number().nullable().optional(),
    resultat: z.number().nullable().optional(),
    omsaetning: z.number().nullable().optional(),
    pageCategory: z.string().nullable().optional(),
    pageLikes: z.number().nullable().optional(),
    adCount: z.number().optional().default(0),
    platforms: z.array(z.string()).optional().default([]),
    oohScore: z.number().optional().default(0),
    oohReason: z.string().optional().default(""),
    sourcePlatform: z.string().optional().default("meta"),
    source: z.string().optional(),
    inCrm: z.boolean().optional(),
  })),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { getLeads } = await import("@/lib/lead-sourcing/lead-store");

    const leads = await getLeads({
      status: (searchParams.get("status") as "new" | "qualified" | "contacted" | "customer" | "lost") || undefined,
      sourcePlatform: searchParams.get("sourcePlatform") || undefined,
      minScore: searchParams.get("minScore") ? Number(searchParams.get("minScore")) : undefined,
      search: searchParams.get("search") || undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 200,
      offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
    });

    return NextResponse.json({ leads, total: leads.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return apiError(500, msg);
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = postSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(400, "Validation failed", parsed.error.issues.map(i => i.message).join(", "));
    }

    const { saveLeads } = await import("@/lib/lead-sourcing/lead-store");
    const result = await saveLeads(parsed.data.companies as Parameters<typeof saveLeads>[0]);

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return apiError(500, msg);
  }
}
