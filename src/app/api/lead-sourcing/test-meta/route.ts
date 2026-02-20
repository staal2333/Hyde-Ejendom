// GET /api/lead-sourcing/test-meta – Test Meta Ad Library token (returns ok + count or error message)
import { NextResponse } from "next/server";
import { fetchMetaAdLibrary } from "@/lib/lead-sourcing/sources/meta-ad-library";

const CODE_1_HINT =
  "Meta returnerer ofte kode 1, når appen ikke har fuld Ad Library-adgang. " +
  "Tilføj «Ad Library API» under appens produkter på developers.facebook.com, gennemfør evt. ID-verifikation på facebook.com/ID, og tjek «Required actions» i appen.";

export async function GET() {
  try {
    const token = process.env.META_AD_LIBRARY_ACCESS_TOKEN;
    if (!token || token.trim() === "") {
      return NextResponse.json(
        { ok: false, error: "META_AD_LIBRARY_ACCESS_TOKEN is not set in .env.local" },
        { status: 400 }
      );
    }

    const companies = await fetchMetaAdLibrary({
      searchTerms: "reklame",
      adReachedCountries: ["DK"],
      limit: 5,
    });

    return NextResponse.json({
      ok: true,
      message: "Meta Ad Library virker",
      count: companies.length,
      sample: companies.slice(0, 3).map((c) => ({ pageId: c.pageId, pageName: c.pageName })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const isCode1 = message.includes('"code":1') || message.includes("code\":1");
    const isFetchFailed = message.includes("fetch failed") || message.includes("netværksfejl");
    const isTokenExpired = message.includes("190") || message.includes("Session has expired") || message.includes("OAuthException");
    const hint = isTokenExpired
      ? "Tokenet er udløbet. Gå til Graph API Explorer (developers.facebook.com/tools/explorer), vælg din app, klik «Generate Access Token», tilføj ads_read, og opdater META_AD_LIBRARY_ACCESS_TOKEN i .env.local med den nye token."
      : isCode1
        ? CODE_1_HINT
        : isFetchFailed
          ? "Serveren kunne ikke nå Meta (graph.facebook.com). Tjek internet, firewall og at port 3004 kører."
          : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: message,
        hint,
      },
      { status: 200 }
    );
  }
}
