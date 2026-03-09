"use client";
import { useState, useRef, useCallback } from "react";
import type { ProgressEvent, ScaffoldReport } from "./types";
import { useSSEStream } from "./useSSEStream";

interface UseScaffoldingDeps {
  setError: (msg: string | null) => void;
  fetchData: () => Promise<void>;
  addToast: (msg: string, type: "success" | "error" | "info", detail?: string) => void;
  discoverMinTraffic: number;
}

export function useScaffolding({ setError, fetchData, addToast, discoverMinTraffic }: UseScaffoldingDeps) {
  const [scaffoldCity, setScaffoldCity] = useState("København");
  const [scaffoldRunning, setScaffoldRunning] = useState(false);
  const [scaffoldEvents, setScaffoldEvents] = useState<ProgressEvent[]>([]);
  const [scaffoldPct, setScaffoldPct] = useState(0);
  const [scaffoldReport, setScaffoldReport] = useState<ScaffoldReport | null>(null);
  const [scaffoldFilter, setScaffoldFilter] = useState<Set<string>>(new Set(["Stilladsreklamer", "Stilladser"]));
  const [scaffoldSort, setScaffoldSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "score", dir: "desc" });
  const [scaffoldView, setScaffoldView] = useState<"table" | "map" | "split">("split");
  const [scaffoldSelectedIdx, setScaffoldSelectedIdx] = useState<number | null>(null);
  const scaffoldLogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { consumeSSE } = useSSEStream({ setError, fetchData });

  const noopPhase = useCallback(() => {}, []);

  const triggerScaffolding = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setScaffoldRunning(true);
    setScaffoldEvents([]);
    setScaffoldPct(0);
    setScaffoldReport(null);
    setScaffoldFilter(new Set(["Stilladsreklamer", "Stilladser"]));
    setScaffoldSort({ col: "score", dir: "desc" });
    setScaffoldSelectedIdx(null);

    addToast(`Henter tilladelsesdata for ${scaffoldCity}...`, "info");

    await consumeSSE(
      "/api/discover-scaffolding", "POST",
      { city: scaffoldCity.trim(), minTraffic: discoverMinTraffic, minScore: 5 },
      setScaffoldEvents, setScaffoldPct, noopPhase,
      (ev) => {
        const raw = ev as unknown as Record<string, unknown>;
        if (raw.result) {
          const r = raw.result as Record<string, unknown>;
          const permits = (raw.permits || r.permits || []) as Record<string, unknown>[];
          setScaffoldReport({
            total: (r.totalPermits as number) || 0,
            qualified: (r.afterFilter as number) || 0,
            skipped: (r.skipped as number) || 0,
            sources: (r.sources as { name: string; count: number }[]) || [],
            byType: (r.byType as Record<string, number>) || {},
            topPermits: permits.slice(0, 200).map((p: Record<string, unknown>) => ({
              address: String(p.address || ""),
              score: Number(p.outdoorScore || 0),
              scoreReason: String(p.scoreReason || ""),
              traffic: String(p.estimatedDailyTraffic ? `${Math.round(Number(p.estimatedDailyTraffic) / 1000)}K` : "?"),
              trafficNum: Number(p.estimatedDailyTraffic || 0),
              type: String(p.permitType || ""),
              category: String(p.category || ""),
              startDate: String(p.startDate || "").substring(0, 10),
              endDate: String(p.endDate || "").substring(0, 10),
              createdDate: String(p.createdDate || p.startDate || "").substring(0, 10),
              applicant: String(p.applicant || ""),
              contractor: String(p.contractor || ""),
              lat: Number(p.lat || 0),
              lng: Number(p.lng || 0),
              durationWeeks: Number(p.durationWeeks || 0),
              description: String(p.description || ""),
              facadeArea: String(p.facadeArea || ""),
              sagsnr: String(p.sagsnr || ""),
              contactPerson: String(p.contactPerson || ""),
              contactEmail: String(p.contactEmail || ""),
            })),
            reportText: (raw.detail as string) || "",
          });
        }
      },
      () => { setScaffoldRunning(false); abortRef.current = null; addToast("Stillads-scanning afsluttet!", "success"); },
      controller.signal
    );
  }, [scaffoldCity, discoverMinTraffic, consumeSSE, addToast, noopPhase]);

  const stopScaffolding = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    addToast("Stillads-scanning stoppet", "info");
  }, [addToast]);

  return {
    scaffoldCity, setScaffoldCity,
    scaffoldRunning,
    scaffoldEvents, setScaffoldEvents,
    scaffoldPct,
    scaffoldReport, setScaffoldReport,
    scaffoldFilter, setScaffoldFilter,
    scaffoldSort, setScaffoldSort,
    scaffoldView, setScaffoldView,
    scaffoldSelectedIdx, setScaffoldSelectedIdx,
    scaffoldLogRef,
    triggerScaffolding,
    stopScaffolding,
  };
}
