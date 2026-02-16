// ============================================================
// BBR / DAWA – Danish Address & Building Data
// Uses Dataforsyningen's free API (dawa.aws.dk as primary)
// ============================================================

import type { BbrResult } from "@/types";

// Try dawa.aws.dk first (reliable DNS), fall back to api.dataforsyningen.dk
const DAWA_URLS = [
  "https://dawa.aws.dk",
  "https://api.dataforsyningen.dk",
];

/**
 * Normalize city name to proper Danish for DAWA queries.
 * DAWA is strict: "Kobenhavn" → 0 results, "København" → works.
 */
function normalizeCityForDawa(city: string): string {
  const lower = city.toLowerCase().trim();
  const map: Record<string, string> = {
    "kobenhavn": "K\u00f8benhavn",
    "copenhagen": "K\u00f8benhavn",
    "kbh": "K\u00f8benhavn",
    "aarhus": "Aarhus",
    "arhus": "Aarhus",
    "odense": "Odense",
    "aalborg": "Aalborg",
    "alborg": "Aalborg",
    "esbjerg": "Esbjerg",
  };
  return map[lower] || city;
}

/**
 * Look up building data by address using DAWA + BBR.
 * Step 1: Find the address in DAWA to get adgangsadresse ID
 * Step 2: Use the ID to look up BBR building data
 */
export async function lookupBbr(
  address: string,
  postalCode: string,
  city: string
): Promise<BbrResult | null> {
  const normalizedCity = normalizeCityForDawa(city);
  const postalPart = postalCode?.trim() || "";
  // Build DAWA-safe query: omit empty segments
  const fullAddress = postalPart
    ? `${address}, ${postalPart} ${normalizedCity}`.trim()
    : normalizedCity
      ? `${address}, ${normalizedCity}`.trim()
      : address.trim();

  for (const baseUrl of DAWA_URLS) {
    try {
      // Step 1: Address lookup via DAWA (try full address first, then just address)
      let dawaData: Record<string, unknown>[] | null = null;

      const dawaUrl = `${baseUrl}/adresser?q=${encodeURIComponent(fullAddress)}&struktur=mini&per_side=1`;
      const dawaResponse = await fetch(dawaUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)" },
        signal: AbortSignal.timeout(15000),
      });

      if (dawaResponse.ok) {
        dawaData = await dawaResponse.json();
      }

      // Fallback: try just the address without city/postal
      if ((!dawaData || dawaData.length === 0) && (postalPart || city)) {
        const fallbackUrl = `${baseUrl}/adresser?q=${encodeURIComponent(address.trim())}&struktur=mini&per_side=1`;
        const fallbackRes = await fetch(fallbackUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)" },
          signal: AbortSignal.timeout(15000),
        });
        if (fallbackRes.ok) {
          dawaData = await fallbackRes.json();
        }
      }

      if (!dawaData || dawaData.length === 0) {
        console.warn(`No DAWA result for: ${fullAddress}`);
        return null;
      }

      const adresseId = dawaData[0].adgangsadresseid || dawaData[0].id;

      // Step 2: BBR building lookup
      const bbrUrl = `${baseUrl}/bbrlight/bygninger?adgangsadresseid=${adresseId}`;

      const bbrResponse = await fetch(bbrUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!bbrResponse.ok) {
        return {
          address: fullAddress,
          rawData: { dawaResult: dawaData[0] },
        };
      }

      const bbrData = await bbrResponse.json();
      if (!bbrData || bbrData.length === 0) {
        return {
          address: fullAddress,
          rawData: { dawaResult: dawaData[0] },
        };
      }

      const building = bbrData[0];

      return {
        address: fullAddress,
        buildingYear: building.OPFOERELSE_AAR
          ? parseInt(building.OPFOERELSE_AAR)
          : undefined,
        area: building.SAMLET_BYGN_AREAL
          ? parseInt(building.SAMLET_BYGN_AREAL)
          : undefined,
        usage: building.ANVEND_KODE_TEKST || undefined,
        floors: building.ETAGER_ANT
          ? parseInt(building.ETAGER_ANT)
          : undefined,
        units: building.BYG_BOLIG_ANT_BOLIG
          ? parseInt(building.BYG_BOLIG_ANT_BOLIG)
          : undefined,
        rawData: building,
      };
    } catch (error) {
      console.warn(`BBR lookup via ${baseUrl} failed:`, error instanceof Error ? error.message : error);
      continue; // Try next URL
    }
  }

  console.error("BBR lookup failed: all DAWA URLs exhausted");
  return null;
}
