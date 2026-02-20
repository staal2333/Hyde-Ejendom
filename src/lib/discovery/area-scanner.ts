// ============================================================
// Area Scanner – Find buildings in one or more postcodes (DAWA + BBR)
// Used for "discover by area" without a specific street.
// ============================================================

import { config } from "../config";
import { getBuildingCandidatesFromAddresses } from "./street-scanner";
import type { DawaAddress, BuildingCandidate } from "@/types";

const DAWA_BASE = config.dawa.apiUrl;
const MAX_ADDRESSES_PER_POSTCODE = 1000;

/**
 * Fetch all adgangsadresser in the given postcode(s) from DAWA.
 */
async function fetchAddressesByPostcodes(
  postcodes: string[]
): Promise<DawaAddress[]> {
  const seen = new Set<string>();
  const out: DawaAddress[] = [];

  for (const postnr of postcodes) {
    const trimmed = String(postnr).trim();
    if (!trimmed) continue;

    const url = `${DAWA_BASE}/adgangsadresser?postnr=${encodeURIComponent(trimmed)}&struktur=mini&per_side=${MAX_ADDRESSES_PER_POSTCODE}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[AreaScanner] DAWA postnr ${trimmed} failed: ${res.status}`);
      continue;
    }

    const data = (await res.json()) as Array<{
      id: string;
      vejnavn: string;
      husnr: string;
      postnr: string;
      postnrnavn: string;
      kommunekode: string;
      x: number;
      y: number;
      betegnelse: string;
    }>;

    for (const a of data) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      out.push({
        id: a.id,
        vejnavn: a.vejnavn,
        husnr: a.husnr,
        postnr: a.postnr,
        postnrnavn: a.postnrnavn,
        kommunekode: a.kommunekode,
        x: a.x,
        y: a.y,
        betegnelse: a.betegnelse,
      });
    }
  }

  return out;
}

/**
 * Scan one or more postcodes: fetch addresses from DAWA, BBR data, pre-filter.
 * Traffic is not available at area level; candidates get estimatedDailyTraffic 0
 * and trafficSource "estimate" so scoring can still run.
 * @param maxAddresses Cap per run to avoid overload (default 500).
 */
export async function scanArea(
  postcodes: string[],
  _cityLabel?: string,
  maxAddresses = 500
): Promise<BuildingCandidate[]> {
  const normalized = postcodes.map((p) => String(p).trim()).filter(Boolean);
  if (normalized.length === 0) {
    return [];
  }

  console.log(`[AreaScanner] Fetching addresses for postnr: ${normalized.join(", ")}`);
  let addresses = await fetchAddressesByPostcodes(normalized);
  if (addresses.length > maxAddresses) {
    console.log(`[AreaScanner] Capping at ${maxAddresses} addresses`);
    addresses = addresses.slice(0, maxAddresses);
  }
  console.log(`[AreaScanner] Found ${addresses.length} unique addresses`);

  if (addresses.length === 0) {
    return [];
  }

  const candidates = await getBuildingCandidatesFromAddresses(addresses);
  console.log(`[AreaScanner] After BBR + pre-filter: ${candidates.length} candidates`);

  for (const c of candidates) {
    c.estimatedDailyTraffic = 0;
    c.trafficSource = "estimate";
    c.trafficConfidence = 0;
  }

  return candidates;
}
