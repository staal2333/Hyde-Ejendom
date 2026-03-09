"use client";
import { useState, useRef, useCallback } from "react";
import type { DiscoveryResultData, ProgressEvent } from "./types";
import { useSSEStream } from "./useSSEStream";

interface UseDiscoveryDeps {
  setError: (msg: string | null) => void;
  fetchData: () => Promise<void>;
  addToast: (msg: string, type: "success" | "error" | "info", detail?: string) => void;
}

function emptyDiscovery(street: string, city: string): DiscoveryResultData {
  return { street, city, totalAddresses: 0, afterPreFilter: 0, afterTrafficFilter: 0, afterScoring: 0, created: 0, skipped: 0, alreadyExists: 0, candidates: [] };
}

export function useDiscovery({ setError, fetchData, addToast }: UseDiscoveryDeps) {
  const [discoverStreet, setDiscoverStreet] = useState("");
  const [discoverCity, setDiscoverCity] = useState("København");
  const [discoverPostcodes, setDiscoverPostcodes] = useState("");
  const [discoverMinScore, setDiscoverMinScore] = useState(6);
  const [discoverMinTraffic, setDiscoverMinTraffic] = useState(10000);
  const [discoverMaxCandidates, setDiscoverMaxCandidates] = useState(50);
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResultData | null>(null);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [progressPct, setProgressPct] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("");
  const progressLogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { consumeSSE } = useSSEStream({ setError, fetchData });

  const triggerDiscovery = useCallback(async () => {
    if (!discoverStreet.trim()) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDiscoveryRunning(true);
    setDiscoveryResult(null);
    setProgressEvents([]);
    setProgressPct(0);
    setCurrentPhase("");
    addToast(`Scanner ${discoverStreet.trim()}...`, "info");

    await consumeSSE(
      "/api/discover", "POST",
      { street: discoverStreet.trim(), city: discoverCity.trim(), minScore: discoverMinScore, minTraffic: discoverMinTraffic, maxCandidates: discoverMaxCandidates > 0 ? discoverMaxCandidates : undefined },
      setProgressEvents, setProgressPct, setCurrentPhase,
      (pe) => {
        if (pe.candidates) setDiscoveryResult((prev) => ({ ...(prev || emptyDiscovery(discoverStreet, discoverCity)), candidates: pe.candidates! }));
        if (pe.result) {
          setDiscoveryResult({ success: !pe.result.error, ...pe.result });
          addToast(`Discovery færdig: ${pe.result.created} ejendomme oprettet`, "success");
        }
      },
      () => { setDiscoveryRunning(false); abortRef.current = null; },
      controller.signal
    );
  }, [discoverStreet, discoverCity, discoverMinScore, discoverMinTraffic, discoverMaxCandidates, consumeSSE, addToast]);

  const triggerAreaDiscovery = useCallback(async () => {
    const postcodes = discoverPostcodes.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
    if (postcodes.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDiscoveryRunning(true);
    setDiscoveryResult(null);
    setProgressEvents([]);
    setProgressPct(0);
    setCurrentPhase("");
    addToast(`Scanner område ${postcodes.join(", ")}...`, "info");

    const empty = emptyDiscovery(`Område: ${postcodes.join(", ")}`, discoverCity.trim());

    await consumeSSE(
      "/api/discover-area", "POST",
      { postcodes, city: discoverCity.trim(), minScore: discoverMinScore, maxAddresses: 500, maxCandidates: discoverMaxCandidates > 0 ? discoverMaxCandidates : undefined },
      setProgressEvents, setProgressPct, setCurrentPhase,
      (pe) => {
        if (pe.candidates) setDiscoveryResult((prev) => ({ ...(prev || empty), candidates: pe.candidates! }));
        if (pe.result) {
          setDiscoveryResult({ success: !pe.result.error, ...pe.result });
          addToast(`Område-scan færdig: ${pe.result.created} ejendomme oprettet`, "success");
        }
      },
      () => { setDiscoveryRunning(false); abortRef.current = null; },
      controller.signal
    );
  }, [discoverPostcodes, discoverCity, discoverMinScore, discoverMaxCandidates, consumeSSE, addToast]);

  const stopDiscovery = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    addToast("Discovery stoppet", "info");
  }, [addToast]);

  return {
    // State
    discoverStreet, setDiscoverStreet,
    discoverCity, setDiscoverCity,
    discoverPostcodes, setDiscoverPostcodes,
    discoverMinScore, setDiscoverMinScore,
    discoverMinTraffic, setDiscoverMinTraffic,
    discoverMaxCandidates, setDiscoverMaxCandidates,
    discoveryRunning,
    discoveryResult, setDiscoveryResult,
    progressEvents, setProgressEvents,
    progressPct,
    currentPhase,
    progressLogRef,
    // Actions
    triggerDiscovery,
    triggerAreaDiscovery,
    stopDiscovery,
  };
}
