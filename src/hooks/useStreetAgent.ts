"use client";
import { useState, useRef, useCallback } from "react";
import type { ProgressEvent, AgentActivityRun } from "./types";
import { useSSEStream } from "./useSSEStream";

interface UseStreetAgentDeps {
  setError: (msg: string | null) => void;
  fetchData: () => Promise<void>;
  addToast: (msg: string, type: "success" | "error" | "info", detail?: string) => void;
}

async function postActivity(update: Partial<AgentActivityRun & { id: string; street: string; city: string }>) {
  try {
    await fetch("/api/agent/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
  } catch { /* non-critical */ }
}

export function useStreetAgent({ setError, fetchData, addToast }: UseStreetAgentDeps) {
  const [agentStreet, setAgentStreet] = useState("");
  const [agentCity, setAgentCity] = useState("København");
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentEvents, setAgentEvents] = useState<ProgressEvent[]>([]);
  const [agentPct, setAgentPct] = useState(0);
  const [agentPhaseLabel, setAgentPhaseLabel] = useState("");
  const [agentStats, setAgentStats] = useState<Record<string, number> | null>(null);
  const [liveActivity, setLiveActivity] = useState<AgentActivityRun[]>([]);
  const agentLogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);

  const { consumeSSE } = useSSEStream({ setError, fetchData });

  const addEvent = useCallback((ev: Omit<ProgressEvent, "timestamp">) => {
    setAgentEvents((prev) => [...prev, { ...ev, timestamp: Date.now() }]);
  }, []);

  const triggerStreetAgent = useCallback(async () => {
    if (!agentStreet.trim()) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setAgentRunning(true);
    setAgentEvents([]);
    setAgentPct(0);
    setAgentPhaseLabel("discovery");
    setAgentStats(null);

    const street = agentStreet.trim();
    const city = agentCity.trim();
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    runIdRef.current = runId;

    addToast(`Gade-agent starter: ${street}, ${city}...`, "info");
    await postActivity({ id: runId, street, city, phase: "discovery", progress: 0, message: "Henter adresser...", started_at: new Date().toISOString() });

    // Phase 1: addresses
    addEvent({ phase: "scan", message: `Henter adresser på ${street}...`, progress: 2 });

    let addresses: unknown[] = [];
    let trafficDaily = 0;
    let trafficFormatted = "";

    try {
      const addrRes = await fetch(
        `/api/agent/street/addresses?street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}`,
        { signal: controller.signal }
      );
      if (!addrRes.ok) throw new Error(`Adresse-opslag fejlede (${addrRes.status})`);
      const addrData = await addrRes.json() as { addresses: unknown[]; total: number; trafficEstimate: { daily: number; formatted: string } };
      addresses = addrData.addresses;
      trafficDaily = addrData.trafficEstimate.daily;
      trafficFormatted = addrData.trafficEstimate.formatted;
      addEvent({ phase: "scan_done", message: `${addresses.length} adresser fundet · Trafik: ${trafficFormatted}/dag`, progress: 5 });
    } catch (e) {
      if (controller.signal.aborted) { setAgentRunning(false); return; }
      addEvent({ phase: "error", message: `Fejl ved adresse-opslag: ${e instanceof Error ? e.message : e}`, progress: 100 });
      setAgentRunning(false);
      return;
    }

    if (addresses.length === 0) {
      addEvent({ phase: "done", message: "Ingen adresser fundet på denne gade", progress: 100 });
      await postActivity({ id: runId, street, city, phase: "done", progress: 100, message: "Ingen adresser fundet", completed_at: new Date().toISOString() });
      setAgentRunning(false);
      return;
    }

    await postActivity({ id: runId, street, city, phase: "scoring", progress: 8, message: `Scorer ${addresses.length} bygninger...`, buildings_found: addresses.length });

    // Phase 2: batch scoring
    const BATCH_SIZE = 15;
    const batches: unknown[][] = [];
    for (let i = 0; i < addresses.length; i += BATCH_SIZE) batches.push(addresses.slice(i, i + BATCH_SIZE));

    addEvent({ phase: "scoring", message: `AI vurderer ${addresses.length} bygninger i ${batches.length} batches...`, progress: 8 });

    const stagedPropertyIds: string[] = [];
    let totalCreated = 0, totalAlreadyExists = 0;

    for (let i = 0; i < batches.length; i++) {
      if (controller.signal.aborted) break;
      const pct = 8 + Math.round((i / batches.length) * 55);
      addEvent({ phase: "scoring_batch", message: `AI scorer batch ${i + 1}/${batches.length}`, progress: pct });
      setAgentPct(pct);

      try {
        const batchRes = await fetch("/api/agent/street/score-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: batches[i], street, city, trafficDaily }),
          signal: controller.signal,
        });
        if (batchRes.ok) {
          const batchData = await batchRes.json() as { scored: { address: string; score: number; reason: string }[]; staged: { id: string; address: string }[]; created: number; alreadyExists: number; skipped: number };
          totalCreated += batchData.created || 0;
          totalAlreadyExists += batchData.alreadyExists || 0;
          if (batchData.staged?.length) {
            for (const s of batchData.staged) stagedPropertyIds.push(s.id);
            const top = batchData.scored.sort((a, b) => b.score - a.score)[0];
            addEvent({ phase: "staging_created", message: `Batch ${i + 1}: ${batchData.created} ny staged${top ? ` — Top: ${top.address} (${top.score}/10)` : ""}`, progress: pct });
          }
        }
      } catch (e) {
        if (controller.signal.aborted) break;
        addEvent({ phase: "scoring_batch_error", message: `Batch ${i + 1} fejlede: ${e instanceof Error ? e.message : e}`, progress: pct });
      }
    }

    if (controller.signal.aborted) { setAgentRunning(false); return; }

    const scoringPct = 63;
    setAgentPct(scoringPct);
    addEvent({ phase: "scoring_done", message: `Discovery færdig: ${totalCreated} nye staged, ${totalAlreadyExists} eksisterede allerede`, progress: scoringPct });

    if (totalCreated === 0) {
      setAgentStats({ totalBuildings: addresses.length, created: 0, alreadyExists: totalAlreadyExists, researchCompleted: 0, researchFailed: 0, emailDraftsGenerated: 0 });
      setAgentPhaseLabel("done");
      setAgentPct(100);
      addEvent({ phase: "agent_done", message: "Ingen nye ejendomme — alle eksisterer allerede eller scorede for lavt", progress: 100 });
      await postActivity({ id: runId, street, city, phase: "done", progress: 100, message: "Ingen nye ejendomme fundet", created_count: 0, completed_at: new Date().toISOString() });
      setAgentRunning(false);
      abortRef.current = null;
      return;
    }

    await postActivity({ id: runId, street, city, phase: "research", progress: scoringPct, message: `Researcher ${stagedPropertyIds.length} ejendomme...`, created_count: totalCreated, research_total: stagedPropertyIds.length, research_completed: 0 });

    // Phase 3: research each property
    setAgentPhaseLabel("research");
    addEvent({ phase: "research_start", message: `Fase 3: Researcher ${stagedPropertyIds.length} ejendomme individuelt...`, progress: scoringPct });

    let researchCompleted = 0, researchFailed = 0, emailDraftsGenerated = 0;

    for (let i = 0; i < stagedPropertyIds.length; i++) {
      if (controller.signal.aborted) break;
      const propId = stagedPropertyIds[i];
      const pct = scoringPct + Math.round((i / stagedPropertyIds.length) * (95 - scoringPct));
      addEvent({ phase: "research_property", message: `[${i + 1}/${stagedPropertyIds.length}] Researcher ejendom...`, progress: pct });
      setAgentPct(pct);

      let propDone = false, propFailed = false;
      await consumeSSE(
        "/api/run-research", "POST",
        { stagedPropertyId: propId },
        setAgentEvents, setAgentPct, setAgentPhaseLabel,
        (pe) => {
          if (pe.phase === "complete" || pe.phase === "done") propDone = true;
          if (pe.phase === "error") propFailed = true;
          const raw = pe as unknown as Record<string, unknown>;
          if (raw.stepId === "generate_email_draft" && raw.status === "completed") emailDraftsGenerated++;
        },
        () => { if (!propDone && !propFailed) propFailed = true; },
        controller.signal
      );

      if (propFailed) { researchFailed++; addEvent({ phase: "research_property_failed", message: `[${i + 1}/${stagedPropertyIds.length}] Fejlet – springer over` }); }
      else { researchCompleted++; addEvent({ phase: "research_property_done", message: `[${i + 1}/${stagedPropertyIds.length}] Research OK ✓` }); }

      const newPct = scoringPct + Math.round(((i + 1) / stagedPropertyIds.length) * (95 - scoringPct));
      setAgentPct(newPct);
      if ((i + 1) % 3 === 0 || i + 1 === stagedPropertyIds.length) {
        await postActivity({ id: runId, street, city, phase: "research", progress: newPct, message: `Researcher ${i + 1}/${stagedPropertyIds.length}...`, research_completed: researchCompleted, research_total: stagedPropertyIds.length });
      }
    }

    setAgentStats({ totalBuildings: addresses.length, created: totalCreated, alreadyExists: totalAlreadyExists, researchCompleted, researchFailed, emailDraftsGenerated });
    setAgentPhaseLabel("done");
    setAgentPct(100);
    addEvent({ phase: "agent_done", message: `Færdig! ${researchCompleted} researched, ${emailDraftsGenerated} email-udkast — gå til Staging`, progress: 100 });
    addToast(`Agent færdig: ${researchCompleted} ejendomme researched`, "success");
    await postActivity({ id: runId, street, city, phase: "done", progress: 100, message: `Færdig: ${researchCompleted} researched`, research_completed: researchCompleted, research_total: stagedPropertyIds.length, completed_at: new Date().toISOString() });
    runIdRef.current = null;
    setAgentRunning(false);
    abortRef.current = null;
  }, [agentStreet, agentCity, consumeSSE, addToast, addEvent]);

  const stopStreetAgent = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAgentRunning(false);
    addToast("Gade-agent stoppet", "info");
    if (runIdRef.current) {
      fetch(`/api/agent/activity?id=${runIdRef.current}`, { method: "DELETE" }).catch(() => {});
      runIdRef.current = null;
    }
  }, [addToast]);

  return {
    agentStreet, setAgentStreet,
    agentCity, setAgentCity,
    agentRunning,
    agentEvents, setAgentEvents,
    agentPct,
    agentPhaseLabel,
    agentStats,
    liveActivity, setLiveActivity,
    agentLogRef,
    triggerStreetAgent,
    stopStreetAgent,
  };
}
