// POST /api/lead-sourcing/refresh-token
// Deprecated – Metapi.io uses a simple API key, no token refresh needed.

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Token-fornyelse er ikke længere nødvendig. Metapi.io bruger en fast API-nøgle (METAPI_API_KEY).",
    },
    { status: 410 }
  );
}
