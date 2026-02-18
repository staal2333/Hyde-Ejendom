// POST /api/lead-sourcing/discover – AI lead discovery (Meta Ad Library, etc.)

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      source = "meta",
      query = "",
      country = "DK",
      limit = 30,
      platform = "all",
    } = body as { source?: "meta"; query?: string; country?: string; limit?: number; platform?: "all" | "instagram" };

    const { runDiscoverWithMeta } = await import("@/lib/lead-sourcing/discover");
    const result = await runDiscoverWithMeta({
      source: "meta",
      query: String(query),
      country: String(country).toUpperCase().slice(0, 2) || "DK",
      limit: Math.min(Math.max(1, Number(limit) || 30), 100),
      platform: platform === "instagram" ? "instagram" : "all",
    });

    return NextResponse.json({
      companies: result.companies,
      source,
      query,
      country,
      platform,
      platformFallback: result.platformFallback ?? false,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
