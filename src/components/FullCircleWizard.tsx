"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

interface ScaffoldPermit {
  address: string; score: number; scoreReason: string; traffic: string; trafficNum: number;
  type: string; category: string; startDate: string; endDate: string; createdDate: string;
  applicant: string; contractor: string; lat: number; lng: number; durationWeeks: number;
  description: string; facadeArea: string; sagsnr: string; contactPerson: string; contactEmail: string;
  postalCode: string; city: string;
}

interface StagedProperty {
  id: string; name: string; address: string; city?: string; stage: string;
  outdoorScore?: number; outdoorNotes?: string;
  dailyTraffic?: number; trafficSource?: string;
  ownerCompany?: string; ownerCvr?: string;
  researchSummary?: string; contactPerson?: string;
  contactEmail?: string; contactPhone?: string;
  emailDraftSubject?: string; emailDraftBody?: string;
  hubspotId?: string; source?: string;
  createdAt?: string; updatedAt?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  city?: string;
  onComplete?: () => void;
  onMinimizeToBackground?: () => void;
  onRunningChange?: (running: boolean) => void;
}

type SourceType = "scaffolding" | "discovery" | "manual";

const STEP_LABELS: Record<WizardStep, { title: string; desc: string; icon: string }> = {
  1: { title: "Start", desc: "Find eller importer leads", icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" },
  2: { title: "Vælg", desc: "Vælg de bedste lokationer", icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  3: { title: "Stage & Research", desc: "Stage og undersøg ejendomme", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
  4: { title: "Godkend", desc: "Push til HubSpot CRM", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
  5: { title: "OOH Oplæg", desc: "Opret visuelt forslag", icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" },
  6: { title: "Send", desc: "Email med oplæg til kunde", icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
};

// ── Component ──────────────────────────────────────────────────
export default function FullCircleWizard({ isOpen, onClose, city = "København", onComplete, onMinimizeToBackground, onRunningChange }: Props) {
  const [step, setStep] = useState<WizardStep>(1);
  const [scanCity, setScanCity] = useState(city);
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const minimizedRef = useRef(false);
  const lastStepRef = useRef<WizardStep | null>(null);

  // Step 1: Scan / Import
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanLog, setScanLog] = useState<string[]>([]);
  const [permits, setPermits] = useState<ScaffoldPermit[]>([]);
  const scanAbortRef = useRef<AbortController | null>(null);
  const [discoveryStreet, setDiscoveryStreet] = useState("");
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [discoveryMaxAddresses, setDiscoveryMaxAddresses] = useState(50);
  const [manualAddressesText, setManualAddressesText] = useState("");

  // Step 2: Select
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Step 3: Stage & Research
  const [staging, setStaging] = useState(false);
  const [stageProgress, setStageProgress] = useState(0);
  const [stageLog, setStageLog] = useState<string[]>([]);
  const [stagedProps, setStagedProps] = useState<StagedProperty[]>([]);
  const [researching, setResearching] = useState(false);
  const [researchProgress, setResearchProgress] = useState(0);
  const [researchLog, setResearchLog] = useState<string[]>([]);

  // Step 4: Approve
  const [approving, setApproving] = useState(false);
  const [approveResults, setApproveResults] = useState<{ id: string; success: boolean; hubspotId?: string }[]>([]);

  // Step 5: OOH
  const [creatingOOH, setCreatingOOH] = useState(false);
  const [oohLog, setOohLog] = useState<string[]>([]);
  const [oohProposalId, setOohProposalId] = useState<string | null>(null);
  const [oohPdfUrl, setOohPdfUrl] = useState<string | null>(null);

  // Step 3 fallback
  const [stagingFailed, setStagingFailed] = useState(false);

  // Step 6: Send
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"success" | "error" | null>(null);

  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [scanLog, stageLog, researchLog, oohLog]);

  const isRunning = scanning || discoveryRunning || staging || researching || approving || creatingOOH || sending;

  useEffect(() => {
    onRunningChange?.(isRunning);
  }, [isRunning, onRunningChange]);

  const [showMinimizeConfirm, setShowMinimizeConfirm] = useState(false);

  const handleClose = useCallback(() => {
    if (isRunning) {
      setShowMinimizeConfirm(true);
      return;
    }
    onClose();
  }, [isRunning, onClose]);

  const confirmMinimize = useCallback(() => {
    minimizedRef.current = true;
    onMinimizeToBackground?.();
    setShowMinimizeConfirm(false);
    onClose();
  }, [onMinimizeToBackground, onClose]);

  // Reset wizard only when opening fresh (not when resuming from background)
  useEffect(() => {
    if (!isOpen) return;
    if (minimizedRef.current) {
      minimizedRef.current = false;
      return;
    }
    lastStepRef.current = null;
    setStep(1); setSourceType(null);
    setScanning(false); setScanProgress(0); setScanLog([]);
    setPermits([]); setDiscoveryStreet(""); setDiscoveryRunning(false); setManualAddressesText("");
    setSelected(new Set()); setStagingFailed(false);
    setStaging(false); setStageProgress(0); setStageLog([]);
    setStagedProps([]); setResearching(false); setResearchProgress(0);
    setResearchLog([]); setApproving(false); setApproveResults([]);
    setCreatingOOH(false); setOohLog([]); setOohProposalId(null);
    setOohPdfUrl(null); setSending(false); setSendResult(null);
    setScanCity(city);
  }, [isOpen, city]);

  // ── Step 1: Scan ────────────────────────────────────────────
  const runScan = useCallback(async () => {
    setScanning(true); setScanLog([]); setScanProgress(0); setPermits([]);
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanLog(l => [...l, `Starter scanning af ${scanCity}...`]);

    try {
      const res = await fetch("/api/discover-scaffolding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: scanCity.trim(), minTraffic: 5000, minScore: 3 }),
        signal: controller.signal,
      });

      if (!res.ok) { setScanLog(l => [...l, "Fejl: Kunne ikke starte scan"]); setScanning(false); return; }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) { setScanning(false); return; }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.progress !== undefined) setScanProgress(event.progress);
            if (event.message) setScanLog(l => [...l, event.message]);

            // Capture results
            if (event.result) {
              const r = event.result;
              const rawPermits = (event.permits || r.permits || []) as Record<string, unknown>[];
              const mapped = rawPermits.slice(0, 200).map((p: Record<string, unknown>): ScaffoldPermit => ({
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
                postalCode: String(p.postalCode || ""),
                city: String(p.city || scanCity),
              }));
              setPermits(mapped.sort((a, b) => b.score - a.score));
              setScanLog(l => [...l, `Fandt ${mapped.length} aktive tilladelser`]);
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setScanLog(l => [...l, "Scan stoppet af bruger"]);
      } else {
        setScanLog(l => [...l, `Fejl: ${e instanceof Error ? e.message : "Ukendt"}`]);
      }
    } finally {
      setScanning(false);
      scanAbortRef.current = null;
    }
  }, [scanCity]);

  // Auto-start stillads-scan når bruger vælger Stilladser (så man ikke skal trykke Start scan)
  const prevSourceRef = useRef<SourceType | null>(null);
  useEffect(() => {
    if (sourceType === "scaffolding" && prevSourceRef.current !== "scaffolding" && !scanning) {
      runScan();
    }
    prevSourceRef.current = sourceType;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- kun når man vælger scaffolding
  }, [sourceType]);

  const runDiscovery = useCallback(async () => {
    const street = discoveryStreet.trim();
    if (!street) return;
    setDiscoveryRunning(true); setScanLog([]); setScanProgress(0); setPermits([]);
    setScanLog(l => [...l, `Scanner gade: ${street}, ${scanCity}...`]);
    try {
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          street,
          city: scanCity,
          minScore: 5,
          minTraffic: 5000,
          maxCandidates: discoveryMaxAddresses > 0 ? discoveryMaxAddresses : undefined,
        }),
      });
      if (!res.ok) { setScanLog(l => [...l, "Fejl: Kunne ikke starte discovery"]); setDiscoveryRunning(false); return; }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastCandidates: Array<{ address: string; outdoorScore: number; scoreReason?: string; estimatedDailyTraffic?: number }> = [];
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.message) setScanLog(l => [...l, event.message]);
            if (event.progress != null) setScanProgress(event.progress);
            if (event.candidates?.length) lastCandidates = event.candidates;
          } catch { /* skip */ }
        }
      }
      const mapped: ScaffoldPermit[] = lastCandidates.map((c: { address: string; outdoorScore: number; scoreReason?: string; estimatedDailyTraffic?: number }) => ({
        address: c.address,
        score: c.outdoorScore,
        scoreReason: c.scoreReason || "",
        traffic: c.estimatedDailyTraffic ? `${(c.estimatedDailyTraffic / 1000).toFixed(0)}k/d` : "?",
        trafficNum: c.estimatedDailyTraffic || 0,
        type: "Discovery",
        category: "Discovery",
        startDate: "-",
        endDate: "-",
        createdDate: "-",
        applicant: "",
        contractor: "",
        lat: 0,
        lng: 0,
        durationWeeks: 0,
        description: "",
        facadeArea: "",
        sagsnr: "",
        contactPerson: "",
        contactEmail: "",
        postalCode: "",
        city: scanCity,
      }));
      setPermits(mapped.sort((a, b) => b.score - a.score));
      setScanLog(l => [...l, `✓ Fandt ${mapped.length} kandidater fra Discovery`]);
    } catch (e) {
      setScanLog(l => [...l, `Fejl: ${e instanceof Error ? e.message : "Ukendt"}`]);
    } finally {
      setDiscoveryRunning(false);
    }
  }, [discoveryStreet, scanCity, discoveryMaxAddresses]);

  const importManualAddresses = useCallback(() => {
    const lines = manualAddressesText.split(/\n/).map(s => s.trim()).filter(Boolean);
    const mapped: ScaffoldPermit[] = lines.map((address, i) => ({
      address,
      score: 5,
      scoreReason: "Manuel adresse",
      traffic: "?",
      trafficNum: 0,
      type: "Manuel",
      category: "Manuel",
      startDate: "-",
      endDate: "-",
      createdDate: "-",
      applicant: "",
      contractor: "",
      lat: 0,
      lng: 0,
      durationWeeks: 0,
      description: "",
      facadeArea: "",
      sagsnr: "",
      contactPerson: "",
      contactEmail: "",
      postalCode: "",
      city: scanCity,
    }));
    setPermits(mapped);
    setScanLog([`Importeret ${mapped.length} adresser`]);
  }, [manualAddressesText, scanCity]);

  // Auto-select top-scoring permits when scan completes
  useEffect(() => {
    if (permits.length > 0 && !scanning && !discoveryRunning) {
      const top = new Set<number>();
      permits.forEach((p, i) => { if (p.score >= 7) top.add(i); });
      if (top.size === 0) permits.slice(0, 5).forEach((_, i) => top.add(i));
      setSelected(top);
    }
  }, [permits, scanning, discoveryRunning]);

  // ── Step 3: Stage + Research ────────────────────────────────
  const runStageAndResearch = useCallback(async () => {
    const selectedPermits = Array.from(selected).map(i => permits[i]).filter(Boolean);
    if (selectedPermits.length === 0) return;

    // Phase 1: Try staging via Supabase
    setStaging(true); setStageLog([]); setStageProgress(0); setStagedProps([]); setStagingFailed(false);
    const staged: StagedProperty[] = [];
    let stagingAvailable = true;

    for (let i = 0; i < selectedPermits.length; i++) {
      const p = selectedPermits[i];
      setStageProgress(Math.round(((i + 1) / selectedPermits.length) * 50));
      setStageLog(l => [...l, `Stager ${p.address}...`]);

      try {
        const res = await fetch("/api/staged-properties", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: p.address,
            address: p.address,
            city: scanCity,
            outdoorScore: p.score,
            outdoorNotes: `${p.type} - ${p.category}. ${p.applicant || p.contractor || ""}. Score: ${p.score}/10.`,
            dailyTraffic: p.trafficNum,
            trafficSource: p.type === "Discovery" ? "discovery" : p.type === "Manuel" ? "manual" : "WFS",
            source: p.type === "Discovery" ? "discovery" : p.type === "Manuel" ? "manual" : "scaffolding",
          }),
        });
        const data = await res.json();
        if (data.property) {
          staged.push(data.property);
          setStageLog(l => [...l, `✓ ${p.address} staget`]);
        } else {
          // If we get a table-not-found error, fall back
          const errMsg = data.error || "";
          if (errMsg.includes("staged_properties") || errMsg.includes("PGRST") || res.status === 500) {
            stagingAvailable = false;
            setStageLog(l => [...l, `⚠ Staging database ikke tilgængelig — bruger direkte pipeline`]);
            break;
          }
          setStageLog(l => [...l, `⚠ ${p.address}: ${errMsg || "ukendt fejl"}`]);
        }
      } catch (e) {
        setStageLog(l => [...l, `✗ ${p.address}: ${e instanceof Error ? e.message : "fejl"}`]);
      }
    }

    // Fallback: If staging DB not available, create local "staged" objects from permits
    if (!stagingAvailable || staged.length === 0) {
      setStagingFailed(true);
      setStageLog(l => [...l, "Opretter lokale ejendomme fra valgte tilladelser..."]);
      const localStaged: StagedProperty[] = selectedPermits.map((p, i) => ({
        id: `local_${Date.now()}_${i}`,
        name: p.address,
        address: p.address,
        city: scanCity,
        stage: "new" as const,
        outdoorScore: p.score,
        outdoorNotes: `${p.type} - ${p.category}. ${p.applicant || p.contractor || ""}`,
        dailyTraffic: p.trafficNum,
        trafficSource: p.type === "Discovery" ? "discovery" : p.type === "Manuel" ? "manual" : "WFS",
        source: p.type === "Discovery" ? "discovery" : p.type === "Manuel" ? "manual" : "scaffolding",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      setStagedProps(localStaged);
      setStageLog(l => [...l, `✓ ${localStaged.length} lokale ejendomme oprettet (spring research over)`]);
      setStaging(false);
      return;
    }

    setStagedProps(staged);
    setStaging(false);

    if (staged.length === 0) {
      setStageLog(l => [...l, "Ingen ejendomme staget — prøv igen"]);
      return;
    }

    setStageLog(l => [...l, `${staged.length} ejendomme staget. Starter research...`]);

    // Phase 2: Research each staged property
    setResearching(true); setResearchLog([]); setResearchProgress(0);

    for (let i = 0; i < staged.length; i++) {
      const sp = staged[i];
      setResearchProgress(Math.round(((i) / staged.length) * 100));
      setResearchLog(l => [...l, `Researcher ${sp.name || sp.address}...`]);

      try {
        const res = await fetch("/api/run-research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stagedPropertyId: sp.id }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "ukendt" }));
          setResearchLog(l => [...l, `⚠ Research fejl for ${sp.name}: ${errData.error || res.status}`]);
          continue;
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) continue;

        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6));
              if (event.message) setResearchLog(l => [...l, `  ${event.message}`]);
              if (event.progress !== undefined) {
                setResearchProgress(Math.round((i / staged.length) * 100 + (event.progress / staged.length)));
              }
            } catch { /* skip */ }
          }
        }

        setResearchLog(l => [...l, `✓ Research fuldført for ${sp.name}`]);
      } catch (e) {
        setResearchLog(l => [...l, `✗ Research fejl: ${e instanceof Error ? e.message : "ukendt"}`]);
      }
    }

    setResearchProgress(100);
    setResearching(false);

    // Refresh staged data
    try {
      const freshRes = await fetch("/api/staged-properties");
      const freshData = await freshRes.json();
      if (freshData.properties) {
        const ids = new Set(staged.map(s => s.id));
        const updated = (freshData.properties as StagedProperty[]).filter(p => ids.has(p.id));
        if (updated.length > 0) setStagedProps(updated);
      }
    } catch { /* ignore */ }

    setResearchLog(l => [...l, `Research afsluttet for alle ${staged.length} ejendomme`]);
  }, [selected, permits, scanCity]);

  // Start Stage & Research automatisk når bruger kommer til trin 3 (så research kører før HubSpot)
  useEffect(() => {
    if (step !== 3) {
      lastStepRef.current = step;
      return;
    }
    if (lastStepRef.current === 3) return;
    lastStepRef.current = 3;
    if (selected.size > 0 && stagedProps.length === 0 && !staging && !researching) {
      runStageAndResearch();
    }
  }, [step, selected.size, stagedProps.length, staging, researching, runStageAndResearch]);

  // ── Step 4: Approve ─────────────────────────────────────────
  const runApprove = useCallback(async () => {
    setApproving(true); setApproveResults([]);

    if (stagingFailed) {
      // Fallback: push directly via scaffold-to-pipeline (skips staging table)
      const results: { id: string; success: boolean; hubspotId?: string }[] = [];
      for (const sp of stagedProps) {
        try {
          // Find the original permit to get postalCode
          const originalPermit = permits.find(p => p.address === sp.address);
          const res = await fetch("/api/scaffold-to-pipeline", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
              address: sp.address,
              city: sp.city || scanCity,
              postalCode: originalPermit?.postalCode || "",
              score: sp.outdoorScore,
              source: originalPermit?.type === "Discovery" ? "discovery" : originalPermit?.type === "Manuel" ? "manual" : "scaffolding",
              category: sp.outdoorNotes || "",
              applicant: originalPermit?.applicant || "",
            }),
          });
          const data = await res.json();
          if (data.success) {
            results.push({ id: sp.id, success: true, hubspotId: data.hubspotId });
          } else if (data.reason === "already_exists") {
            results.push({ id: sp.id, success: true, hubspotId: "existing" });
          } else {
            results.push({ id: sp.id, success: false });
          }
        } catch {
          results.push({ id: sp.id, success: false });
        }
      }
      setApproveResults(results);
    } else {
      // Normal path: approve via staging API
      const ids = stagedProps.map(p => p.id);
      try {
        const res = await fetch("/api/staged-properties/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const data = await res.json();
        if (data.results) {
          setApproveResults(data.results);
        }
      } catch { /* ignore */ }
    }

    setApproving(false);
  }, [stagedProps, stagingFailed, scanCity]);

  // ── Step 5: OOH ─────────────────────────────────────────────
  const runOOH = useCallback(async () => {
    if (stagedProps.length === 0) return;
    setCreatingOOH(true); setOohLog([]); setOohProposalId(null); setOohPdfUrl(null);

    const prop = stagedProps[0]; // Use the first (highest scoring)
    setOohLog(l => [...l, `Opretter OOH frame for ${prop.address}...`]);

    // Step 1: Create frame
    let frameId: string | null = null;
    try {
      const res = await fetch("/api/ooh/frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: prop.address,
          locationAddress: prop.address,
          locationCity: prop.city || scanCity,
          frameType: "scaffolding",
          dailyTraffic: prop.dailyTraffic || (prop.outdoorScore ? prop.outdoorScore * 1000 : 10000),
        }),
      });
      const data = await res.json();
      frameId = data.id;
      setOohLog(l => [...l, `✓ Frame oprettet: ${data.name || data.id}`]);
    } catch (e) {
      setOohLog(l => [...l, `✗ Frame fejl: ${e instanceof Error ? e.message : "ukendt"}`]);
      setCreatingOOH(false); return;
    }

    if (!frameId) { setOohLog(l => [...l, "Fejl: Intet frame ID"]); setCreatingOOH(false); return; }

    // Step 2: Check for existing creatives
    setOohLog(l => [...l, "Henter tilgængelige creatives..."]);
    let creativeId: string | null = null;
    try {
      const res = await fetch("/api/ooh/creatives?limit=1");
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        creativeId = data.items[0].id;
        setOohLog(l => [...l, `✓ Bruger creative: ${data.items[0].filename || data.items[0].companyName}`]);
      } else {
        setOohLog(l => [...l, "⚠ Ingen creatives fundet — upload et creative i OOH-fanen først"]);
        setOohLog(l => [...l, "Du kan fortsætte til trin 6 uden OOH-oplæg"]);
        setCreatingOOH(false); return;
      }
    } catch { setOohLog(l => [...l, "⚠ Kunne ikke hente creatives"]); setCreatingOOH(false); return; }

    if (!creativeId) { setCreatingOOH(false); return; }

    // Step 3: Generate PDF directly
    setOohLog(l => [...l, "Genererer PDF-oplæg..."]);
    try {
      const clientCompany = prop.ownerCompany || prop.contactPerson || prop.name || prop.address;
      const clientEmail = prop.contactEmail || "";
      const pdfRes = await fetch("/api/ooh/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameId, creativeId, clientCompany, clientEmail }),
      });

      if (pdfRes.ok) {
        const contentType = pdfRes.headers.get("content-type") || "";
        if (contentType.includes("pdf")) {
          const blob = await pdfRes.blob();
          const url = URL.createObjectURL(blob);
          setOohPdfUrl(url);
          setOohLog(l => [...l, `✓ PDF genereret (${Math.round(blob.size / 1024)} KB)`]);
        } else {
          const err = await pdfRes.json().catch(() => ({ error: "ukendt fejl" }));
          setOohLog(l => [...l, `⚠ PDF fejl: ${err.error}`]);
        }
      } else {
        const err = await pdfRes.json().catch(() => ({ error: "ukendt fejl" }));
        const errMsg = err.error || "ukendt fejl";
        if (errMsg.includes("urlOrPath") || errMsg.includes("no image")) {
          setOohLog(l => [...l, `⚠ Frame har intet billede — upload et frame-billede i OOH-fanen for at generere PDF`]);
        } else {
          setOohLog(l => [...l, `⚠ PDF fejl: ${errMsg}`]);
        }
      }
    } catch (e) {
      setOohLog(l => [...l, `✗ PDF fejl: ${e instanceof Error ? e.message : "ukendt"}`]);
    }

    setCreatingOOH(false);
  }, [stagedProps, scanCity]);

  // ── Step 6: Send Email ──────────────────────────────────────
  const runSend = useCallback(async () => {
    setSending(true); setSendResult(null);

    // Find a valid approved HubSpot property ID (not "existing" placeholder)
    const approved = approveResults.find(r => r.success && r.hubspotId && r.hubspotId !== "existing");
    if (!approved?.hubspotId) {
      setSendResult("error"); setSending(false); return;
    }

    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId: approved.hubspotId }),
      });

      if (res.ok) {
        setSendResult("success");
      } else {
        setSendResult("error");
      }
    } catch { setSendResult("error"); }

    setSending(false);
  }, [approveResults]);

  // ── Computed state ──────────────────────────────────────────
  const canProceed = (): boolean => {
    switch (step) {
      case 1: return permits.length > 0 && !scanning;
      case 2: return selected.size > 0;
      case 3: return stagedProps.length > 0 && !staging && !researching;
      case 4: return approveResults.some(r => r.success) && !approving;
      case 5: return !creatingOOH;
      case 6: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (step < 6) setStep((step + 1) as WizardStep);
  };

  if (!isOpen) return null;

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleClose}>
      <div className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col relative" onClick={e => e.stopPropagation()}>
        {/* Bekræft minimér – processen fortsætter i baggrunden */}
        {showMinimizeConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 max-w-sm mx-4">
              <p className="text-sm font-medium text-slate-800 mb-1">Processen kører stadig</p>
              <p className="text-xs text-slate-600 mb-4">Vil du minimere til baggrunden? Du kan åbne Full Circle igen for at se status.</p>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowMinimizeConfirm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-700 text-sm font-medium hover:bg-slate-50">
                  Bliv
                </button>
                <button type="button" onClick={confirmMinimize} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700">
                  Minimér
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 px-6 py-5 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold">Full Circle Pipeline</h2>
                <p className="text-sm text-white/70">Start fra stilladser, discovery eller egne adresser → Vælg → Research → Godkend → Oplæg → Send</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors" title="Luk">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          {/* Stepper */}
          <div className="flex items-center gap-1">
            {([1, 2, 3, 4, 5, 6] as WizardStep[]).map((s) => {
              const info = STEP_LABELS[s];
              const isCurrent = s === step;
              const isDone = s < step;
              return (
                <div key={s} className="flex-1 flex items-center gap-1">
                  <button
                    onClick={() => s < step && setStep(s)}
                    disabled={s > step}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all w-full ${
                      isCurrent ? "bg-white/25 text-white" :
                      isDone ? "bg-white/10 text-white/80 cursor-pointer hover:bg-white/15" :
                      "text-white/30 cursor-not-allowed"
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold ${
                      isDone ? "bg-emerald-400 text-white" :
                      isCurrent ? "bg-white text-violet-700" :
                      "bg-white/10 text-white/30"
                    }`}>
                      {isDone ? (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      ) : s}
                    </div>
                    <span className="truncate">{info.title}</span>
                  </button>
                  {s < 6 && <div className={`w-2 h-0.5 rounded-full ${s < step ? "bg-emerald-400" : "bg-white/15"}`} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── STEP 1: START (vælg kilde → scan/importer) ── */}
          {step === 1 && (
            <div className="space-y-4 animate-fade-in">
              {sourceType === null ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[1].icon} /></svg>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Hvad vil du starte med?</h3>
                      <p className="text-xs text-slate-500">Pipeline kan starte fra stilladser, discovery, eller egne adresser</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <button type="button" onClick={() => setSourceType("scaffolding")} className="p-5 rounded-xl border-2 border-slate-200 hover:border-violet-400 hover:bg-violet-50/50 text-left transition-all group">
                      <div className="w-10 h-10 rounded-lg bg-cyan-100 text-cyan-600 flex items-center justify-center mb-3 group-hover:bg-cyan-200">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" /></svg>
                      </div>
                      <div className="text-sm font-bold text-slate-800">Stilladser</div>
                      <p className="text-xs text-slate-500 mt-0.5">Scan kommunale stillads-tilladelser og stilladsreklamer</p>
                    </button>
                    <button type="button" onClick={() => setSourceType("discovery")} className="p-5 rounded-xl border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 text-left transition-all group">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:bg-blue-200">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" /></svg>
                      </div>
                      <div className="text-sm font-bold text-slate-800">Discovery</div>
                      <p className="text-xs text-slate-500 mt-0.5">Scan en gade for udendørs potentiale (BBR + AI)</p>
                    </button>
                    <button type="button" onClick={() => setSourceType("manual")} className="p-5 rounded-xl border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/50 text-left transition-all group">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3 group-hover:bg-emerald-200">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 9.75h8.25m-8.25 0V4.5m0 0V3m0 11.25h8.25m-8.25 0v-.75m0 0h-3" /></svg>
                      </div>
                      <div className="text-sm font-bold text-slate-800">Manuelle adresser</div>
                      <p className="text-xs text-slate-500 mt-0.5">Indsæt adresser direkte (én per linje)</p>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-2">
                    <button type="button" onClick={() => { setSourceType(null); setPermits([]); setScanLog([]); setSelected(new Set()); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>
                    </button>
                    <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[1].icon} /></svg>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {sourceType === "scaffolding" && "Scan efter aktive stilladser"}
                        {sourceType === "discovery" && "Discovery: scan en gade"}
                        {sourceType === "manual" && "Indsæt adresser"}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {sourceType === "scaffolding" && "Henter stillads-tilladelser fra kommunale GIS-systemer"}
                        {sourceType === "discovery" && "Henter bygninger på gaden og AI-vurderer udendørs potentiale"}
                        {sourceType === "manual" && "Én adresse per linje — de går videre til vælg → research → pipeline"}
                      </p>
                    </div>
                  </div>

                  {sourceType === "scaffolding" && (
                    <div className="flex items-end gap-3">
                      <div className="w-48">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">By</label>
                        <select value={scanCity} onChange={e => setScanCity(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                          <option value="København">København</option>
                          <option value="Aarhus">Aarhus</option>
                          <option value="Odense">Odense</option>
                          <option value="Aalborg">Aalborg</option>
                        </select>
                      </div>
                      <button onClick={runScan} disabled={scanning} className="px-5 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-2">
                        {scanning ? (
                          <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />Scanner...</>
                        ) : (
                          <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[1].icon} /></svg>Start scan</>
                        )}
                      </button>
                    </div>
                  )}

                  {sourceType === "discovery" && (
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-48">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Gade</label>
                        <input type="text" value={discoveryStreet} onChange={e => setDiscoveryStreet(e.target.value)} placeholder="fx Nørregade" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" />
                      </div>
                      <div className="w-40">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">By</label>
                        <select value={scanCity} onChange={e => setScanCity(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                          <option value="København">København</option>
                          <option value="Aarhus">Aarhus</option>
                          <option value="Odense">Odense</option>
                          <option value="Aalborg">Aalborg</option>
                        </select>
                      </div>
                      <div className="w-36">
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Maks. adresser</label>
                        <select value={discoveryMaxAddresses} onChange={e => setDiscoveryMaxAddresses(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white">
                          <option value={25}>Bedste 25</option>
                          <option value={50}>Bedste 50</option>
                          <option value={100}>Bedste 100</option>
                          <option value={200}>Bedste 200</option>
                          <option value={0}>Alle</option>
                        </select>
                      </div>
                      <button onClick={runDiscovery} disabled={discoveryRunning} className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center gap-2">
                        {discoveryRunning ? (
                          <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />Scanner...</>
                        ) : (
                          <>Start discovery</>
                        )}
                      </button>
                    </div>
                  )}

                  {sourceType === "manual" && (
                    <div className="space-y-3">
                      <textarea value={manualAddressesText} onChange={e => setManualAddressesText(e.target.value)} placeholder="Indsæt adresser, én per linje&#10;fx:&#10;Nørregade 1, 1165 København&#10;Vesterbrogade 42" rows={6} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white font-mono resize-y" />
                      <div className="flex items-center gap-2">
                        <select value={scanCity} onChange={e => setScanCity(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white w-40">
                          <option value="København">København</option>
                          <option value="Aarhus">Aarhus</option>
                          <option value="Odense">Odense</option>
                          <option value="Aalborg">Aalborg</option>
                        </select>
                        <button onClick={importManualAddresses} disabled={!manualAddressesText.trim()} className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">Importer</button>
                      </div>
                    </div>
                  )}

                  {/* Progress / log (shared) */}
                  {(scanning || discoveryRunning || scanLog.length > 0) && (
                    <div className="space-y-2">
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-gradient-to-r from-violet-500 to-purple-600 h-full rounded-full transition-all" style={{ width: `${scanProgress}%` }} />
                      </div>
                      <div className="bg-slate-50 rounded-lg border border-slate-200 p-3 max-h-36 overflow-y-auto text-[11px] font-mono text-slate-600 space-y-0.5">
                        {scanLog.map((msg, i) => <div key={i} className={msg.startsWith("✓") ? "text-emerald-600" : msg.startsWith("✗") ? "text-red-600" : ""}>{msg}</div>)}
                        <div ref={logEndRef} />
                      </div>
                    </div>
                  )}

                  {/* Result summary */}
                  {permits.length > 0 && !scanning && !discoveryRunning && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        <span className="text-sm font-bold text-emerald-800">Klar!</span>
                      </div>
                      <p className="text-xs text-emerald-700">
                        <b>{permits.length}</b> {permits.length === 1 ? "lead" : "leads"}. <b>{permits.filter(p => p.score >= 7).length}</b> med score &ge; 7.
                        Klik <b>Næste</b> for at vælge hvilke der skal i pipeline.
                      </p>
                    </div>
                  )}
                  {permits.length === 0 && !scanning && !discoveryRunning && scanLog.length > 0 && sourceType === "scaffolding" && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>
                        <span className="text-sm font-bold text-amber-800">Ingen stilladser fundet</span>
                      </div>
                      <p className="text-xs text-amber-700">Prøv igen eller vælg en anden by.</p>
                      <button onClick={runScan} className="mt-2 px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-100 rounded-lg hover:bg-amber-200">Prøv igen</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── STEP 2: SELECT ── */}
          {step === 2 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[2].icon} /></svg>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Vælg lokationer ({selected.size} valgt)</h3>
                    <p className="text-xs text-slate-500">Top-scorende er automatisk valgt. Juster efter behov.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { const all = new Set<number>(); permits.forEach((_, i) => all.add(i)); setSelected(all); }}
                    className="px-3 py-1 text-[10px] font-semibold text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200">Vælg alle</button>
                  <button onClick={() => setSelected(new Set())}
                    className="px-3 py-1 text-[10px] font-semibold text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200">Fravælg alle</button>
                  <button onClick={() => { const top = new Set<number>(); permits.forEach((p, i) => { if (p.score >= 7) top.add(i); }); setSelected(top); }}
                    className="px-3 py-1 text-[10px] font-semibold text-violet-600 bg-violet-50 rounded-md hover:bg-violet-100">Kun score &ge; 7</button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left w-8"></th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">Adresse</th>
                        <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">Type</th>
                        <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">Score</th>
                        <th className="px-3 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">Trafik</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">Periode</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase">Entrepr.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {permits.map((p, i) => {
                        const isChecked = selected.has(i);
                        return (
                          <tr key={i} onClick={() => setSelected(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                            className={`cursor-pointer transition-colors ${isChecked ? "bg-violet-50" : "hover:bg-slate-50"}`}>
                            <td className="px-3 py-2">
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${isChecked ? "bg-violet-600 border-violet-600" : "border-slate-300"}`}>
                                {isChecked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-800">{p.address}</div>
                              {p.createdDate && p.createdDate !== "?" && <div className="text-[9px] text-slate-400">Oprettet {p.createdDate}</div>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                                p.type === "Stilladsreklamer" ? "bg-violet-100 text-violet-700" :
                                p.type === "Stilladser" ? "bg-indigo-100 text-indigo-700" :
                                p.type === "Discovery" ? "bg-blue-100 text-blue-700" :
                                p.type === "Manuel" ? "bg-emerald-100 text-emerald-700" :
                                "bg-slate-100 text-slate-700"
                              }`}>
                                {p.type === "Stilladsreklamer" ? "Reklame" : p.type === "Stilladser" ? "Stillads" : p.type}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold ${
                                p.score >= 8 ? "bg-emerald-100 text-emerald-700" :
                                p.score >= 6 ? "bg-blue-100 text-blue-700" :
                                "bg-amber-100 text-amber-700"
                              }`}>{p.score}</span>
                            </td>
                            <td className="px-3 py-2 text-center text-[10px] font-semibold text-slate-500">{p.traffic}/d</td>
                            <td className="px-3 py-2 text-[10px] text-slate-600 whitespace-nowrap">{p.startDate} → {p.endDate}</td>
                            <td className="px-3 py-2 text-[11px] text-slate-600 max-w-[100px] truncate">{p.applicant || p.contractor || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 3: STAGE & RESEARCH ── */}
          {step === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[3].icon} /></svg>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Stage & Research ({selected.size} lokationer)</h3>
                  <p className="text-xs text-slate-500">Stager ejendomme og kører automatisk research på hver</p>
                </div>
              </div>

              {!staging && !researching && stagedProps.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-600 mb-4">Klar til at stage {selected.size} ejendomme og køre research.</p>
                  <button onClick={runStageAndResearch}
                    className="px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all">
                    Start stage & research
                  </button>
                </div>
              )}

              {/* Stage progress */}
              {(staging || stageLog.length > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    {staging && <div className="animate-spin rounded-full h-3 w-3 border-2 border-slate-300 border-t-violet-600" />}
                    <span>Staging {stageProgress < 50 ? "i gang" : "fuldført"}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-violet-500 h-full rounded-full transition-all" style={{ width: `${Math.min(stageProgress, 50)}%` }} />
                  </div>
                  <div className="bg-slate-50 rounded-lg border p-3 max-h-28 overflow-y-auto text-[11px] font-mono text-slate-600 space-y-0.5">
                    {stageLog.map((msg, i) => <div key={i} className={msg.startsWith("✓") ? "text-emerald-600" : msg.startsWith("✗") ? "text-red-600" : msg.startsWith("⚠") ? "text-amber-600" : ""}>{msg}</div>)}
                  </div>
                </div>
              )}

              {/* Research progress */}
              {(researching || researchLog.length > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    {researching && <div className="animate-spin rounded-full h-3 w-3 border-2 border-slate-300 border-t-indigo-600" />}
                    <span>Research {researching ? "i gang" : "fuldført"}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div className="bg-indigo-500 h-full rounded-full transition-all" style={{ width: `${researchProgress}%` }} />
                  </div>
                  <div className="bg-slate-50 rounded-lg border p-3 max-h-36 overflow-y-auto text-[11px] font-mono text-slate-600 space-y-0.5">
                    {researchLog.map((msg, i) => <div key={i} className={msg.startsWith("✓") ? "text-emerald-600" : msg.startsWith("✗") ? "text-red-600" : msg.startsWith("⚠") ? "text-amber-600" : ""}>{msg}</div>)}
                    <div ref={logEndRef} />
                  </div>
                </div>
              )}

              {/* Summary */}
              {stagedProps.length > 0 && !staging && !researching && (
                <div className={`${stagingFailed ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"} border rounded-lg p-4`}>
                  <div className="flex items-center gap-2 mb-1">
                    <svg className={`w-4 h-4 ${stagingFailed ? "text-amber-600" : "text-emerald-600"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    <span className={`text-sm font-bold ${stagingFailed ? "text-amber-800" : "text-emerald-800"}`}>
                      {stagingFailed ? "Lokale ejendomme oprettet (staging DB ikke tilgængelig)" : "Stage & Research fuldført!"}
                    </span>
                  </div>
                  <p className={`text-xs ${stagingFailed ? "text-amber-700" : "text-emerald-700"}`}>
                    <b>{stagedProps.length}</b> ejendomme klar.
                    {stagingFailed ? " Research springes over — klik Næste for at sende til HubSpot pipeline." : " Klik Næste for at godkende."}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: APPROVE ── */}
          {step === 4 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[4].icon} /></svg>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Godkend & Push til HubSpot</h3>
                  <p className="text-xs text-slate-500">Gennemse ejendomme og push til dit CRM</p>
                </div>
              </div>

              {/* Properties to approve */}
              <div className="space-y-2">
                {stagedProps.map((sp) => {
                  const result = approveResults.find(r => r.id === sp.id);
                  return (
                    <div key={sp.id} className={`border rounded-xl p-4 transition-all ${result?.success ? "border-emerald-300 bg-emerald-50" : result ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">{sp.name || sp.address}</div>
                          <div className="text-xs text-slate-500">{sp.city} &middot; Score: {sp.outdoorScore || "?"}</div>
                          {sp.contactEmail && <div className="text-xs text-brand-600 mt-0.5">{sp.contactEmail}</div>}
                        </div>
                        <div>
                          {result?.success && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md text-[10px] font-semibold">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              Pushet
                            </span>
                          )}
                          {result && !result.success && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-md text-[10px] font-semibold">Fejl</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {approveResults.length === 0 && (
                <button onClick={runApprove} disabled={approving}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg disabled:opacity-60 transition-all flex items-center justify-center gap-2">
                  {approving ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />Godkender...</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[4].icon} /></svg>{stagingFailed ? "Opret i HubSpot pipeline" : "Godkend alle & push til HubSpot"}</>
                  )}
                </button>
              )}

              {approveResults.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-xs text-emerald-700">
                    <b>{approveResults.filter(r => r.success).length}</b> af {approveResults.length} pushed til HubSpot.
                    {approveResults.some(r => !r.success) && ` ${approveResults.filter(r => !r.success).length} fejlede.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 5: OOH ── */}
          {step === 5 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[5].icon} /></svg>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">OOH Oplæg</h3>
                  <p className="text-xs text-slate-500">Genererer et visuelt forslag (PDF) for den bedste lokation</p>
                </div>
              </div>

              {!creatingOOH && oohLog.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-600 mb-1">Klar til at oprette OOH-oplæg for:</p>
                  <p className="text-lg font-bold text-slate-800 mb-4">{stagedProps[0]?.name || stagedProps[0]?.address || "—"}</p>
                  <button onClick={runOOH}
                    className="px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all">
                    Generer OOH Oplæg
                  </button>
                  <p className="text-[10px] text-slate-400 mt-3">Du kan også springe dette trin over</p>
                </div>
              )}

              {(creatingOOH || oohLog.length > 0) && (
                <div className="bg-slate-50 rounded-lg border p-3 max-h-48 overflow-y-auto text-[11px] font-mono text-slate-600 space-y-0.5">
                  {oohLog.map((msg, i) => <div key={i} className={msg.startsWith("✓") ? "text-emerald-600" : msg.startsWith("✗") ? "text-red-600" : msg.startsWith("⚠") ? "text-amber-600" : ""}>{msg}</div>)}
                  <div ref={logEndRef} />
                </div>
              )}

              {oohPdfUrl && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      <span className="text-sm font-bold text-emerald-800">PDF klar!</span>
                    </div>
                    <a href={oohPdfUrl} download="OOH-Proposal.pdf"
                      className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-100">
                      Download PDF
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 6: SEND ── */}
          {step === 6 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-3 mb-2">
                <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[6].icon} /></svg>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Send til kunde</h3>
                  <p className="text-xs text-slate-500">Send email med OOH-oplæg til ejendomsejeren</p>
                </div>
              </div>

              {/* Summary of what has been done */}
              <div className="bg-slate-50 rounded-xl border p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase">Pipeline opsummering</h4>
                {[
                  { label: "Scanned lokationer", value: permits.length, color: "text-violet-600" },
                  { label: "Valgt", value: selected.size, color: "text-blue-600" },
                  { label: "Staget & researched", value: stagedProps.length, color: "text-indigo-600" },
                  { label: "Pushed til HubSpot", value: approveResults.filter(r => r.success).length, color: "text-emerald-600" },
                  { label: "OOH PDF genereret", value: oohPdfUrl ? "Ja" : "Nej", color: oohPdfUrl ? "text-emerald-600" : "text-slate-400" },
                ].map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{row.label}</span>
                    <span className={`font-bold ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>

              {!sendResult && (
                <div className="flex items-center gap-3">
                  <button onClick={runSend} disabled={sending || !approveResults.some(r => r.success)}
                    className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl hover:shadow-lg disabled:opacity-60 transition-all flex items-center justify-center gap-2">
                    {sending ? (
                      <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />Sender...</>
                    ) : (
                      <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={STEP_LABELS[6].icon} /></svg>Send email</>
                    )}
                  </button>
                  <button onClick={() => { onComplete?.(); onClose(); }}
                    className="px-5 py-3 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50">
                    Afslut uden at sende
                  </button>
                </div>
              )}

              {sendResult === "success" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-emerald-800 mb-1">Full Circle komplet!</h3>
                  <p className="text-sm text-emerald-700">Email er sat i kø og sendes snarest. Du har gennemført hele pipeline fra scan til udsendelse.</p>
                  <button onClick={() => { onComplete?.(); onClose(); }}
                    className="mt-4 px-6 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700">
                    Luk
                  </button>
                </div>
              )}

              {sendResult === "error" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm text-red-700">Kunne ikke sende email. Tjek at Gmail er konfigureret i indstillinger.</p>
                  <button onClick={() => setSendResult(null)} className="mt-2 text-xs text-red-600 underline">Prøv igen</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-400 flex items-center gap-3">
            <span>Trin {step} af 6</span>
            {isRunning && (
              <button type="button" onClick={handleClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-medium hover:bg-amber-200">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                Kør i baggrunden
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button onClick={() => setStep((step - 1) as WizardStep)}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-white">
                Tilbage
              </button>
            )}
            {step < 6 && (
              <button onClick={handleNext} disabled={!canProceed()}
                className="px-5 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                Næste
              </button>
            )}
            {step === 3 && !staging && !researching && stagedProps.length === 0 && (
              <button onClick={async () => { await runStageAndResearch(); }}
                className="px-5 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg transition-all">
                Start automatisk
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
