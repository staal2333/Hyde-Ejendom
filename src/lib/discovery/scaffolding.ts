// ============================================================
// Scaffolding Discovery – Comprehensive permit finder
// Primary: kbhkort.kk.dk WFS API (København), Aarhus WebKort WFS
// Secondary: Municipal open data portals, web searches
// Produces daily-report quality analysis
// ============================================================

import * as cheerio from "cheerio";
import { estimateStreetTraffic, formatTraffic } from "./traffic";
import type {
  ScaffoldingPermit,
  ScoredScaffolding,
  ScaffoldingResult,
} from "@/types";

export interface ScaffoldingProgress {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  permits?: ScoredScaffolding[];
  result?: ScaffoldingResult;
}

export type ScaffoldingProgressCallback = (
  event: ScaffoldingProgress
) => void;

// ── Constants ──────────────────────────────────────────────────
const FETCH_TIMEOUT = 25_000;
const WFS_BASE = "https://wfs-kbhkort.kk.dk/k101/ows";
const AARHUS_WFS = "https://webkort.aarhuskommune.dk/wfs/wfs";
const MAX_WFS_FEATURES = 10_000;

// ── WFS Layer configs ──────────────────────────────────────────
// Only the ACTIVE layer from kbhkort.kk.dk koordineringskort_pro.
// "kommende" (upcoming/future) permits are excluded – user only wants
// permits that are currently active (scaffolding is standing right now).
const KBH_LAYERS = [
  {
    typeName: "k101:erhv_raaden_over_vej_events_aktiv_aabne",
    label: "Aktive tilladelser (stilladser & stilladsreklamer)",
  },
] as const;

// ── Category grouping for nice display ─────────────────────────
// Only 2 relevant groups for outdoor advertising:
//   1. Stilladsreklamer   – scaffold advertising permits (reklame på stillads)
//   2. Stilladser         – scaffolding on roads (portal, standard, lade tårn, etc.)
// Everything else (byggepladser, kraner, containere) is excluded.
type PermitGroup =
  | "Stilladsreklamer"
  | "Stilladser";

const PERMIT_GROUP_CONFIG: Record<PermitGroup, { color: string; priority: number }> = {
  Stilladsreklamer:      { color: "#8b5cf6", priority: 10 },
  Stilladser:            { color: "#6366f1", priority: 9 },
};

function classifyPermitGroup(sagstype: string, kategori: string): PermitGroup | null {
  const s = sagstype.toLowerCase();
  const k = kategori.toLowerCase();

  // ── Group 1: Stilladsreklamer (scaffold advertising) ──
  if (s.includes("stilladsreklam")) return "Stilladsreklamer";

  // ── Group 2: Stilladser (physical scaffolding on roads) ──
  if (
    k.includes("stillads") ||
    k.includes("stilladsbil") ||
    k.includes("lade tårn") ||
    k.includes("trappe tårn") ||
    k.includes("materiale-") ||
    k.includes("mandskabs hejs") ||
    k.includes("alu, inkl") ||
    k.includes("portal bundrammer") ||
    k.includes("standard bundrammer") ||
    k.includes("rørførings portal")
  ) {
    return "Stilladser";
  }

  // Everything else is excluded – we only care about scaffolding
  return null;
}

// ── Public entry point ─────────────────────────────────────────

/**
 * Discover active scaffolding permits in a given city.
 * Produces a detailed daily-report quality analysis.
 */
export async function discoverScaffolding(
  city: string,
  minTraffic = 10_000,
  minScore = 5,
  onProgress?: ScaffoldingProgressCallback
): Promise<ScaffoldingResult> {
  const emit = onProgress || (() => {});

  const result: ScaffoldingResult = {
    city,
    totalPermits: 0,
    afterFilter: 0,
    created: 0,
    skipped: 0,
    alreadyExists: 0,
    permits: [],
    sources: [],
    byType: {},
    startedAt: new Date().toISOString(),
  };

  try {
    // Robust city normalization that works regardless of file/console encoding.
    // Convert Danish special chars to ASCII for reliable comparison.
    const normalized = normalizeCityName(city);
    const isKbh =
      normalized === "kobenhavn" ||
      normalized === "copenhagen" ||
      normalized === "koebenhavn";
    const isAarhus =
      normalized === "aarhus" || normalized === "arhus";

    // ─────────────────────────────────────────────────────────
    // PHASE 1: Fetch from official WFS APIs
    // ─────────────────────────────────────────────────────────
    emit({
      phase: "wfs_start",
      message: `🔍 Henter officielle tilladelsesdata fra kommunale GIS-systemer...`,
      detail: isKbh
        ? "Forbinder til kbhkort.kk.dk WFS (koordineringskort_pro profil)"
        : isAarhus
          ? "Forbinder til Aarhus Kommune WebKort WFS"
          : `Søger kommunale data for ${city}`,
      progress: 2,
    });

    let allPermits: ScaffoldingPermit[] = [];

    if (isKbh) {
      allPermits = await fetchKbhWfsPermits(emit);
    } else if (isAarhus) {
      allPermits = await fetchAarhusWfsPermits(emit);
    }

    const rawCount = allPermits.length;

    // ── Deduplicate by normalized address ──
    // Multiple WFS records can share the same address (different permit types,
    // overlapping layers). Keep the best record per address (prefer stillads > byggeplads > other).
    const addrMap = new Map<string, ScaffoldingPermit>();
    const TYPE_PRIORITY: Record<string, number> = {
      Stilladsreklamer: 10,
      Stilladser: 9,
    };

    for (const p of allPermits) {
      const key = p.address.toLowerCase().replace(/\s+/g, " ").trim();
      const existing = addrMap.get(key);
      if (!existing) {
        addrMap.set(key, p);
      } else {
        // Keep whichever has higher permit-type priority
        const existPri = TYPE_PRIORITY[existing.permitType] || 0;
        const newPri = TYPE_PRIORITY[p.permitType] || 0;
        if (newPri > existPri) {
          addrMap.set(key, p);
        }
      }
    }
    allPermits = [...addrMap.values()];

    emit({
      phase: "dedup",
      message: `Deduplikering: ${rawCount} → ${allPermits.length} unikke adresser`,
      progress: 28,
    });

    // Track sources
    const sourceCounts = new Map<string, number>();
    for (const p of allPermits) {
      const src = p.sourceLayer || p.sourceUrl || "unknown";
      sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
    }

    result.totalPermits = allPermits.length;
    result.sources = [...sourceCounts.entries()].map(([name, count]) => ({
      name,
      count,
    }));

    // Count by group / detail
    for (const p of allPermits) {
      const key = `${p.permitType} / ${p.category}`;
      result.byType[key] = (result.byType[key] || 0) + 1;
    }

    emit({
      phase: "wfs_done",
      message: `✅ Fandt ${allPermits.length} aktive stillads-tilladelser fra officielle kilder`,
      detail: [...sourceCounts.entries()]
        .map(([n, c]) => `${n}: ${c}`)
        .join(" | "),
      progress: 30,
    });

    // ─────────────────────────────────────────────────────────
    // PHASE 2: If no WFS results, try web search fallback
    // ─────────────────────────────────────────────────────────
    if (allPermits.length === 0) {
      emit({
        phase: "search_backup",
        message: "📡 Ingen direkte API-data – søger på nettet...",
        detail:
          "Søger DuckDuckGo for stillads-tilladelser, byggeaktivitet og facaderenovering",
        progress: 35,
      });

      const webPermits = await searchForScaffolding(city);
      allPermits.push(...webPermits);
      result.totalPermits = allPermits.length;

      emit({
        phase: "search_backup_done",
        message: `Fandt ${webPermits.length} resultater fra websøgning`,
        progress: 45,
      });
    }

    if (allPermits.length === 0) {
      emit({
        phase: "done",
        message: `Ingen aktive stillads-tilladelser fundet i ${city}`,
        progress: 100,
        result,
      });
      result.completedAt = new Date().toISOString();
      return result;
    }

    // ─────────────────────────────────────────────────────────
    // PHASE 3: Enrich with reverse geocoding for postal codes
    // ─────────────────────────────────────────────────────────
    emit({
      phase: "geocode",
      message: `📍 Beriger ${allPermits.length} tilladelser med adressedata...`,
      detail: "Slår postnumre og koordinater op via DAWA",
      progress: 40,
    });

    await enrichPermitsWithDawa(allPermits, emit);

    emit({
      phase: "geocode_done",
      message: `Adresseopslag færdigt`,
      progress: 50,
    });

    // ─────────────────────────────────────────────────────────
    // PHASE 4: Traffic estimation + scoring
    // ─────────────────────────────────────────────────────────
    emit({
      phase: "scoring",
      message: `📊 Beregner outdoor-score for ${allPermits.length} tilladelser...`,
      detail: `Estimerer daglig fodgænger-/biltrafik per adresse. Minimumskrav: score ≥ ${minScore}, trafik ≥ ${formatTraffic(minTraffic)}`,
      progress: 55,
    });

    const scored: ScoredScaffolding[] = [];

    for (const permit of allPermits) {
      const traffic = estimateStreetTraffic(permit.streetName, city);
      const outdoorScore = calculateScaffoldingScore(
        permit,
        traffic.estimatedDailyTraffic
      );

      scored.push({
        ...permit,
        outdoorScore,
        scoreReason: buildScaffoldingReason(
          permit,
          traffic.estimatedDailyTraffic
        ),
        estimatedDailyTraffic: traffic.estimatedDailyTraffic,
        trafficSource: traffic.trafficSource,
      });
    }

    // Sort by score descending
    scored.sort((a, b) => b.outdoorScore - a.outdoorScore);

    const qualified = scored.filter(
      (s) =>
        s.outdoorScore >= minScore &&
        (s.estimatedDailyTraffic || 0) >= minTraffic
    );
    result.afterFilter = qualified.length;
    result.permits = scored;

    emit({
      phase: "scoring_done",
      message: `🎯 ${qualified.length} af ${scored.length} opfylder krav (score ≥ ${minScore}, trafik ≥ ${formatTraffic(minTraffic)})`,
      detail: scored
        .slice(0, 5)
        .map(
          (s) =>
            `${s.address}: ${s.outdoorScore}/10, ~${formatTraffic(s.estimatedDailyTraffic || 0)}/dag, ${s.sagstype}/${s.category}`
        )
        .join("\n"),
      progress: 70,
      permits: scored,
    });

    // ─────────────────────────────────────────────────────────
    // PHASE 5: Daily report summary
    // ─────────────────────────────────────────────────────────
    emit({
      phase: "report",
      message: `📋 Daglig rapport – ${city} – ${new Date().toLocaleDateString("da-DK")}`,
      detail: buildDailyReportSummary(result, scored, qualified, city),
      progress: 73,
    });

    // No HubSpot push – this is a read-only report
    result.skipped = scored.length - qualified.length;
    result.completedAt = new Date().toISOString();

    emit({
      phase: "done",
      message: `🏁 Rapport færdig! ${qualified.length} kvalificerede lokationer af ${scored.length} total`,
      detail: [
        `Total unikke adresser: ${result.totalPermits}`,
        `Kvalificerede (score ≥ ${minScore}, trafik ≥ ${formatTraffic(minTraffic)}): ${result.afterFilter}`,
        `Under krav: ${result.skipped}`,
        `Kilder: ${result.sources.map((s) => `${s.name} (${s.count})`).join(", ")}`,
      ].join(" | "),
      progress: 100,
      result,
      permits: scored,
    });
  } catch (error) {
    result.error =
      error instanceof Error ? error.message : "Unknown error";
    result.completedAt = new Date().toISOString();
    emit({
      phase: "error",
      message: `❌ Fejl: ${result.error}`,
      progress: 100,
      result,
    });
  }

  return result;
}

// ================================================================
// WFS Data Sources – København (kbhkort.kk.dk)
// ================================================================

/**
 * Fetch ALL relevant permits from Københavns Kommune via WFS.
 * This is the REAL kbhkort.kk.dk koordineringskort_pro API.
 *
 * Layers queried:
 *  1. erhv_raaden_over_vej_events_aktiv_aabne  → all active road permits
 *     (includes scaffolding, containers, cranes, construction sites, etc.)
 *  2. erhv_raaden_over_vej_events_kommende_aabne → upcoming road permits
 *  3. gravetilladelser_aktiv_aabne  → active excavation permits
 *     (includes asphalt work, utilities, fiber, etc.)
 */
async function fetchKbhWfsPermits(
  emit: ScaffoldingProgressCallback
): Promise<ScaffoldingPermit[]> {
  const allPermits: ScaffoldingPermit[] = [];

  for (let i = 0; i < KBH_LAYERS.length; i++) {
    const layer = KBH_LAYERS[i];

    emit({
      phase: "wfs_layer",
      message: `Henter lag ${i + 1}/${KBH_LAYERS.length}: ${layer.label}...`,
      detail: `WFS: ${layer.typeName}`,
      progress: 5 + Math.round(((i + 1) / KBH_LAYERS.length) * 20),
    });

    try {
      const params = new URLSearchParams({
        service: "WFS",
        version: "1.0.0",
        request: "GetFeature",
        typeName: layer.typeName,
        outputFormat: "json",
        SRSNAME: "EPSG:4326",
        maxFeatures: String(MAX_WFS_FEATURES),
      });

      const res = await fetchWithTimeout(
        `${WFS_BASE}?${params.toString()}`
      );
      if (!res || !res.ok) {
        console.warn(
          `[WFS] ${layer.typeName} returned ${res?.status}`
        );
        continue;
      }

      const geojson = await res.json();
      const features = geojson?.features || [];
      const total = geojson?.totalFeatures || features.length;

      emit({
        phase: "wfs_layer_result",
        message: `${layer.label}: ${total} features total, hentet ${features.length}`,
        progress: 5 + Math.round(((i + 1) / KBH_LAYERS.length) * 20),
      });

      for (const feature of features) {
        const props = feature.properties || {};
        const permit = parseKbhWfsFeature(props, feature, layer.typeName);
        if (permit) {
          allPermits.push(permit);
        }
      }
    } catch (e) {
      console.warn(`[WFS] Layer ${layer.typeName} failed:`, e);
      emit({
        phase: "wfs_layer_error",
        message: `⚠️ Kunne ikke hente ${layer.label}: ${e instanceof Error ? e.message : "Ukendt fejl"}`,
        progress: 5 + Math.round(((i + 1) / KBH_LAYERS.length) * 20),
      });
    }
  }

  return allPermits;
}

/**
 * Parse a single GeoJSON feature from kbhkort.kk.dk WFS into a ScaffoldingPermit.
 * Uses classifyPermitGroup() to only keep relevant entries:
 *   Stilladsreklamer and Stilladser.
 * Everything else (byggepladser, kraner, containere, etc.) is excluded.
 */
function parseKbhWfsFeature(
  props: Record<string, unknown>,
  feature: { geometry?: { coordinates?: number[][] | number[][][] } },
  layerName: string
): ScaffoldingPermit | null {
  const sagstype = String(props.sagstype || "");
  const kategori = String(props.kategori || "");
  const lokation = String(props.lokation || "");

  // ── Classify into one of 5 groups (or null = exclude) ──
  const group = classifyPermitGroup(sagstype, kategori);
  if (!group) return null;

  // Use the group name as the permitType for consistent categorization
  const permitType = group;

  // ── Parse dates ──
  const startStr = parseWfsDate(props.projekt_start as string);
  const endStr = parseWfsDate(props.projekt_slut as string);
  // "oprettet" or "sagmodtaget" = when the permit was created/received in the system
  const createdStr = parseWfsDate(props.oprettet as string)
    || parseWfsDate(props.sagmodtaget as string)
    || startStr; // fallback to projekt_start

  let durationWeeks: number | undefined;
  if (startStr && endStr) {
    const ms =
      new Date(endStr).getTime() - new Date(startStr).getTime();
    durationWeeks = Math.round(ms / (7 * 24 * 60 * 60 * 1000));
  }

  // ── Extract centroid from geometry ──
  let lat: number | undefined;
  let lng: number | undefined;
  try {
    const geom = feature.geometry;
    if (geom?.coordinates) {
      const coords = geom.coordinates;
      // Could be Point [lng,lat], LineString [[lng,lat],...], or Polygon [[[lng,lat],...]]]
      if (typeof coords[0] === "number") {
        // Point
        lng = coords[0] as unknown as number;
        lat = coords[1] as unknown as number;
      } else {
        // Array of coords – compute centroid
        const flat: number[][] = Array.isArray(coords[0]?.[0])
          ? (coords[0] as number[][])
          : (coords as unknown as number[][]);
        if (flat.length > 0) {
          const sumLng = flat.reduce((s, c) => s + (c[0] || 0), 0);
          const sumLat = flat.reduce((s, c) => s + (c[1] || 0), 0);
          lng = sumLng / flat.length;
          lat = sumLat / flat.length;
        }
      }
    }
  } catch {
    /* geometry parsing is optional */
  }

  return {
    id: String(props.sagsid || props.ogc_fid || `kbh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    address: lokation,
    streetName: extractStreetName(lokation),
    houseNumber: extractHouseNumber(lokation),
    postalCode: "", // Will be enriched via DAWA
    city: "København",
    permitType,
    category: kategori,
    sagstype,
    description: buildDescription(props),
    createdDate: createdStr || undefined,
    startDate: startStr || undefined,
    endDate: endStr || undefined,
    durationWeeks,
    applicant: String(props.bygherre || props.ansoeger_navn || ""),
    contractor: String(props.entreprenoer || ""),
    contactPerson:
      String(props.bygherre_kontaktpers || props.ansoeger_kontaktpers || ""),
    contactPhone:
      String(props.bygherre_kontakttele || props.ansoeger_kontakttele || ""),
    contactEmail:
      String(props.bygherre_kontaktemail || props.ansoeger_kontaktinfo || ""),
    facadeArea: props.facadeareal_m2
      ? String(props.facadeareal_m2)
      : undefined,
    sourceUrl: "kbhkort.kk.dk",
    sourceLayer: layerName,
    sagsnr: props.sagsnr as number | undefined,
    lat,
    lng,
  };
}

// ================================================================
// WFS Data Sources – Aarhus
// ================================================================

/**
 * Fetch permits from Aarhus Kommune WFS.
 * Uses webkort.aarhuskommune.dk and opendata.aarhus.dk endpoints.
 */
async function fetchAarhusWfsPermits(
  emit: ScaffoldingProgressCallback
): Promise<ScaffoldingPermit[]> {
  const permits: ScaffoldingPermit[] = [];

  // ── Try Aarhus WebKort WFS ──
  emit({
    phase: "wfs_layer",
    message: "Forsøger Aarhus Kommune WebKort WFS...",
    detail: AARHUS_WFS,
    progress: 8,
  });

  try {
    const params = new URLSearchParams({
      service: "WFS",
      version: "1.0.0",
      request: "GetCapabilities",
    });
    const capsRes = await fetchWithTimeout(
      `${AARHUS_WFS}?${params.toString()}`
    );

    if (capsRes && capsRes.ok) {
      const capsText = await capsRes.text();
      // Look for layers with names containing relevant terms
      const layerMatches = capsText.match(
        /Name>[^<]*(?:stillads|grave|raaden|byggeplads|vejarbejde)[^<]*/gi
      );

      if (layerMatches) {
        for (const layerMatch of layerMatches.slice(0, 5)) {
          const layerName = layerMatch.replace(/Name>/, "").trim();
          emit({
            phase: "wfs_layer",
            message: `Aarhus: henter lag ${layerName}...`,
            progress: 15,
          });

          const featureParams = new URLSearchParams({
            service: "WFS",
            version: "1.0.0",
            request: "GetFeature",
            typeName: layerName,
            outputFormat: "json",
            SRSNAME: "EPSG:4326",
            maxFeatures: String(MAX_WFS_FEATURES),
          });

          const res = await fetchWithTimeout(
            `${AARHUS_WFS}?${featureParams.toString()}`
          );
          if (!res || !res.ok) continue;

          const geojson = await res.json();
          for (const feature of geojson?.features || []) {
            const p = parseAarhusWfsFeature(feature, layerName);
            if (p) permits.push(p);
          }
        }
      }
    }
  } catch (e) {
    console.warn("[WFS] Aarhus WebKort failed:", e);
  }

  // ── Try Aarhus Open Data portal (CKAN) ──
  emit({
    phase: "wfs_layer",
    message: "Forsøger Aarhus Open Data portal...",
    detail: "portal.opendata.dk/organization/city-of-aarhus",
    progress: 20,
  });

  try {
    // Search for relevant datasets
    const searchUrl =
      "https://portal.opendata.dk/api/3/action/package_search?q=gravetilladelser+OR+vejarbejde+OR+stilladser&fq=organization:city-of-aarhus&rows=10";
    const searchRes = await fetchWithTimeout(searchUrl);

    if (searchRes && searchRes.ok) {
      const searchData = await searchRes.json();
      const packages = searchData?.result?.results || [];

      for (const pkg of packages) {
        for (const resource of pkg.resources || []) {
          if (
            resource.format?.toLowerCase() === "geojson" ||
            resource.url?.includes("wfs")
          ) {
            emit({
              phase: "wfs_layer",
              message: `Aarhus dataset: ${pkg.title}`,
              detail: resource.url,
              progress: 22,
            });

            try {
              const res = await fetchWithTimeout(resource.url);
              if (res && res.ok) {
                const data = await res.json();
                const features = data?.features || [];
                for (const feature of features) {
                  const p = parseAarhusWfsFeature(
                    feature,
                    resource.url
                  );
                  if (p) permits.push(p);
                }
              }
            } catch {
              /* dataset may be unavailable */
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("[Aarhus] Open data search failed:", e);
  }

  // ── Aarhus: also try the national opendata.dk for excavation permits ──
  try {
    const gravelUrl =
      "https://portal.opendata.dk/api/3/action/package_search?q=gravetilladelser&fq=organization:city-of-aarhus&rows=5";
    const res = await fetchWithTimeout(gravelUrl);
    if (res && res.ok) {
      const data = await res.json();
      for (const pkg of data?.result?.results || []) {
        for (const resource of pkg.resources || []) {
          if (resource.format?.toLowerCase() === "geojson") {
            const gRes = await fetchWithTimeout(resource.url);
            if (gRes && gRes.ok) {
              const gData = await gRes.json();
              for (const feature of gData?.features || []) {
                const p = parseAarhusWfsFeature(
                  feature,
                  resource.url
                );
                if (p) permits.push(p);
              }
            }
          }
        }
      }
    }
  } catch {
    /* optional */
  }

  // ── Fallback: web search for Aarhus scaffolding ──
  if (permits.length === 0) {
    emit({
      phase: "wfs_layer",
      message:
        "Aarhus GIS data ikke tilgængeligt – bruger websøgning som backup",
      progress: 25,
    });

    const webPermits = await searchForScaffolding("Aarhus");
    permits.push(...webPermits);
  }

  return permits;
}

function parseAarhusWfsFeature(
  feature: Record<string, unknown>,
  sourceLayer: string
): ScaffoldingPermit | null {
  const props = (feature as Record<string, unknown>).properties as Record<string, unknown> | undefined;
  if (!props) return null;

  const lokation = String(
    props.lokation || props.adresse || props.vejnavn || ""
  );
  if (!lokation) return null;

  const sagstype = String(props.sagstype || props.type || "");
  const kategori = String(props.kategori || props.beskrivelse || "");

  // Filter out non-construction entries
  const combined = (sagstype + " " + kategori).toLowerCase();
  if (
    combined.includes("udeservering") ||
    combined.includes("gadesalg") ||
    combined.includes("festival")
  ) {
    return null;
  }

  return {
    id: String(
      props.sagsid ||
        props.id ||
        `aarhus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    ),
    address: lokation,
    streetName: extractStreetName(lokation),
    houseNumber: extractHouseNumber(lokation),
    postalCode: String(props.postnr || "8000"),
    city: "Aarhus",
    permitType: inferPermitType(sagstype, kategori),
    category: kategori,
    sagstype,
    description: kategori,
    createdDate: parseWfsDate(String(props.oprettet || props.sagmodtaget || props.projekt_start || props.startdato || "")),
    startDate: parseWfsDate(String(props.projekt_start || props.startdato || "")),
    endDate: parseWfsDate(String(props.projekt_slut || props.slutdato || "")),
    applicant: String(props.bygherre || props.ansoeger || ""),
    contractor: String(props.entreprenoer || ""),
    sourceUrl: "aarhus-kommune",
    sourceLayer,
  };
}

// ================================================================
// DAWA Address Enrichment
// ================================================================

/**
 * Enrich permits with postal code and city data from DAWA (dawa.aws.dk).
 * Batch processes all permits.
 */
async function enrichPermitsWithDawa(
  permits: ScaffoldingPermit[],
  emit: ScaffoldingProgressCallback
): Promise<void> {
  const needsEnrichment = permits.filter(
    (p) => !p.postalCode || p.postalCode === ""
  );

  if (needsEnrichment.length === 0) return;

  // Process in batches of 20 to avoid overloading DAWA
  const batchSize = 20;
  let processed = 0;

  for (let i = 0; i < needsEnrichment.length; i += batchSize) {
    const batch = needsEnrichment.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async (permit) => {
        try {
          const query = `${permit.streetName} ${permit.houseNumber}, ${permit.city}`;
          const url = `https://dawa.aws.dk/adresser?q=${encodeURIComponent(query)}&per_side=1&struktur=mini`;
          const res = await fetchWithTimeout(url);
          if (!res || !res.ok) return;

          const results = await res.json();
          if (results?.[0]) {
            const addr = results[0];
            permit.postalCode = String(
              addr.postnr?.nr || addr.postnr || ""
            );
            if (!permit.lat && addr.y) {
              permit.lat = addr.y;
              permit.lng = addr.x;
            }
          }
        } catch {
          /* address enrichment is best-effort */
        }
      })
    );

    processed += batch.length;
    if (processed % 200 === 0 || processed === needsEnrichment.length) {
      emit({
        phase: "geocode_progress",
        message: `Adresseopslag: ${processed}/${needsEnrichment.length}`,
        progress: 40 + Math.round((processed / needsEnrichment.length) * 10),
      });
    }
  }
}

// ================================================================
// Web Search Fallback
// ================================================================

/**
 * DuckDuckGo-based search fallback when WFS APIs are unavailable.
 */
async function searchForScaffolding(
  city: string
): Promise<ScaffoldingPermit[]> {
  const permits: ScaffoldingPermit[] = [];

  const queries = [
    `stillads tilladelse ${city} 2025 2026`,
    `"råden over vej" stillads ${city}`,
    `byggestillads ${city} aktiv`,
    `facaderenovering stillads ${city}`,
  ];

  for (const query of queries) {
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetchWithTimeout(searchUrl);
      if (!res || !res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      $(".result").each((idx, el) => {
        if (idx >= 5) return false;

        const titleEl = $(el).find(".result__title a, .result__a");
        const snippetEl = $(el).find(".result__snippet");
        const snippet = snippetEl.text().trim();
        const title = titleEl.text().trim();

        const addressMatch = snippet.match(
          /([A-ZÆØÅa-zæøå]+(?:\s+[A-ZÆØÅa-zæøå]+)*)\s+(\d+[A-Z]?)\s*,?\s*(\d{4})\s+([A-ZÆØÅa-zæøå]+)/
        );

        if (addressMatch || isScaffoldingRelated(title + " " + snippet)) {
          permits.push({
            id: `web-${permits.length}-${Date.now()}`,
            address: addressMatch
              ? `${addressMatch[1]} ${addressMatch[2]}`
              : extractAddressFromText(title + " " + snippet),
            streetName: addressMatch
              ? addressMatch[1]
              : extractStreetFromText(title + " " + snippet),
            houseNumber: addressMatch ? addressMatch[2] : "",
            postalCode: addressMatch ? addressMatch[3] : "",
            city: addressMatch ? addressMatch[4] : city,
            permitType: "stillads",
            category: "Websøgning",
            sagstype: "Websøgning",
            description: snippet.substring(0, 200),
            sourceUrl: titleEl.attr("href") || "",
            sourceLayer: "duckduckgo",
          });
        }
      });
    } catch (e) {
      console.warn(`[Scaffolding] Search failed for "${query}":`, e);
    }
  }

  // Dedup by address
  const seen = new Set<string>();
  return permits.filter((p) => {
    if (!p.address || p.address.length < 5) return false;
    const key = p.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ================================================================
// Scoring & Classification
// ================================================================

function calculateScaffoldingScore(
  permit: ScaffoldingPermit,
  dailyTraffic: number
): number {
  let score = 5; // Base

  // ── Traffic bonus ──
  if (dailyTraffic >= 40000) score += 3;
  else if (dailyTraffic >= 25000) score += 2;
  else if (dailyTraffic >= 10000) score += 1;
  else score -= 2;

  // ── Permit type bonus ──
  if (permit.permitType === "Stilladsreklamer") {
    score += 2; // Specifically a scaffolding advertisement permit
  } else if (permit.permitType === "Stilladser") {
    score += 2; // Confirmed scaffolding
  }

  // ── Duration bonus ──
  if (permit.durationWeeks) {
    if (permit.durationWeeks >= 24) score += 2; // 6+ months
    else if (permit.durationWeeks >= 12) score += 1; // 3+ months
  }

  // ── Facade area bonus (for stilladsreklamer) ──
  if (permit.facadeArea) {
    const area = parseFloat(permit.facadeArea);
    if (area >= 200) score += 1;
    if (area >= 500) score += 1;
  }

  // ── Contact info bonus (easier to reach) ──
  if (permit.contactEmail || permit.contactPhone) {
    score += 0.5;
  }

  // ── Official source bonus ──
  if (
    permit.sourceUrl === "kbhkort.kk.dk" ||
    permit.sourceUrl === "aarhus-kommune"
  ) {
    score += 0.5;
  }

  return Math.max(1, Math.min(10, Math.round(score)));
}

function buildScaffoldingReason(
  permit: ScaffoldingPermit,
  dailyTraffic: number
): string {
  const parts: string[] = [];

  parts.push(`${permit.sagstype}: ${permit.category} på ${permit.address}.`);

  if (dailyTraffic >= 10000) {
    parts.push(`God trafik (~${formatTraffic(dailyTraffic)}/dag).`);
  } else {
    parts.push(`Lav trafik (~${formatTraffic(dailyTraffic)}/dag).`);
  }

  if (permit.durationWeeks) {
    parts.push(`Varighed: ~${permit.durationWeeks} uger.`);
  }
  if (permit.startDate && permit.endDate) {
    parts.push(`Periode: ${permit.startDate} → ${permit.endDate}.`);
  }
  if (permit.applicant) {
    parts.push(`Bygherre: ${permit.applicant}.`);
  }
  if (permit.contractor) {
    parts.push(`Entreprenør: ${permit.contractor}.`);
  }

  return parts.join(" ");
}

function formatScaffoldingNotes(permit: ScoredScaffolding): string {
  const lines: string[] = [
    `═══════════════════════════════════════`,
    `STILLADS DISCOVERY – DAGLIG RAPPORT`,
    `═══════════════════════════════════════`,
    `Score: ${permit.outdoorScore}/10`,
    `Begrundelse: ${permit.scoreReason}`,
    "",
    "── Tilladelsesdata ──",
    `  Sagstype: ${permit.sagstype}`,
    `  Kategori: ${permit.category}`,
    `  Tilladelses-ID: ${permit.id}`,
  ];
  if (permit.sagsnr) lines.push(`  Sagsnr: ${permit.sagsnr}`);
  if (permit.description) lines.push(`  Beskrivelse: ${permit.description}`);
  if (permit.startDate) lines.push(`  Start: ${permit.startDate}`);
  if (permit.endDate) lines.push(`  Slut: ${permit.endDate}`);
  if (permit.durationWeeks) lines.push(`  Varighed: ~${permit.durationWeeks} uger`);

  lines.push("");
  lines.push("── Parter ──");
  if (permit.applicant) lines.push(`  Bygherre: ${permit.applicant}`);
  if (permit.contractor) lines.push(`  Entreprenør: ${permit.contractor}`);
  if (permit.contactPerson) lines.push(`  Kontaktperson: ${permit.contactPerson}`);
  if (permit.contactPhone) lines.push(`  Telefon: ${permit.contactPhone}`);
  if (permit.contactEmail) lines.push(`  Email: ${permit.contactEmail}`);
  if (permit.facadeArea) lines.push(`  Facadeareal: ${permit.facadeArea} m²`);

  lines.push("");
  lines.push("── Trafikdata ──");
  lines.push(
    `  Estimeret daglig trafik: ~${formatTraffic(permit.estimatedDailyTraffic || 0)} biler/dag`
  );
  lines.push(`  Kilde: ${permit.trafficSource || "estimat"}`);

  lines.push("");
  lines.push("── Datakilde ──");
  lines.push(`  API: ${permit.sourceUrl || "ukendt"}`);
  lines.push(`  Lag: ${permit.sourceLayer || "ukendt"}`);
  if (permit.lat && permit.lng) {
    lines.push(`  Koordinater: ${permit.lat.toFixed(5)}, ${permit.lng.toFixed(5)}`);
  }
  lines.push(`  Hentet: ${new Date().toLocaleString("da-DK")}`);
  lines.push(`═══════════════════════════════════════`);

  return lines.join("\n");
}

// ================================================================
// Daily Report Builder
// ================================================================

function buildDailyReportSummary(
  result: ScaffoldingResult,
  scored: ScoredScaffolding[],
  qualified: ScoredScaffolding[],
  city: string
): string {
  const now = new Date();
  const lines: string[] = [];

  lines.push(`═══ DAGLIG STILLADS-RAPPORT: ${city.toUpperCase()} ═══`);
  lines.push(`Dato: ${now.toLocaleDateString("da-DK")} kl. ${now.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}`);
  lines.push("");

  // ── Overview ──
  lines.push(`📊 OVERBLIK:`);
  lines.push(`   Total tilladelser fundet: ${result.totalPermits}`);
  lines.push(`   Kvalificerede (score+trafik): ${qualified.length}`);

  // ── By type breakdown ──
  const byType = result.byType;
  if (Object.keys(byType).length > 0) {
    lines.push("");
    lines.push(`📋 FORDELING PER TYPE:`);
    Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        lines.push(`   ${count}× ${type}`);
      });
  }

  // ── Top 10 by score ──
  lines.push("");
  lines.push(`🏆 TOP 10 STILLADS-LOKATIONER:`);
  qualified.slice(0, 10).forEach((s, i) => {
    lines.push(
      `   ${i + 1}. ${s.address} — Score: ${s.outdoorScore}/10, ~${formatTraffic(s.estimatedDailyTraffic || 0)}/dag`
    );
    lines.push(
      `      ${s.sagstype} / ${s.category} | ${s.startDate || "?"} → ${s.endDate || "?"}`
    );
    if (s.applicant) lines.push(`      Bygherre: ${s.applicant}`);
  });

  // ── Data sources ──
  lines.push("");
  lines.push(`🗂️ DATAKILDER:`);
  result.sources.forEach((s) => {
    lines.push(`   ${s.name}: ${s.count} tilladelser`);
  });

  return lines.join("\n");
}

// ================================================================
// Utility Functions
// ================================================================

/**
 * Normalize a city name to plain ASCII lowercase for reliable comparison.
 * Handles Danish characters (æ→ae, ø→o, å→a) regardless of file encoding.
 * Uses Unicode codepoint checks so it works even if source file encoding varies.
 */
function normalizeCityName(city: string): string {
  return city
    .toLowerCase()
    .normalize("NFD")                          // decompose: ø → o + ̸, å → a + ̊, etc.
    .replace(/[\u0300-\u036f]/g, "")           // strip combining diacritics
    .replace(/\u00f8/g, "o")                   // ø (if NFD didn't decompose it)
    .replace(/\u00e6/g, "ae")                  // æ
    .replace(/\u00e5/g, "a")                   // å
    .replace(/\u00c3\u00b8/g, "o")             // Ã¸ (UTF-8 mojibake for ø)
    .replace(/\u00c3\u00a6/g, "ae")            // Ã¦ (UTF-8 mojibake for æ)
    .replace(/\u00c3\u00a5/g, "a")             // Ã¥ (UTF-8 mojibake for å)
    .replace(/[^a-z]/g, "");                   // strip everything non a-z
}

function parseWfsDate(dateStr: string | null | undefined): string | undefined {
  if (!dateStr) return undefined;
  // Handle both "01-01-26" (DD-MM-YY) and ISO format "2025-12-31T23:00:00Z"
  const str = String(dateStr).trim();
  if (!str || str === "null" || str === "undefined") return undefined;

  // ISO format
  if (str.includes("T")) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  }

  // DD-MM-YY format
  const ddmmyy = str.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (ddmmyy) {
    const year = parseInt(ddmmyy[3]) + 2000;
    return `${year}-${ddmmyy[2]}-${ddmmyy[1]}`;
  }

  return str;
}

function buildDescription(props: Record<string, unknown>): string {
  const parts: string[] = [];
  if (props.sagstype) parts.push(String(props.sagstype));
  if (props.kategori) parts.push(String(props.kategori));
  if (props.arbejdetsformaal) parts.push(String(props.arbejdetsformaal));
  if (props.gravetype) parts.push(String(props.gravetype));
  if (props.udfoerelsesmetode) parts.push(String(props.udfoerelsesmetode));
  return parts.join(" – ");
}

function inferPermitType(sagstype: string, kategori: string): string {
  const combined = (sagstype + " " + kategori).toLowerCase();
  if (combined.includes("stilladsreklam")) return "Stilladsreklamer";
  if (combined.includes("stillads")) return "Stilladser";
  return "Stilladser"; // Default fallback for scaffolding-related
}

function isScaffoldingRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("stillads") ||
    lower.includes("scaffold") ||
    lower.includes("facaderenovering") ||
    lower.includes("facadearbejde") ||
    lower.includes("byggestillads") ||
    lower.includes("råden over vej") ||
    lower.includes("raadenOverVej") ||
    lower.includes("byggeplads") ||
    (lower.includes("renovering") && lower.includes("facade"))
  );
}

function extractStreetName(address: string): string {
  // Handle range addresses like "Lyshøj Allé 2 - 28"
  return address
    .replace(/\s+\d+\s*[-–]\s*\d+.*$/, "")
    .replace(/\s+\d+[A-Za-z]?.*$/, "")
    .trim();
}

function extractHouseNumber(address: string): string {
  const match = address.match(/\s+(\d+[A-Za-z]?)(?:\s|$|,|-)/);
  return match ? match[1] : "";
}

function extractAddressFromText(text: string): string {
  const match = text.match(
    /([A-ZÆØÅa-zæøå]+(?:\s+[A-ZÆØÅa-zæøå]+)*)\s+(\d+[A-Z]?)/
  );
  return match ? `${match[1]} ${match[2]}` : "";
}

function extractStreetFromText(text: string): string {
  const match = text.match(
    /([A-ZÆØÅa-zæøå]+(?:\s+[A-ZÆØÅa-zæøå]+)*)\s+\d+/
  );
  return match ? match[1] : "";
}

async function fetchWithTimeout(
  url: string
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "application/json,text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res;
  } catch {
    return null;
  }
}
