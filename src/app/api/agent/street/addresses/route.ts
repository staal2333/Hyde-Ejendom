// Fast endpoint: fetch all DAWA addresses for a street (no BBR, no scoring)
// Returns the raw address list so the frontend can orchestrate batched scoring.
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { estimateStreetTraffic, formatTraffic } from "@/lib/discovery/traffic";
import type { DawaAddress } from "@/types";

const DAWA_BASE = config.dawa.apiUrl;

async function resolveKommunekode(city: string): Promise<string> {
  const knownCodes: Record<string, string> = {
    "københavn": "0101", "kobenhavn": "0101", "copenhagen": "0101",
    "frederiksberg": "0147", "gentofte": "0157", "hellerup": "0157",
    "gladsaxe": "0159", "lyngby": "0173", "hvidovre": "0167",
    "aarhus": "0751", "odense": "0461", "aalborg": "0851",
  };
  const normalized = city.toLowerCase().replace(/[^a-zæøå]/g, "");
  if (knownCodes[normalized]) return knownCodes[normalized];
  try {
    const res = await fetch(`${DAWA_BASE}/kommuner?q=${encodeURIComponent(city)}&per_side=1`);
    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) return data[0].kode;
    }
  } catch { /* fallback */ }
  return "0101";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const street = searchParams.get("street")?.trim();
  const city = searchParams.get("city")?.trim() || "København";

  if (!street) {
    return NextResponse.json({ error: "street is required" }, { status: 400 });
  }

  try {
    const kommunekode = await resolveKommunekode(city);
    const url = `${DAWA_BASE}/adgangsadresser?vejnavn=${encodeURIComponent(street)}&kommunekode=${kommunekode}&struktur=mini&per_side=500`;
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: `DAWA fejl: ${res.status}` }, { status: 500 });
    }

    const data = await res.json() as Array<{
      id: string; vejnavn: string; husnr: string;
      postnr: string; postnrnavn: string; kommunekode: string;
      x: number; y: number; betegnelse: string;
    }>;

    const addresses: DawaAddress[] = data.map((a) => ({
      id: a.id, vejnavn: a.vejnavn, husnr: a.husnr,
      postnr: a.postnr, postnrnavn: a.postnrnavn,
      kommunekode: a.kommunekode, x: a.x, y: a.y, betegnelse: a.betegnelse,
    }));

    const trafficEstimate = estimateStreetTraffic(street, city);

    return NextResponse.json({
      addresses,
      total: addresses.length,
      trafficEstimate: {
        daily: trafficEstimate.estimatedDailyTraffic,
        formatted: formatTraffic(trafficEstimate.estimatedDailyTraffic),
        source: trafficEstimate.trafficSource,
        confidence: trafficEstimate.confidence,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ukendt fejl" },
      { status: 500 }
    );
  }
}
