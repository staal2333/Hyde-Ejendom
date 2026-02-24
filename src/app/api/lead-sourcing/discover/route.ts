// POST /api/lead-sourcing/discover – AI lead discovery (Meta Ad Library, etc.)

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { leadDiscoverSchema, parseBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = parseBody(leadDiscoverSchema, raw);
    if (!parsed.ok) return apiError(400, parsed.error, parsed.detail);

    const { source, query, country, limit, platform } = parsed.data;

    const { runDiscoverWithMeta } = await import("@/lib/lead-sourcing/discover");
    const result = await runDiscoverWithMeta({ source: source ?? "meta", query, country, limit, platform });

    return NextResponse.json({
      companies: result.companies,
      source,
      query,
      country,
      platform,
      platformFallback: result.platformFallback ?? false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const isMetaCode1 = message.includes('"code":1') || (message.includes("unknown error") && message.toLowerCase().includes("meta"));
    const hint = isMetaCode1
      ? "Meta Ad Library returnerer ofte kode 1 når appen ikke har fuld adgang. På developers.facebook.com: tilføj «Ad Library API» / Marketing API, gennemfør evt. ID-verifikation (facebook.com/ID), og brug et User Access Token fra Graph API Explorer med ads_read."
      : undefined;
    return NextResponse.json({ error: message, hint }, { status: 500 });
  }
}
