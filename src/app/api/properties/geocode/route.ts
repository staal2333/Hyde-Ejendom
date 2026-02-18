// ============================================================
// GET /api/properties/geocode?address=...&postalCode=...&city=...
// Returns { lat, lng } from DAWA (WGS84: x=lng, y=lat)
// ============================================================

import { NextRequest, NextResponse } from "next/server";

const DAWA_BASE = "https://api.dataforsyningen.dk";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.trim();
  const postalCode = searchParams.get("postalCode")?.trim();
  const city = searchParams.get("city")?.trim();

  const query = [address, postalCode, city].filter(Boolean).join(" ");
  if (query.length < 3) {
    return NextResponse.json(
      { error: "Angiv adresse (min. 3 tegn)" },
      { status: 400 }
    );
  }

  try {
    const url = `${DAWA_BASE}/adresser?q=${encodeURIComponent(query)}&per_side=1&struktur=mini`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json(
        { error: "Adresseopslag fejlede" },
        { status: 502 }
      );
    }
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : data;
    if (!hit || typeof hit.x !== "number" || typeof hit.y !== "number") {
      return NextResponse.json(
        { error: "Ingen koordinater fundet for adressen" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      lat: hit.y as number,
      lng: hit.x as number,
      betegnelse: hit.betegnelse || null,
    });
  } catch (e) {
    console.error("[API] Geocode error:", e);
    return NextResponse.json(
      { error: "Kunne ikke geokode adressen" },
      { status: 500 }
    );
  }
}
