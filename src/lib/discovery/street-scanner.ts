// ============================================================
// Street Scanner – DAWA address lookup + BBR batch + pre-filter
// ============================================================

import { config } from "../config";
import { estimateStreetTraffic } from "./traffic";
import type { DawaAddress, BuildingCandidate } from "@/types";

const DAWA_BASE = config.dawa.apiUrl;
const BBR_CONCURRENCY = 5;

// Usage codes that are irrelevant for outdoor advertising
const IRRELEVANT_USAGE_CODES = [
  "910", // Garage
  "920", // Carport
  "930", // Udhus
  "940", // Drivhus
  "950", // Fritliggende overdækning
  "960", // Tiloversbleven landbrugsbygning
];

/**
 * Scan an entire street: find all buildings, fetch BBR data, pre-filter.
 */
export async function scanStreet(
  streetName: string,
  city: string
): Promise<BuildingCandidate[]> {
  console.log(`[Scanner] Scanning ${streetName}, ${city}...`);

  // Step 1: Resolve city to kommunekode
  const kommunekode = await resolveKommunekode(city);
  console.log(`[Scanner] Kommunekode for ${city}: ${kommunekode}`);

  // Step 2: Fetch all unique building addresses on the street
  const addresses = await fetchStreetAddresses(streetName, kommunekode);
  console.log(`[Scanner] Found ${addresses.length} unique addresses on ${streetName}`);

  if (addresses.length === 0) {
    return [];
  }

  // Step 3: Fetch BBR data for each address (batched)
  const candidates = await fetchBbrBatch(addresses);
  console.log(`[Scanner] Got BBR data for ${candidates.length} buildings`);

  // Step 4: Pre-filter irrelevant buildings
  const filtered = preFilter(candidates);
  console.log(`[Scanner] After pre-filter: ${filtered.length} candidates remain`);

  // Step 5: Attach traffic data to all candidates
  const trafficEstimate = estimateStreetTraffic(streetName, city);
  for (const candidate of filtered) {
    candidate.estimatedDailyTraffic = trafficEstimate.estimatedDailyTraffic;
    candidate.trafficSource = trafficEstimate.trafficSource;
    candidate.trafficConfidence = trafficEstimate.confidence;
  }
  console.log(
    `[Scanner] Traffic estimate for ${streetName}: ${trafficEstimate.estimatedDailyTraffic} ADT (${trafficEstimate.trafficSource}, confidence: ${trafficEstimate.confidence})`
  );

  return filtered;
}

/**
 * Resolve a city name to a DAWA kommunekode.
 */
async function resolveKommunekode(city: string): Promise<string> {
  // Common Copenhagen-area codes for fast lookup
  const knownCodes: Record<string, string> = {
    "københavn": "0101",
    "kobenhavn": "0101",
    "copenhagen": "0101",
    "frederiksberg": "0147",
    "gentofte": "0157",
    "hellerup": "0157",
    "charlottenlund": "0157",
    "gladsaxe": "0159",
    "lyngby": "0173",
    "hvidovre": "0167",
    "rødovre": "0175",
    "valby": "0101",
    "vanløse": "0101",
    "amager": "0101",
    "nørrebro": "0101",
    "østerbro": "0101",
    "vesterbro": "0101",
    "aarhus": "0751",
    "odense": "0461",
    "aalborg": "0851",
  };

  const normalized = city.toLowerCase().replace(/[^a-zæøå]/g, "");
  if (knownCodes[normalized]) {
    return knownCodes[normalized];
  }

  // Fallback: query DAWA kommuner API
  try {
    const res = await fetch(
      `${DAWA_BASE}/kommuner?q=${encodeURIComponent(city)}&per_side=1`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) {
        return data[0].kode;
      }
    }
  } catch (e) {
    console.warn(`[Scanner] Could not resolve kommunekode for ${city}:`, e);
  }

  // Default to Copenhagen
  return "0101";
}

/**
 * Fetch all unique building addresses (adgangsadresser) on a street.
 */
async function fetchStreetAddresses(
  streetName: string,
  kommunekode: string
): Promise<DawaAddress[]> {
  const url = `${DAWA_BASE}/adgangsadresser?vejnavn=${encodeURIComponent(streetName)}&kommunekode=${kommunekode}&struktur=mini&per_side=500`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`DAWA adgangsadresser failed (${res.status})`);
  }

  const data = await res.json();

  return (data as Array<{
    id: string;
    vejnavn: string;
    husnr: string;
    postnr: string;
    postnrnavn: string;
    kommunekode: string;
    x: number;
    y: number;
    betegnelse: string;
  }>).map((a) => ({
    id: a.id,
    vejnavn: a.vejnavn,
    husnr: a.husnr,
    postnr: a.postnr,
    postnrnavn: a.postnrnavn,
    kommunekode: a.kommunekode,
    x: a.x,
    y: a.y,
    betegnelse: a.betegnelse,
  }));
}

/**
 * Fetch BBR building data for multiple addresses in parallel batches.
 */
async function fetchBbrBatch(
  addresses: DawaAddress[]
): Promise<BuildingCandidate[]> {
  const results: BuildingCandidate[] = [];

  // Process in batches of BBR_CONCURRENCY
  for (let i = 0; i < addresses.length; i += BBR_CONCURRENCY) {
    const batch = addresses.slice(i, i + BBR_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((addr) => fetchBbrForAddress(addr))
    );
    results.push(...batchResults.filter((r): r is BuildingCandidate => r !== null));
  }

  return results;
}

/**
 * Fetch BBR data for a single address.
 */
async function fetchBbrForAddress(
  addr: DawaAddress
): Promise<BuildingCandidate | null> {
  try {
    const url = `${DAWA_BASE}/bbrlight/bygninger?adgangsadresseid=${addr.id}`;
    const res = await fetch(url);

    const candidate: BuildingCandidate = {
      dawaId: addr.id,
      address: `${addr.vejnavn} ${addr.husnr}`,
      streetName: addr.vejnavn,
      houseNumber: addr.husnr,
      postalCode: addr.postnr,
      city: addr.postnrnavn,
      lat: addr.y,
      lng: addr.x,
    };

    if (!res.ok) {
      return candidate; // Return without BBR data
    }

    const buildings = await res.json();
    if (!buildings || buildings.length === 0) {
      return candidate;
    }

    // Take the main/largest building
    const building = buildings.reduce(
      (
        best: Record<string, string | null>,
        b: Record<string, string | null>
      ) => {
        const bestArea = parseInt(best.SAMLET_BYGN_AREAL || "0", 10);
        const bArea = parseInt(b.SAMLET_BYGN_AREAL || "0", 10);
        return bArea > bestArea ? b : best;
      },
      buildings[0]
    );

    candidate.buildingYear = building.OPFOERELSE_AAR
      ? parseInt(building.OPFOERELSE_AAR, 10)
      : undefined;
    candidate.area = building.SAMLET_BYGN_AREAL
      ? parseInt(building.SAMLET_BYGN_AREAL, 10)
      : undefined;
    candidate.floors = building.ETAGER_ANT
      ? parseInt(building.ETAGER_ANT, 10)
      : undefined;
    candidate.units = building.BYG_BOLIG_ANT_BOLIG
      ? parseInt(building.BYG_BOLIG_ANT_BOLIG, 10)
      : undefined;
    candidate.usageCode = building.ANVEND_KODE || undefined;
    candidate.usageText = building.ANVEND_KODE_TEKST || undefined;

    return candidate;
  } catch (e) {
    console.warn(`[Scanner] BBR fetch failed for ${addr.betegnelse}:`, e);
    return null;
  }
}

/**
 * Pre-filter: remove buildings that are clearly irrelevant.
 */
function preFilter(candidates: BuildingCandidate[]): BuildingCandidate[] {
  return candidates.filter((c) => {
    // Remove garages, sheds, etc.
    if (c.usageCode && IRRELEVANT_USAGE_CODES.includes(c.usageCode)) {
      return false;
    }

    // Remove very small buildings (< 100 m2)
    if (c.area && c.area < 100) {
      return false;
    }

    // Remove single-floor buildings under 200 m2 (likely small houses)
    if (c.floors && c.floors <= 1 && c.area && c.area < 200) {
      return false;
    }

    return true;
  });
}
