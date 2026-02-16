// ============================================================
// Discovery Orchestrator – Ties street scanning, scoring,
// and staging together. Supports live progress.
//
// Properties are now written to local staging (Supabase) instead
// of HubSpot. They must be explicitly approved before reaching CRM.
// ============================================================

import { scanStreet } from "./street-scanner";
import { scoreForOutdoorPotential } from "./scoring";
import { estimateStreetTraffic, formatTraffic } from "./traffic";
import { insertStagedProperty, stagedExistsByAddress } from "../staging/store";
import { ejendomExistsByAddress } from "../hubspot";
import type { DiscoveryResult, ScoredCandidate } from "@/types";

// In-memory store for recent discovery runs
const recentDiscoveries: DiscoveryResult[] = [];
const MAX_STORED = 20;

/** Progress event sent during discovery */
export interface DiscoveryProgress {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;    // 0-100
  candidates?: ScoredCandidate[];
  result?: DiscoveryResult;
}

export type ProgressCallback = (event: DiscoveryProgress) => void;

/**
 * Discover properties on a street with live progress updates.
 */
export async function discoverStreet(
  street: string,
  city: string,
  minScore = 6,
  minTraffic = 10000,
  onProgress?: ProgressCallback,
  isCancelled?: () => boolean
): Promise<DiscoveryResult> {
  const emit = onProgress || (() => {});
  const checkCancelled = isCancelled || (() => false);

  const result: DiscoveryResult = {
    street,
    city,
    totalAddresses: 0,
    afterPreFilter: 0,
    afterTrafficFilter: 0,
    afterScoring: 0,
    created: 0,
    skipped: 0,
    alreadyExists: 0,
    candidates: [],
    startedAt: new Date().toISOString(),
  };

  try {
    // ── Phase 0: Traffic check ──
    const trafficEstimate = estimateStreetTraffic(street, city);
    result.estimatedTraffic = trafficEstimate.estimatedDailyTraffic;
    result.trafficSource = trafficEstimate.trafficSource;

    const trafficFormatted = formatTraffic(trafficEstimate.estimatedDailyTraffic);
    const sourceLabel = trafficEstimate.trafficSource === "vejdirektoratet"
      ? "Vejdirektoratet" : trafficEstimate.trafficSource === "kommune"
      ? "Kommunedata" : "AI-estimat";

    emit({
      phase: "traffic_check",
      message: `Trafik-tjek: ${street} har ca. ${trafficFormatted} daglige trafikanter`,
      detail: `Kilde: ${sourceLabel} (konfidens: ${Math.round(trafficEstimate.confidence * 100)}%). Minimum krav: ${formatTraffic(minTraffic)}`,
      progress: 3,
    });

    if (trafficEstimate.estimatedDailyTraffic < minTraffic && trafficEstimate.confidence >= 0.5) {
      emit({
        phase: "traffic_rejected",
        message: `${street} afvist: ${trafficFormatted} daglige trafikanter er under minimum (${formatTraffic(minTraffic)})`,
        detail: `Vejen har for lav trafik til outdoor reklame. Prøv en mere befærdet vej.`,
        progress: 100,
        result,
      });
      result.completedAt = new Date().toISOString();
      storeResult(result);
      return result;
    }

    if (trafficEstimate.estimatedDailyTraffic < minTraffic) {
      emit({
        phase: "traffic_warning",
        message: `Advarsel: ${street} estimeres til kun ${trafficFormatted} daglige trafikanter (usikkert estimat)`,
        detail: `Fortsætter scanning da estimatet er usikkert. Verificér trafik manuelt.`,
        progress: 4,
      });
    } else {
      emit({
        phase: "traffic_ok",
        message: `Trafik godkendt: ${trafficFormatted} daglige trafikanter`,
        progress: 5,
      });
    }

    // ── Phase 1: Find addresses ──
    emit({
      phase: "scan",
      message: `Finder alle bygninger på ${street}, ${city}...`,
      detail: "Henter adresser fra DAWA (Danmarks Adresser) + BBR bygningsdata",
      progress: 8,
    });

    const candidates = await scanStreet(street, city);
    result.afterPreFilter = candidates.length;
    result.totalAddresses = candidates.length;
    result.afterTrafficFilter = candidates.length; // all pass since street-level check already done

    emit({
      phase: "scan_done",
      message: `Fandt ${candidates.length} relevante bygninger`,
      detail: `Garager, skure og bygninger under 100m² er fjernet. Trafik: ~${trafficFormatted}/dag`,
      progress: 30,
    });

    if (candidates.length === 0) {
      emit({
        phase: "done",
        message: "Ingen relevante bygninger fundet på denne vej",
        progress: 100,
        result,
      });
      result.completedAt = new Date().toISOString();
      storeResult(result);
      return result;
    }

    // Check cancellation after scan
    if (checkCancelled()) {
      emit({ phase: "cancelled", message: "Stoppet af bruger efter scanning", progress: 100 });
      result.completedAt = new Date().toISOString();
      storeResult(result);
      return result;
    }

    // ── Phase 2: LLM scoring ──
    const totalBatches = Math.ceil(candidates.length / 15);
    emit({
      phase: "scoring",
      message: `AI vurderer ${candidates.length} bygninger for outdoor-potentiale...`,
      detail: `${totalBatches} batch${totalBatches > 1 ? "es" : ""} sendes til GPT-4o-mini med trafikdata og bygningsinfo`,
      progress: 35,
    });

    let batchesDone = 0;
    const scored = await scoreForOutdoorPotential(
      candidates,
      street,
      city,
      (batchIndex, batchTotal, batchResults) => {
        batchesDone++;
        const pct = 35 + Math.round((batchesDone / batchTotal) * 40);
        const topInBatch = batchResults.sort((a, b) => b.outdoorScore - a.outdoorScore)[0];
        emit({
          phase: "scoring_batch",
          message: `AI scorer batch ${batchIndex + 1}/${batchTotal} (${batchResults.length} bygninger)`,
          detail: topInBatch
            ? `Bedste: ${topInBatch.address} → ${topInBatch.outdoorScore}/10 – "${topInBatch.scoreReason?.substring(0, 80)}..."`
            : undefined,
          progress: pct,
        });
      }
    );

    result.candidates = scored;

    const qualified = scored.filter((c) => c.outdoorScore >= minScore);
    result.afterScoring = qualified.length;

    // Build a rich summary
    const top5 = scored.slice(0, 5);
    const avgScore = scored.length > 0
      ? (scored.reduce((sum, c) => sum + c.outdoorScore, 0) / scored.length).toFixed(1)
      : "0";

    emit({
      phase: "scoring_done",
      message: `Scoring færdig! ${qualified.length} af ${scored.length} scorer >= ${minScore}`,
      detail: `Gns. score: ${avgScore}/10 | Top: ${top5.map(c => `${c.address} (${c.outdoorScore})`).join(", ")}`,
      progress: 78,
      candidates: scored,
    });

    // Check cancellation after scoring
    if (checkCancelled()) {
      emit({ phase: "cancelled", message: `Stoppet af bruger efter scoring – ${qualified.length} kandidater fundet`, progress: 100, candidates: scored });
      result.completedAt = new Date().toISOString();
      storeResult(result);
      return result;
    }

    // ── Phase 3: Dedup + stage locally (NOT HubSpot) ──
    if (qualified.length === 0) {
      result.skipped = scored.length;
      emit({
        phase: "done",
        message: "Ingen bygninger scorede højt nok. Prøv at sænke minimum score.",
        progress: 100,
        result,
      });
    } else {
      emit({
        phase: "staging",
        message: `Gemmer ${qualified.length} ejendomme i staging...`,
        detail: "Tjekker for duplikater i staging + HubSpot, gemmer nye i lokal staging",
        progress: 80,
      });

      for (let i = 0; i < qualified.length; i++) {
        // Check cancellation before each staging insert
        if (checkCancelled()) {
          emit({
            phase: "cancelled",
            message: `Stoppet af bruger – ${result.created} ejendomme staged af ${qualified.length}`,
            progress: 100,
            candidates: scored,
          });
          break;
        }

        const candidate = qualified[i];
        try {
          // Check both staging and HubSpot for duplicates
          const [existsInStaging, existsInHubSpot] = await Promise.all([
            stagedExistsByAddress(candidate.address),
            ejendomExistsByAddress(candidate.address).catch(() => false),
          ]);
          if (existsInStaging || existsInHubSpot) {
            result.alreadyExists++;
            emit({
              phase: "dedup_skip",
              message: `${candidate.address} — eksisterer allerede${existsInHubSpot ? " i HubSpot" : " i staging"}`,
              progress: 80 + Math.round(((i + 1) / qualified.length) * 18),
            });
            continue;
          }

          await insertStagedProperty({
            name: candidate.address,
            address: candidate.address,
            postalCode: candidate.postalCode,
            city: candidate.city,
            outdoorScore: candidate.outdoorScore,
            outdoorNotes: formatCandidateNotes(candidate, trafficEstimate.estimatedDailyTraffic),
            dailyTraffic: trafficEstimate.estimatedDailyTraffic,
            source: "discovery",
          });

          result.created++;
          emit({
            phase: "staging_created",
            message: `${candidate.address} — gemt i staging! Score: ${candidate.outdoorScore}/10, Trafik: ~${trafficFormatted}/dag`,
            progress: 80 + Math.round(((i + 1) / qualified.length) * 18),
          });
        } catch (e) {
          console.warn(`[Discovery] Failed to stage ${candidate.address}:`, e);
          result.skipped++;
          emit({
            phase: "staging_error",
            message: `${candidate.address} — fejl ved staging`,
            detail: e instanceof Error ? e.message : "Ukendt fejl",
            progress: 80 + Math.round(((i + 1) / qualified.length) * 18),
          });
        }
      }

      result.skipped += scored.filter((c) => c.outdoorScore < minScore).length;
    }

    result.completedAt = new Date().toISOString();

    emit({
      phase: "done",
      message: `Færdig! ${result.created} nye ejendomme gemt i staging, ${result.alreadyExists} eksisterede allerede`,
      detail: `Trafik: ~${trafficFormatted}/dag | ${scored.length} vurderet | ${result.skipped} under min. score | Afventer godkendelse i Staging Queue`,
      progress: 100,
      result,
      candidates: scored,
    });
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
    result.completedAt = new Date().toISOString();
    emit({
      phase: "error",
      message: `Fejl: ${result.error}`,
      progress: 100,
      result,
    });
  }

  storeResult(result);
  return result;
}

/**
 * Get recent discovery runs.
 */
export function getRecentDiscoveries(): DiscoveryResult[] {
  return [...recentDiscoveries].reverse();
}

// ─── Helpers ────────────────────────────────────────────────

function formatCandidateNotes(c: ScoredCandidate, traffic?: number): string {
  const lines: string[] = [];
  lines.push(`AI Discovery Score: ${c.outdoorScore}/10`);
  lines.push(c.scoreReason);
  lines.push("");
  lines.push("Bygningsdata:");
  if (c.area) lines.push(`  Areal: ${c.area} m2`);
  if (c.floors) lines.push(`  Etager: ${c.floors}`);
  if (c.units) lines.push(`  Boliger: ${c.units}`);
  if (c.usageText) lines.push(`  Anvendelse: ${c.usageText}`);
  if (c.buildingYear) lines.push(`  Byggeår: ${c.buildingYear}`);
  lines.push("");
  lines.push("Trafikdata:");
  lines.push(`  Estimeret daglig trafik: ${traffic ? `~${traffic.toLocaleString("da-DK")} køretøjer` : "Ukendt"}`);
  lines.push(`  Kilde: ${c.trafficSource || "estimat"}`);
  return lines.join("\n");
}

function storeResult(result: DiscoveryResult): void {
  recentDiscoveries.push(result);
  if (recentDiscoveries.length > MAX_STORED) {
    recentDiscoveries.shift();
  }
}

export { scanStreet } from "./street-scanner";
export { scoreForOutdoorPotential } from "./scoring";
