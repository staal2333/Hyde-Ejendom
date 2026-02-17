"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─── Types ──────────────────────────────────────────────────

type StagedStage = "new" | "researching" | "researched" | "approved" | "rejected" | "pushed";
type StagedSource = "discovery" | "street_agent" | "manual";

interface StagedProperty {
  id: string;
  name: string;
  address: string;
  postalCode?: string;
  city?: string;
  outdoorScore?: number;
  outdoorNotes?: string;
  dailyTraffic?: number;
  trafficSource?: string;
  ownerCompany?: string;
  ownerCvr?: string;
  researchSummary?: string;
  researchLinks?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  emailDraftSubject?: string;
  emailDraftBody?: string;
  emailDraftNote?: string;
  source: StagedSource;
  stage: StagedStage;
  hubspotId?: string;
  researchStartedAt?: string;
  researchCompletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  detail?: string;
}

interface ResearchProgress {
  propertyId: string;
  phase: string;
  message: string;
  detail?: string;
  progress: number;
}

// ─── Config ─────────────────────────────────────────────────

const STAGE_CONFIG: Record<StagedStage, { label: string; color: string; bg: string; dot: string; icon: string }> = {
  new:         { label: "Ny",            color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",   dot: "bg-amber-400",                     icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  researching: { label: "Researcher...", color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20",     dot: "bg-blue-400 animate-pulse",        icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" },
  researched:  { label: "Researched",    color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/20", dot: "bg-indigo-400",                    icon: "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904" },
  approved:    { label: "Godkendt",      color: "text-green-400",   bg: "bg-green-500/10 border-green-500/20",   dot: "bg-green-400",                     icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  rejected:    { label: "Afvist",        color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",       dot: "bg-red-400",                       icon: "M6 18L18 6M6 6l12 12" },
  pushed:      { label: "I HubSpot",     color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", dot: "bg-emerald-400",                 icon: "M4.5 12.75l6 6 9-13.5" },
};

const SOURCE_LABELS: Record<StagedSource, { label: string; color: string }> = {
  discovery:    { label: "Discovery",    color: "text-blue-400 bg-blue-500/10" },
  street_agent: { label: "Gade-Agent",   color: "text-violet-400 bg-violet-500/10" },
  manual:       { label: "Manuel",       color: "text-slate-400 bg-slate-500/10" },
};

// ─── SVG Icon ───────────────────────────────────────────────

function Ic({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "lige nu";
  if (mins < 60) return `${mins}m siden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}t siden`;
  const days = Math.floor(hours / 24);
  return `${days}d siden`;
}

// ─── Component ──────────────────────────────────────────────

export default function StagingQueue() {
  const [properties, setProperties] = useState<StagedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StagedStage | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [researchProgress, setResearchProgress] = useState<Record<string, ResearchProgress>>({});
  const [batchResearching, setBatchResearching] = useState(false);
  const abortRef = useRef<Record<string, AbortController>>({});
  const [counts, setCounts] = useState<Record<StagedStage, number>>({
    new: 0, researching: 0, researched: 0, approved: 0, rejected: 0, pushed: 0,
  });

  // ── Toast helpers ──
  const addToast = useCallback((message: string, type: Toast["type"], detail?: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type, detail }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Fetch ──
  const fetchProperties = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("stage", filter);
      if (search) params.set("search", search);

      const [propsRes, countsRes] = await Promise.all([
        fetch(`/api/staged-properties?${params}`),
        fetch("/api/staged-properties?counts=true"),
      ]);

      const propsData = await propsRes.json();
      const countsData = await countsRes.json();

      setProperties(propsData.properties || []);
      if (countsData.counts) setCounts(countsData.counts);
    } catch (e) {
      console.error("Failed to fetch staged properties:", e);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  // Stable boolean: is any research in progress? (avoids effect re-runs on every SSE update)
  const hasActiveResearch = Object.keys(researchProgress).length > 0;

  // Smart polling: 15s normally, 5s during research, pause when tab is hidden
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) clearInterval(interval);
      const pollMs = hasActiveResearch ? 5000 : 15000;
      interval = setInterval(fetchProperties, pollMs);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchProperties(); // Refresh immediately on return
        startPolling();
      } else if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchProperties, hasActiveResearch]);

  // ── Selection ──
  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectableIds = useMemo(
    () => properties.filter(p => !["pushed", "rejected", "researching"].includes(p.stage)).map(p => p.id),
    [properties]
  );

  const toggleSelectAll = useCallback(() => {
    if (selected.size === selectableIds.length && selectableIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  }, [selected.size, selectableIds]);

  // ── Research (single) ──
  const handleResearch = useCallback(async (id: string) => {
    const ctrl = new AbortController();
    abortRef.current[id] = ctrl;
    setResearchProgress(prev => ({ ...prev, [id]: { propertyId: id, phase: "start", message: "Starter research...", progress: 0 } }));

    try {
      const res = await fetch("/api/run-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stagedPropertyId: id }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error("Research request failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            setResearchProgress(prev => ({
              ...prev,
              [id]: {
                propertyId: id,
                phase: event.phase || "unknown",
                message: event.message || "",
                detail: event.detail,
                progress: event.progress ?? prev[id]?.progress ?? 0,
              },
            }));
          } catch { /* skip bad JSON */ }
        }
      }

      addToast("Research fuldført", "success");
      await fetchProperties();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        addToast("Research fejlede", "error", (e as Error).message);
      }
    } finally {
      setResearchProgress(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete abortRef.current[id];
    }
  }, [addToast, fetchProperties]);

  // ── Research batch (all "new") ──
  const handleBatchResearch = useCallback(async () => {
    const newProps = properties.filter(p => p.stage === "new");
    if (newProps.length === 0) { addToast("Ingen nye ejendomme at researche", "info"); return; }
    setBatchResearching(true);
    for (const p of newProps) {
      await handleResearch(p.id);
    }
    setBatchResearching(false);
    addToast(`Batch research færdig: ${newProps.length} ejendomme`, "success");
  }, [properties, handleResearch, addToast]);

  // ── Generate draft (researched → approved, internal only; no HubSpot) ──
  const handleGenerateDraft = useCallback(async (ids?: string[]) => {
    const toUse = ids || Array.from(selected);
    const propsToUse = properties.filter(p => toUse.includes(p.id));
    const researchedNoDraft = propsToUse.filter(p => p.stage === "researched" && !p.emailDraftSubject);
    if (researchedNoDraft.length === 0) {
      addToast("Ingen researched ejendomme uden mail-udkast valgt", "info");
      return;
    }
    setGeneratingDraft(true);
    try {
      const res = await fetch("/api/staged-properties/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: researchedNoDraft.map(p => p.id) }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(prev => new Set([...prev].filter(id => !researchedNoDraft.some(p => p.id === id))));
        addToast(`${data.generated} mail-udkast genereret (stadig internt)`, "success");
        await fetchProperties();
      } else {
        addToast("Generering af mail-udkast fejlede", "error", data.error);
      }
    } catch (e) {
      addToast("Generering fejlede", "error", (e as Error).message);
    } finally {
      setGeneratingDraft(false);
    }
  }, [selected, properties, addToast, fetchProperties]);

  // ── Push to HubSpot (approved/researched with draft only) ──
  const handleApprove = useCallback(async (ids?: string[]) => {
    const toApprove = ids || Array.from(selected);
    const propsToApprove = properties.filter(p => toApprove.includes(p.id));
    const canPush = propsToApprove.filter(p => p.stage === "approved" || (p.stage === "researched" && p.emailDraftSubject));
    if (canPush.length === 0) {
      addToast("Vælg ejendomme med mail-udkast (godkend først & generer mail)", "info");
      return;
    }
    setApproving(true);
    try {
      const res = await fetch("/api/staged-properties/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: canPush.map(p => p.id) }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(new Set());
        addToast(`${data.approved} ejendom${data.approved !== 1 ? "me" : ""} pushed til HubSpot`, "success");
        await fetchProperties();
      } else {
        addToast("Push til HubSpot fejlede", "error", data.error);
      }
    } catch (e) {
      addToast("Push fejlede", "error", (e as Error).message);
    } finally {
      setApproving(false);
    }
  }, [selected, properties, addToast, fetchProperties]);

  // ── Reject ──
  const handleReject = useCallback(async (ids?: string[]) => {
    const toReject = ids || Array.from(selected);
    if (toReject.length === 0) return;
    setRejecting(true);
    try {
      const res = await fetch("/api/staged-properties/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: toReject }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(new Set());
        addToast(`${data.rejected} ejendom${data.rejected !== 1 ? "me" : ""} afvist`, "info");
        await fetchProperties();
      }
    } catch (e) {
      addToast("Afvisning fejlede", "error", (e as Error).message);
    } finally {
      setRejecting(false);
    }
  }, [selected, addToast, fetchProperties]);

  // ── Delete ──
  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`/api/staged-properties?id=${id}`, { method: "DELETE" });
      addToast("Ejendom slettet", "info");
      await fetchProperties();
    } catch (e) {
      addToast("Sletning fejlede", "error", (e as Error).message);
    }
  }, [addToast, fetchProperties]);

  const activeCount = counts.new + counts.researching + counts.researched;

  // ─── RENDER ───────────────────────────────────────────────

  return (
    <div className="space-y-5 relative">
      {/* ── Toast overlay ── */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-slide-down rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm max-w-sm ${
              t.type === "success" ? "bg-green-950/90 border-green-500/30 text-green-300"
              : t.type === "error" ? "bg-red-950/90 border-red-500/30 text-red-300"
              : "bg-slate-900/90 border-slate-500/30 text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <Ic d={
                t.type === "success" ? "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                : t.type === "error" ? "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                : "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              } className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{t.message}</p>
                {t.detail && <p className="text-xs opacity-70 mt-0.5">{t.detail}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {(Object.entries(STAGE_CONFIG) as [StagedStage, typeof STAGE_CONFIG[StagedStage]][]).map(([stage, cfg]) => (
          <button
            key={stage}
            onClick={() => setFilter(filter === stage ? "all" : stage)}
            className={`group relative rounded-xl border p-3 text-left transition-all duration-200 ${
              filter === stage
                ? `${cfg.bg} ring-1 ring-white/10`
                : "bg-[#161923] border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className={`w-2 h-2 rounded-full ${cfg.dot} transition-transform group-hover:scale-125`} />
              <span className={`text-[11px] font-medium tracking-wide ${filter === stage ? cfg.color : "text-slate-500"}`}>
                {cfg.label}
              </span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${filter === stage ? "text-white" : "text-slate-300"}`}>
              {counts[stage]}
            </div>
          </button>
        ))}
      </div>

      {/* ── Action Banner ── */}
      {activeCount > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <div className="flex items-center gap-3 bg-gradient-to-r from-amber-500/[0.07] via-orange-500/[0.05] to-transparent border-amber-500/15 px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center flex-shrink-0">
              <Ic d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-200">
                {activeCount} ejendom{activeCount !== 1 ? "me" : ""} afventer handling
              </p>
              <p className="text-[11px] text-amber-300/50 mt-0.5">
                {counts.new > 0 && `${counts.new} nye`}
                {counts.researching > 0 && ` · ${counts.researching} researcher`}
                {counts.researched > 0 && ` · ${counts.researched} klar til godkendelse & mail-udkast`}
                {counts.approved > 0 && ` · ${counts.approved} klar til push til HubSpot`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {counts.new > 0 && (
                <button
                  onClick={handleBatchResearch}
                  disabled={batchResearching}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-300 text-xs font-medium hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                >
                  <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-3.5 h-3.5" />
                  {batchResearching ? "Researcher..." : `Research alle nye (${counts.new})`}
                </button>
              )}
              {counts.researched > 0 && (
                <button
                  onClick={() => setFilter("researched")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-medium hover:bg-indigo-500/30 transition-colors"
                >
                  <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-3.5 h-3.5" />
                  Godkend & generer mail ({counts.researched})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Ic d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Søg adresse, ejer, by..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-[#161923] border border-white/[0.06] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/20 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
              <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-1">
          {(["all", "new", "researched", "approved", "pushed", "rejected"] as const).map(f => {
            const count = f === "all" ? properties.length : counts[f];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  filter === f
                    ? "bg-brand-500/15 text-brand-300 border border-brand-500/25 shadow-sm"
                    : "bg-white/[0.03] text-slate-500 border border-transparent hover:bg-white/[0.05] hover:text-slate-400"
                }`}
              >
                {f === "all" ? "Alle" : STAGE_CONFIG[f].label}
                {count > 0 && (
                  <span className={`text-[10px] px-1 py-0.5 rounded-full ${
                    filter === f ? "bg-brand-500/20 text-brand-300" : "bg-white/[0.06] text-slate-500"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (() => {
          const selectedProps = properties.filter(p => selected.has(p.id));
          const researchedNoDraft = selectedProps.filter(p => p.stage === "researched" && !p.emailDraftSubject);
          const canPushHubSpot = selectedProps.filter(p => p.stage === "approved" || (p.stage === "researched" && p.emailDraftSubject));
          return (
            <div className="flex items-center gap-2 ml-auto animate-fade-in">
              <span className="text-xs text-slate-500 tabular-nums">{selected.size} valgt</span>
              {researchedNoDraft.length > 0 && (
                <button
                  onClick={() => handleGenerateDraft()}
                  disabled={generatingDraft}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-3.5 h-3.5" />
                  {generatingDraft ? "Genererer..." : `Godkend & generer mail (${researchedNoDraft.length})`}
                </button>
              )}
              {canPushHubSpot.length > 0 && (
                <button
                  onClick={() => handleApprove()}
                  disabled={approving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-500 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3.5 h-3.5" />
                  {approving ? "Pusher..." : `Push til HubSpot (${canPushHubSpot.length})`}
                </button>
              )}
              <button
                onClick={() => handleReject()}
                disabled={rejecting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/70 text-white text-xs font-semibold hover:bg-red-500 transition-colors disabled:opacity-50 shadow-sm"
              >
                <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
                {rejecting ? "Afviser..." : "Afvis"}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-colors"
                title="Ryd valg"
              >
                <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-xl border border-white/[0.04] bg-[#161923] overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 h-10 rounded-lg bg-white/[0.04] animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-48 rounded bg-white/[0.04] animate-pulse" />
                  <div className="h-2.5 w-32 rounded bg-white/[0.03] animate-pulse" />
                </div>
                <div className="h-3 w-16 rounded bg-white/[0.03] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : properties.length === 0 ? (
        /* ── Empty State ── */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.06] flex items-center justify-center mb-5">
            <Ic d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" className="w-9 h-9 text-slate-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-300 mb-2">
            {filter !== "all" ? `Ingen ejendomme med status "${STAGE_CONFIG[filter].label}"` : "Staging er tom"}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
            {filter !== "all"
              ? "Prøv at skifte filter eller brug Discovery til at finde nye ejendomme."
              : "Brug Discovery eller Gade-Agent til at finde ejendomme. De lander her for gennemgang inden de pushes til HubSpot."
            }
          </p>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="mt-4 px-4 py-2 rounded-lg bg-white/[0.06] text-slate-300 text-sm font-medium hover:bg-white/[0.08] transition-colors">
              Vis alle
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Select all header */}
          {selectableIds.length > 0 && (
            <div className="flex items-center justify-between px-1 py-1">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all ${
                  selected.size === selectableIds.length && selectableIds.length > 0
                    ? "bg-brand-500 border-brand-500 shadow-sm shadow-brand-500/30"
                    : selected.size > 0
                      ? "bg-brand-500/30 border-brand-500/50"
                      : "border-slate-600 hover:border-slate-400"
                }`}>
                  {selected.size > 0 && <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3 text-white" />}
                </div>
                {selected.size > 0 ? `${selected.size} af ${selectableIds.length} valgt` : `Vælg alle (${selectableIds.length})`}
              </button>
              <span className="text-[10px] text-slate-600">{properties.length} vises</span>
            </div>
          )}

          {/* ── Property Cards ── */}
          {properties.map(prop => {
            const cfg = STAGE_CONFIG[prop.stage];
            const src = SOURCE_LABELS[prop.source];
            const isExpanded = expandedId === prop.id;
            const isSelectable = !["pushed", "rejected", "researching"].includes(prop.stage);
            const completeness = getCompleteness(prop);
            const rp = researchProgress[prop.id];
            const isResearching = !!rp || prop.stage === "researching";

            return (
              <div
                key={prop.id}
                className={`group rounded-xl border transition-all duration-200 ${
                  isResearching
                    ? "bg-blue-500/[0.03] border-blue-500/20"
                    : selected.has(prop.id)
                      ? "bg-brand-500/[0.04] border-brand-500/25"
                      : "bg-[#161923] border-white/[0.05] hover:border-white/[0.09]"
                }`}
              >
                {/* Research progress bar */}
                {rp && (
                  <div className="h-1 bg-blue-500/10 overflow-hidden rounded-t-xl">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 ease-out"
                      style={{ width: `${rp.progress}%` }}
                    />
                  </div>
                )}

                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Checkbox */}
                  {isSelectable ? (
                    <button onClick={() => toggleSelect(prop.id)} className="flex-shrink-0">
                      <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all ${
                        selected.has(prop.id)
                          ? "bg-brand-500 border-brand-500 shadow-sm shadow-brand-500/30"
                          : "border-slate-600 hover:border-slate-400"
                      }`}>
                        {selected.has(prop.id) && <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  ) : (
                    <div className="w-4 flex-shrink-0" />
                  )}

                  {/* Score badge */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm border ${
                    (prop.outdoorScore || 0) >= 8
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : (prop.outdoorScore || 0) >= 6
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-white/[0.03] text-slate-500 border-white/[0.06]"
                  }`}>
                    {prop.outdoorScore != null ? prop.outdoorScore.toFixed(0) : "–"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">{prop.address}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${cfg.bg} ${cfg.color} border`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-medium ${src.color}`}>
                        {src.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                      <span>{prop.city || "Ukendt by"}{prop.postalCode ? `, ${prop.postalCode}` : ""}</span>
                      {prop.ownerCompany && (
                        <span className="text-slate-400 truncate max-w-[160px]">· {prop.ownerCompany}</span>
                      )}
                      {prop.contactEmail && (
                        <span className="text-brand-400 truncate max-w-[160px]">· {prop.contactEmail}</span>
                      )}
                    </div>
                    {/* Research progress message */}
                    {rp && (
                      <p className="text-[11px] text-blue-400/80 mt-1 truncate animate-pulse">
                        {rp.message}
                      </p>
                    )}
                  </div>

                  {/* Completeness */}
                  <div className="flex-shrink-0 w-14 hidden sm:block">
                    <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          completeness >= 80 ? "bg-gradient-to-r from-green-500 to-emerald-400"
                          : completeness >= 50 ? "bg-gradient-to-r from-amber-500 to-orange-400"
                          : "bg-slate-600"
                        }`}
                        style={{ width: `${completeness}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-600 mt-0.5 block text-center tabular-nums">{completeness}%</span>
                  </div>

                  {/* Quick actions (visible on hover / always on small) */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {prop.stage === "new" && !rp && (
                      <button
                        onClick={() => handleResearch(prop.id)}
                        className="p-1.5 rounded-lg text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 transition-all opacity-0 group-hover:opacity-100"
                        title="Kør research"
                      >
                        <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-4 h-4" />
                      </button>
                    )}
                    {prop.stage === "researched" && !prop.emailDraftSubject && !rp && (
                      <button
                        onClick={() => handleGenerateDraft([prop.id])}
                        disabled={generatingDraft}
                        className="p-1.5 rounded-lg text-indigo-400/60 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all opacity-0 group-hover:opacity-100"
                        title="Godkend & generer mail-udkast"
                      >
                        <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-4 h-4" />
                      </button>
                    )}
                    {(prop.stage === "approved" || (prop.stage === "researched" && prop.emailDraftSubject)) && !rp && (
                      <button
                        onClick={() => handleApprove([prop.id])}
                        disabled={approving}
                        className="p-1.5 rounded-lg text-green-400/60 hover:text-green-400 hover:bg-green-500/10 transition-all opacity-0 group-hover:opacity-100"
                        title="Push til HubSpot"
                      >
                        <Ic d="M4.5 12.75l6 6 9-13.5" className="w-4 h-4" />
                      </button>
                    )}
                    <span className="text-[10px] text-slate-600 tabular-nums w-14 text-right hidden lg:block">
                      {timeAgo(prop.createdAt)}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : prop.id)}
                      className={`p-1.5 rounded-lg transition-all ${
                        isExpanded ? "text-slate-300 bg-white/[0.06]" : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"
                      }`}
                    >
                      <Ic d={isExpanded ? "M4.5 15.75l7.5-7.5 7.5 7.5" : "M19.5 8.25l-7.5 7.5-7.5-7.5"} className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-white/[0.04] animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Left column: Research data */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Ic d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-3.5 h-3.5 text-slate-500" />
                          <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Research data</h4>
                        </div>

                        {!prop.ownerCompany && !prop.researchSummary && !prop.contactPerson ? (
                          <div className="rounded-lg bg-white/[0.02] border border-dashed border-white/[0.06] p-4 text-center">
                            <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                            <p className="text-xs text-slate-500 mb-2">Ingen research data endnu</p>
                            {prop.stage === "new" && (
                              <button
                                onClick={() => handleResearch(prop.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-medium hover:bg-blue-500/25 transition-colors"
                              >
                                <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-3.5 h-3.5" />
                                Kør research nu
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            {prop.ownerCompany && (
                              <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Ejer</span>
                                <p className="text-sm text-white mt-0.5">{prop.ownerCompany} {prop.ownerCvr && <span className="text-slate-500 text-xs">(CVR: {prop.ownerCvr})</span>}</p>
                              </div>
                            )}

                            {prop.contactPerson && (
                              <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3">
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Kontaktperson</span>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="w-7 h-7 rounded-full bg-brand-500/15 flex items-center justify-center text-brand-400 text-xs font-bold">
                                    {(prop.contactPerson || "?")[0]?.toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm text-white">{prop.contactPerson}</p>
                                    <div className="flex gap-2 text-[11px]">
                                      {prop.contactEmail && <span className="text-brand-400">{prop.contactEmail}</span>}
                                      {prop.contactPhone && <span className="text-slate-400">{prop.contactPhone}</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {prop.researchSummary && (
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Resume</span>
                                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap mt-0.5">{prop.researchSummary}</p>
                              </div>
                            )}

                            {prop.dailyTraffic != null && prop.dailyTraffic > 0 && (
                              <div className="flex items-center gap-2 text-xs">
                                <Ic d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" className="w-4 h-4 text-slate-500" />
                                <span className="text-slate-400">Daglig trafik:</span>
                                <span className="text-white font-medium">~{prop.dailyTraffic.toLocaleString("da-DK")}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Right column: Email draft + actions */}
                      <div className="space-y-3">
                        {prop.emailDraftSubject ? (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-3.5 h-3.5 text-slate-500" />
                              <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Email-udkast</h4>
                            </div>
                            <div className="rounded-lg bg-white/[0.025] border border-white/[0.05] p-3.5">
                              <p className="text-xs font-semibold text-white mb-1.5">{prop.emailDraftSubject}</p>
                              <p className="text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed line-clamp-8">{prop.emailDraftBody}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-white/[0.02] border border-dashed border-white/[0.06] p-4 text-center">
                            <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                            <p className="text-xs text-slate-500">Intet email-udkast endnu</p>
                            <p className="text-[10px] text-slate-600 mt-0.5">Kør research for at generere et udkast</p>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2 pt-3 border-t border-white/[0.04]">
                          {prop.stage === "new" && !rp && (
                            <button
                              onClick={() => handleResearch(prop.id)}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600/80 text-white text-xs font-semibold hover:bg-blue-500 transition-colors shadow-sm"
                            >
                              <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-3.5 h-3.5" />
                              Kør research
                            </button>
                          )}
                          {prop.stage === "researched" && !prop.emailDraftSubject && !rp && (
                            <button
                              onClick={() => handleGenerateDraft([prop.id])}
                              disabled={generatingDraft}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50 shadow-sm"
                            >
                              <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-3.5 h-3.5" />
                              Godkend & generer mail
                            </button>
                          )}
                          {(prop.stage === "approved" || (prop.stage === "researched" && prop.emailDraftSubject)) && !rp && (
                            <button
                              onClick={() => handleApprove([prop.id])}
                              disabled={approving}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-500 transition-colors disabled:opacity-50 shadow-sm"
                            >
                              <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3.5 h-3.5" />
                              Push til HubSpot
                            </button>
                          )}
                          {prop.stage !== "pushed" && prop.stage !== "rejected" && !rp && (
                            <button
                              onClick={() => handleReject([prop.id])}
                              disabled={rejecting}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-500/15 text-red-400 text-xs font-medium hover:bg-red-500/25 transition-colors disabled:opacity-50"
                            >
                              <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
                              Afvis
                            </button>
                          )}
                          {prop.stage === "pushed" && prop.hubspotId && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                              <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3.5 h-3.5" />
                              I HubSpot · ID: {prop.hubspotId}
                            </span>
                          )}
                          <button
                            onClick={() => handleDelete(prop.id)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.03] text-slate-500 text-xs hover:text-red-400 hover:bg-red-500/10 transition-colors ml-auto"
                          >
                            <Ic d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-3.5 h-3.5" />
                            Slet
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────

function getCompleteness(prop: StagedProperty): number {
  let score = 0;
  const total = 7;
  if (prop.address) score++;
  if (prop.city) score++;
  if (prop.outdoorScore != null) score++;
  if (prop.ownerCompany) score++;
  if (prop.contactPerson) score++;
  if (prop.contactEmail) score++;
  if (prop.emailDraftSubject) score++;
  return Math.round((score / total) * 100);
}
