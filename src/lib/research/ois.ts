// ============================================================
// OIS.dk – Official Danish Property Ownership Data
//
// Reliable BFE discovery via DAWA:
//   1. DAWA adresser → get adgangsadresseid
//   2. DAWA adgangsadresser/{id} → get ejerlav.kode + matrikelnr
//   3. DAWA jordstykker/{ejerlavskode}/{matrikelnr} → get bfenummer
//   4. OIS api/ejer/get?bfe={bfe} → get owner + administrator
//
// Fallback: web search to find BFE in OIS.dk URLs
// ============================================================

import { searchGoogle } from "./web-scraper";

/** OIS lookup result with owner and administrator data */
export interface OisResult {
  bfe: number;
  address: string;
  owners: OisOwner[];
  administrators: OisAdmin[];
  propertyType?: string;
  ejerforholdskode?: string;
  ejerforholdstekst?: string;
  kommune?: string;
}

export interface OisOwner {
  name: string;
  isPrimary: boolean;
}

export interface OisAdmin {
  name: string;
  isPrimary: boolean;
}

export type OisProgressCallback = (event: {
  step: string;
  message: string;
  detail?: string;
}) => void;

const OIS_API = "https://ois.dk/api";

// dawa.aws.dk is the reliable hostname (api.dataforsyningen.dk has DNS issues)
const DAWA_URLS = ["https://dawa.aws.dk", "https://api.dataforsyningen.dk"];

/**
 * Normalize a city name to proper Danish spelling for DAWA queries.
 * DAWA is very strict — "Kobenhavn" returns 0 results, "København" works.
 */
function normalizeCityForDawa(city: string | undefined): string {
  if (!city) return "";
  const lower = city.toLowerCase().trim();
  // Map ASCII variants to proper Danish
  const CITY_MAP: Record<string, string> = {
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
  return CITY_MAP[lower] || city;
}

/**
 * Main entry: look up a property on OIS.dk by address.
 * Returns official owner (Ejer) and administrator names.
 */
export async function lookupOis(
  address: string,
  postalCode: string,
  city?: string,
  onProgress?: OisProgressCallback
): Promise<OisResult | null> {
  const emit = onProgress || (() => {});

  try {
    emit({
      step: "ois_start",
      message: `OIS: Slår op: ${address}, ${postalCode} ${city || ""}`,
    });

    // ── Step 1: Get BFE number + kommune from DAWA ──
    const dawaResult = await findBfeViaDawa(address, postalCode, city, emit);
    let bfe = dawaResult.bfe;
    const dawaKommuneNavn = dawaResult.kommuneNavn;

    // Fallback: web search for BFE
    if (!bfe) {
      emit({
        step: "ois_bfe_fallback",
        message: "OIS: DAWA-metode fandt ikke BFE – prøver websøgning...",
      });
      bfe = await findBfeViaWebSearch(address, postalCode, city, emit);
    }

    if (!bfe) {
      emit({
        step: "ois_fail",
        message: "OIS: Kunne ikke finde BFE-nummer",
      });
      return null;
    }

    emit({
      step: "ois_bfe_found",
      message: `OIS: BFE ${bfe} fundet`,
      detail: `https://ois.dk/search/${bfe}`,
    });

    // ── Step 2: Get owner + administrator ──
    emit({
      step: "ois_ejer",
      message: "OIS: Henter ejer- og administratordata...",
    });

    const ownerData = await getOwnerAndAdmin(bfe);
    if (!ownerData) {
      emit({ step: "ois_ejer", message: "OIS: Ejerdata ikke tilgængelig" });
      return null;
    }

    // ── Step 3: General info (optional) ──
    const generalInfo = await getGeneralInfo(bfe);

    // Prefer DAWA kommune name (clean "København") over OIS kommunenavn_kode ("0101 København")
    const kommuneResolved = dawaKommuneNavn || generalInfo?.kommunenavn_kode || undefined;

    const result: OisResult = {
      bfe,
      address: `${address}, ${postalCode} ${city || ""}`.trim(),
      owners: ownerData.owners,
      administrators: ownerData.administrators,
      propertyType: generalInfo?.ejendomstype || undefined,
      ejerforholdskode: generalInfo?.ejendommensEjerforholdskode || undefined,
      ejerforholdstekst: generalInfo?.ejendommensEjerforholdstekst || undefined,
      kommune: kommuneResolved,
    };

    const ownerNames = result.owners.map(o => o.name).join(", ") || "Ingen";
    const adminNames = result.administrators.map(a => a.name).join(", ") || "Ingen";

    emit({
      step: "ois_done",
      message: `OIS: ✅ Ejer: ${ownerNames} | Administrator: ${adminNames}`,
      detail: [
        `BFE: ${bfe}`,
        result.ejerforholdstekst ? `Type: ${result.ejerforholdstekst}` : null,
        `Link: https://ois.dk/search/${bfe}`,
      ].filter(Boolean).join(" | "),
    });

    return result;
  } catch (error) {
    console.error("OIS lookup failed:", error);
    emit({
      step: "ois_error",
      message: `OIS fejl: ${error instanceof Error ? error.message : "ukendt"}`,
    });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// BFE Discovery – Primary: DAWA chain, Fallback: web search
// ═══════════════════════════════════════════════════════════════

interface DawaBfeResult {
  bfe: number | null;
  kommuneNavn: string | null;
  kommuneKode: string | null;
}

/**
 * RELIABLE BFE discovery via DAWA:
 *   adresser search → adgangsadresseid
 *   adgangsadresser/{id} → ejerlav.kode + matrikelnr + kommune
 *   jordstykker/{ejerlavskode}/{matrikelnr} → bfenummer
 */
async function findBfeViaDawa(
  address: string,
  postalCode: string,
  city: string | undefined,
  emit: OisProgressCallback
): Promise<DawaBfeResult> {
  const normalizedCity = normalizeCityForDawa(city);

  for (const baseUrl of DAWA_URLS) {
    try {
      // Step 1: Find adgangsadresse (try multiple strategies)
      const parts = parseAddress(address);
      let adgangsadresseId: string | null = null;

      // Strategy A: Structured lookup with vejnavn + husnr + postnr
      if (parts.vejnavn && parts.husnr) {
        const params: Record<string, string> = {
          vejnavn: parts.vejnavn,
          husnr: parts.husnr,
          struktur: "mini",
          per_side: "1",
        };
        // Only include postnr if we have one (empty string breaks DAWA)
        if (postalCode && postalCode.trim()) {
          params.postnr = postalCode.trim();
        }
        const url = `${baseUrl}/adresser?${new URLSearchParams(params)}`;
        const resp = await fetchSafe(url, 15000);
        if (resp && resp.length > 0) {
          adgangsadresseId = resp[0].adgangsadresseid || resp[0].id;
        }
      }

      // Strategy B: Fuzzy search with full address + normalized city
      if (!adgangsadresseId) {
        const cityPart = normalizedCity || "";
        const postalPart = postalCode?.trim() || "";
        const fullAddr = postalPart
          ? `${address}, ${postalPart} ${cityPart}`.trim()
          : cityPart
            ? `${address}, ${cityPart}`.trim()
            : address.trim();
        const url = `${baseUrl}/adgangsadresser?q=${encodeURIComponent(fullAddr)}&struktur=mini&per_side=1`;
        const resp = await fetchSafe(url, 15000);
        if (resp && resp.length > 0) {
          adgangsadresseId = resp[0].id;
        }
      }

      // Strategy C: Just the address alone (no city, no postal) — this is surprisingly reliable
      if (!adgangsadresseId && (city || postalCode)) {
        emit({ step: "ois_dawa", message: `OIS: Pr\u00f8ver kun adressen: "${address}"` });
        const url = `${baseUrl}/adgangsadresser?q=${encodeURIComponent(address.trim())}&struktur=mini&per_side=1`;
        const resp = await fetchSafe(url, 15000);
        if (resp && resp.length > 0) {
          adgangsadresseId = resp[0].id;
        }
      }

      if (!adgangsadresseId) {
        emit({ step: "ois_dawa", message: `OIS: Adresse ikke fundet i DAWA (${baseUrl})` });
        continue;
      }

      emit({
        step: "ois_dawa",
        message: `OIS: Adresse fundet i DAWA`,
        detail: `AdgangsadresseID: ${adgangsadresseId.substring(0, 8)}...`,
      });

      // Step 2: Get matrikel info from adgangsadresse
      const adgUrl = `${baseUrl}/adgangsadresser/${adgangsadresseId}`;
      const adgResp = await fetchSafe(adgUrl, 15000);
      if (!adgResp) continue;

      const ejerlavskode = adgResp.ejerlav?.kode;
      const matrikelnr = adgResp.matrikelnr;

      // Extract kommune name from DAWA (most reliable source for kommune)
      const dawaKommuneNavn = adgResp.kommune?.navn || null;
      const dawaKommuneKode = adgResp.kommune?.kode || null;
      if (dawaKommuneNavn) {
        // Store on the emit context so the caller can use it
        emit({
          step: "ois_kommune",
          message: `OIS: Kommune fra DAWA: ${dawaKommuneNavn} (kode: ${dawaKommuneKode || "?"})`,
        });
      }

      if (!ejerlavskode || !matrikelnr) {
        emit({
          step: "ois_dawa",
          message: "OIS: Matrikelinfo mangler i DAWA-data",
        });
        continue;
      }

      emit({
        step: "ois_matrikel",
        message: `OIS: Matrikel: ${matrikelnr}, Ejerlav: ${ejerlavskode} (${adgResp.ejerlav?.navn || ""})`,
      });

      // Step 3: Get BFE from jordstykke
      const jordUrl = `${baseUrl}/jordstykker/${ejerlavskode}/${encodeURIComponent(matrikelnr)}`;
      const jordResp = await fetchSafe(jordUrl, 15000);
      if (!jordResp) continue;

      const bfe = jordResp.bfenummer || jordResp.sfeejendomsnr;
      if (bfe && typeof bfe === "number" && bfe > 0) {
        emit({
          step: "ois_bfe",
          message: `OIS: BFE ${bfe} fundet via DAWA jordstykke`,
        });
        return { bfe, kommuneNavn: dawaKommuneNavn, kommuneKode: dawaKommuneKode };
      }

      // BFE not in jordstykke, try parsing as int
      if (bfe && typeof bfe === "string") {
        const parsed = parseInt(bfe, 10);
        if (parsed > 0) return { bfe: parsed, kommuneNavn: dawaKommuneNavn, kommuneKode: dawaKommuneKode };
      }

      emit({ step: "ois_bfe", message: "OIS: Jordstykke har intet BFE-nummer" });
      return { bfe: null, kommuneNavn: dawaKommuneNavn, kommuneKode: dawaKommuneKode };
    } catch (error) {
      console.warn(`DAWA BFE via ${baseUrl} failed:`, error instanceof Error ? error.message : error);
      continue;
    }
  }

  return { bfe: null, kommuneNavn: null, kommuneKode: null };
}

/**
 * Fallback: search the web for "site:ois.dk {address}" to find BFE in URL.
 * OIS.dk URLs follow the pattern: https://ois.dk/search/{BFE}
 */
async function findBfeViaWebSearch(
  address: string,
  postalCode: string,
  city: string | undefined,
  emit: OisProgressCallback
): Promise<number | null> {
  try {
    const queries = [
      `site:ois.dk "${address}" "${postalCode}"`,
      `ois.dk "${address}" ${city || ""} ejer BFE`.trim(),
    ];

    for (const query of queries) {
      emit({ step: "ois_websearch", message: `OIS websøgning: "${query}"` });

      const results = await searchGoogle(query, 5);

      for (const result of results) {
        // Extract BFE from OIS.dk URLs
        const bfeMatch = result.url.match(/ois\.dk\/search\/(\d+)/);
        if (bfeMatch) {
          const bfe = parseInt(bfeMatch[1], 10);
          if (bfe > 0) {
            emit({
              step: "ois_websearch",
              message: `OIS: BFE ${bfe} fundet via websøgning`,
              detail: result.url,
            });
            return bfe;
          }
        }

        // Check snippet for BFE reference
        const textMatch = `${result.title} ${result.snippet}`.match(/BFE[:\s]*(\d{5,8})/i);
        if (textMatch) {
          const bfe = parseInt(textMatch[1], 10);
          if (bfe > 0) return bfe;
        }
      }

      await new Promise(r => setTimeout(r, 400));
    }

    return null;
  } catch (error) {
    console.warn("BFE web search failed:", error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// OIS API Calls
// ═══════════════════════════════════════════════════════════════

/**
 * Get owner (Ejer) and administrator from OIS. This endpoint is reliable.
 */
async function getOwnerAndAdmin(bfe: number): Promise<{
  owners: OisOwner[];
  administrators: OisAdmin[];
} | null> {
  try {
    const url = `${OIS_API}/ejer/get?bfe=${bfe}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`OIS ejer API returned ${response.status}`);
      return null;
    }

    const data = await response.json();
    const owners: OisOwner[] = [];
    const administrators: OisAdmin[] = [];

    if (data?.ejerdata && Array.isArray(data.ejerdata)) {
      for (const ejer of data.ejerdata) {
        if (ejer.name && !ejer.name.includes("Forbeholdt ejer")) {
          owners.push({
            name: ejer.name.trim(),
            isPrimary: ejer.primaerKontakt === true,
          });
        }
      }
    }

    if (data?.admindata && Array.isArray(data.admindata)) {
      for (const admin of data.admindata) {
        if (admin.name && !admin.name.includes("Forbeholdt ejer")) {
          administrators.push({
            name: admin.name.trim(),
            isPrimary: admin.primaerKontakt === true,
          });
        }
      }
    }

    return { owners, administrators };
  } catch (error) {
    console.warn("OIS ejer lookup failed:", error);
    return null;
  }
}

/**
 * Get general property info from OIS.
 */
async function getGeneralInfo(bfe: number): Promise<{
  ejendomstype?: string;
  ejendommensEjerforholdskode?: string;
  ejendommensEjerforholdstekst?: string;
  kommunenavn_kode?: string;
} | null> {
  try {
    const url = `${OIS_API}/property/GetGeneralInfoFromBFE?bfe=${bfe}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const data = await response.json();
    const info = data?.GeneralInfoSFE || data?.GeneralInfoBPFG || data?.GeneralInfoEJL;
    if (!info) return null;

    return {
      ejendomstype: info.ejendomstype || undefined,
      ejendommensEjerforholdskode: info.ejendommensEjerforholdskode || undefined,
      ejendommensEjerforholdstekst: info.ejendommensEjerforholdstekst || undefined,
      kommunenavn_kode: info.kommunenavn_kode || undefined,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Utilities
// ═══════════════════════════════════════════════════════════════

/** Parse Danish address into street name + house number */
function parseAddress(address: string): { vejnavn: string | null; husnr: string | null } {
  const clean = address.split(",")[0].trim();
  const match = clean.match(/^(.+?)\s+(\d+\w?)$/);
  if (match) return { vejnavn: match[1].trim(), husnr: match[2].trim() };
  return { vejnavn: null, husnr: null };
}

/** Safe JSON fetch with timeout. Returns parsed JSON or null on any error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSafe(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; EjendomAI/1.0)",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    return await response.json();
  } catch {
    clearTimeout(timeout);
    return null;
  }
}
