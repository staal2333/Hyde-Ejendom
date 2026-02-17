"use client";

import type { RefObject } from "react";
import type { OOHInitialFrame, TabId } from "../../contexts/DashboardContext";
import ScaffoldingMap from "../ScaffoldingMapDynamic";
import type { MapPermit } from "../ScaffoldingMapDynamic";
import EmptyState from "../ui/EmptyState";

export interface ScaffoldReportPermit {
  address: string;
  score: number;
  scoreReason: string;
  traffic: string;
  trafficNum: number;
  type: string;
  category: string;
  startDate: string;
  endDate: string;
  createdDate: string;
  applicant: string;
  contractor: string;
  lat: number;
  lng: number;
  durationWeeks: number;
  description: string;
  facadeArea: string;
  sagsnr: string;
  contactPerson: string;
  contactEmail: string;
}

export interface ScaffoldReport {
  total: number;
  qualified: number;
  skipped: number;
  sources: { name: string; count: number }[];
  byType: Record<string, number>;
  topPermits: ScaffoldReportPermit[];
  reportText: string;
}

export interface ProgressEvent {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  timestamp: number;
}

export interface ScaffoldingTabProps {
  scaffoldCity: string;
  setScaffoldCity: (v: string) => void;
  setFullCircleOpen: (open: boolean) => void;
  scaffoldRunning: boolean;
  scaffoldEvents: ProgressEvent[];
  scaffoldPct: number;
  scaffoldReport: ScaffoldReport | null;
  scaffoldFilter: Set<string>;
  setScaffoldFilter: React.Dispatch<React.SetStateAction<Set<string>>>;
  scaffoldSort: { col: string; dir: "asc" | "desc" };
  setScaffoldSort: React.Dispatch<React.SetStateAction<{ col: string; dir: "asc" | "desc" }>>;
  scaffoldView: "table" | "map" | "split";
  setScaffoldView: (v: "table" | "map" | "split") => void;
  scaffoldSelectedIdx: number | null;
  setScaffoldSelectedIdx: (v: number | null) => void;
  scaffoldLogRef: RefObject<HTMLDivElement | null>;
  triggerScaffolding: () => void;
  stopScaffolding: () => void;
  addToast: (message: string, type: "success" | "error" | "info") => void;
  fetchData: () => void;
  setOohInitialFrame: (frame: OOHInitialFrame | undefined) => void;
  setActiveTab: (tab: TabId) => void;
  ProgressBar: React.ComponentType<{ pct: number; running: boolean; phase: string }>;
  LogPanel: React.ComponentType<{
    logRef: RefObject<HTMLDivElement | null>;
    events: ProgressEvent[];
    running: boolean;
    maxHeight?: string;
  }>;
}

const CATEGORY_STYLE: Record<string, { gradient: string; bg: string; text: string; dot: string; icon: string }> = {
  Stilladsreklamer: {
    gradient: "from-violet-500 to-purple-600",
    bg: "bg-violet-100",
    text: "text-violet-700",
    dot: "bg-violet-500",
    icon: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5",
  },
  Stilladser: {
    gradient: "from-indigo-500 to-violet-600",
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
    icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15",
  },
};

const ALL_CATS = ["Stilladsreklamer", "Stilladser"];

function daysSince(dateStr: string): number | null {
  if (!dateStr || dateStr === "?") return null;
  const d = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
  return d >= 0 ? d : null;
}

function daysUntil(dateStr: string): number | null {
  if (!dateStr || dateStr === "?") return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export function ScaffoldingTab({
  scaffoldCity,
  setScaffoldCity,
  setFullCircleOpen,
  scaffoldRunning,
  scaffoldEvents,
  scaffoldPct,
  scaffoldReport,
  scaffoldFilter,
  setScaffoldFilter,
  scaffoldSort,
  setScaffoldSort,
  scaffoldView,
  setScaffoldView,
  scaffoldSelectedIdx,
  setScaffoldSelectedIdx,
  scaffoldLogRef,
  triggerScaffolding,
  stopScaffolding,
  addToast,
  fetchData,
  setOohInitialFrame,
  setActiveTab,
  ProgressBar,
  LogPanel,
}: ScaffoldingTabProps) {
  if (!scaffoldReport || scaffoldRunning) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Stilladser &amp; Reklamer</h1>
            <p className="text-xs text-slate-500 mt-0.5">Aktive tilladelser fra kommunale WFS-datakilder</p>
          </div>
          <button
            onClick={() => setFullCircleOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
            </svg>
            Full Circle
          </button>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-[10px] font-semibold text-violet-700">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            Kun aktive tilladelser
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-[10px] font-semibold text-amber-700">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Rapport-visning
          </span>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-5">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="w-48">
              <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">By</label>
              <div className="relative">
                <select
                  value={scaffoldCity}
                  onChange={(e) => setScaffoldCity(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300 appearance-none pr-10"
                >
                  <option value="København">København</option>
                  <option value="Aarhus">Aarhus</option>
                  <option value="Odense">Odense</option>
                  <option value="Aalborg">Aalborg</option>
                </select>
                <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-400 mb-1">
                {scaffoldCity === "København"
                  ? "Kun aktive stilladser + stilladsreklamer fra kbhkort.kk.dk WFS."
                  : scaffoldCity === "Aarhus"
                    ? "Aarhus WebKort WFS + Open Data DK portalen"
                    : "Web-soegning (ingen direkte API for denne by endnu)"}
              </p>
            </div>
            {scaffoldRunning ? (
              <div className="flex gap-2">
                <button
                  disabled
                  className="inline-flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-xl opacity-70 cursor-not-allowed"
                >
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  Scanner...
                </button>
                <button
                  onClick={stopScaffolding}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                  </svg>
                  Stop
                </button>
              </div>
            ) : (
              <button
                onClick={triggerScaffolding}
                className="inline-flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all active:scale-[0.98]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" />
                </svg>
                Start daglig scanning
              </button>
            )}
          </div>
        </div>
        {(scaffoldRunning || scaffoldEvents.length > 0) && (
          <div className="mb-6 animate-fade-in">
            <ProgressBar pct={scaffoldPct} running={scaffoldRunning} phase="" />
            <LogPanel logRef={scaffoldLogRef} events={scaffoldEvents} running={scaffoldRunning} />
          </div>
        )}
        {!scaffoldRunning && scaffoldEvents.length === 0 && !scaffoldReport && (
          <EmptyState
            icon="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15"
            title="Aktive stilladser & reklamer"
            description="Henter kun aktive stillads-tilladelser og stilladsreklamer fra kbhkort.kk.dk. Viser startdato, slutdato og hvor lang tid der er tilbage. Visualiser på kort eller i tabel."
          />
        )}
      </div>
    );
  }

  // Report view (scaffoldReport set, not running)
  const groupTotals: Record<string, number> = {};
  for (const [type, count] of Object.entries(scaffoldReport.byType)) {
    const group = type.split(" / ")[0] || type;
    groupTotals[group] = (groupTotals[group] || 0) + count;
  }
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  const now = Date.now();
  let reportDaily = 0,
    reportWeekly = 0,
    reportMonthly = 0;
  scaffoldReport.topPermits.forEach((p) => {
    const created = p.createdDate && p.createdDate !== "?" ? new Date(p.createdDate).getTime() : 0;
    if (created >= todayStart.getTime()) reportDaily++;
    if (created >= now - 7 * dayMs) reportWeekly++;
    if (created >= now - 30 * dayMs) reportMonthly++;
  });
  const filtered = scaffoldReport.topPermits.filter((p) => scaffoldFilter.has(p.type));
  const sorted = [...filtered].sort((a, b) => {
    const dir = scaffoldSort.dir === "asc" ? 1 : -1;
    switch (scaffoldSort.col) {
      case "address":
        return dir * a.address.localeCompare(b.address, "da");
      case "score":
        return dir * (a.score - b.score);
      case "traffic":
        return dir * (a.trafficNum - b.trafficNum);
      case "type":
        return dir * a.type.localeCompare(b.type, "da");
      case "start":
        return dir * a.startDate.localeCompare(b.startDate);
      case "end":
        return dir * a.endDate.localeCompare(b.endDate);
      case "created":
        return dir * (a.createdDate || "").localeCompare(b.createdDate || "");
      case "duration":
        return dir * (a.durationWeeks - b.durationWeeks);
      case "applicant":
        return dir * (a.applicant || a.contractor || "").localeCompare(b.applicant || b.contractor || "", "da");
      default:
        return dir * (a.score - b.score);
    }
  });
  const mapPermits: MapPermit[] = scaffoldReport.topPermits
    .filter((p) => p.lat && p.lng)
    .map((p) => ({
      address: p.address,
      type: p.type,
      category: p.category,
      score: p.score,
      lat: p.lat,
      lng: p.lng,
      applicant: p.applicant || p.contractor,
      period: `${p.startDate} → ${p.endDate}`,
      createdDate: p.createdDate,
      durationWeeks: p.durationWeeks,
      traffic: p.traffic,
      daysLeft: daysUntil(p.endDate) ?? undefined,
    }));

  const toggleCat = (cat: string) => {
    setScaffoldFilter((prev) => {
      const n = new Set(prev);
      if (n.has(cat)) n.delete(cat);
      else n.add(cat);
      return n;
    });
  };

  const SortHeader = ({ col, label, align }: { col: string; label: string; align?: string }) => (
    <th
      className={`px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none transition-colors text-[10px] ${align === "center" ? "text-center" : "text-left"}`}
      onClick={() => setScaffoldSort((prev) => ({ col, dir: prev.col === col && prev.dir === "desc" ? "asc" : "desc" }))}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {scaffoldSort.col === col && (
          <svg
            className={`w-3 h-3 transition-transform ${scaffoldSort.dir === "asc" ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </span>
    </th>
  );

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Stilladser &amp; Reklamer</h1>
          <p className="text-xs text-slate-500 mt-0.5">Aktive tilladelser fra kommunale WFS-datakilder</p>
        </div>
        <button
          onClick={() => setFullCircleOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
          </svg>
          Full Circle
        </button>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-[10px] font-semibold text-violet-700">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
          Kun aktive tilladelser
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-[10px] font-semibold text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          Rapport-visning
        </span>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-5">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-48">
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">By</label>
            <div className="relative">
              <select
                value={scaffoldCity}
                onChange={(e) => setScaffoldCity(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300 appearance-none pr-10"
              >
                <option value="København">København</option>
                <option value="Aarhus">Aarhus</option>
                <option value="Odense">Odense</option>
                <option value="Aalborg">Aalborg</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-slate-400 mb-1">
              {scaffoldCity === "København"
                ? "Kun aktive stilladser + stilladsreklamer fra kbhkort.kk.dk WFS."
                : scaffoldCity === "Aarhus"
                  ? "Aarhus WebKort WFS + Open Data DK portalen"
                  : "Web-soegning (ingen direkte API for denne by endnu)"}
            </p>
          </div>
          {scaffoldRunning ? (
            <div className="flex gap-2">
              <button
                disabled
                className="inline-flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-xl opacity-70 cursor-not-allowed"
              >
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                Scanner...
              </button>
              <button
                onClick={stopScaffolding}
                className="inline-flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                </svg>
                Stop
              </button>
            </div>
          ) : (
            <button
              onClick={triggerScaffolding}
              className="inline-flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" />
              </svg>
              Start daglig scanning
            </button>
          )}
        </div>
      </div>
      {(scaffoldRunning || scaffoldEvents.length > 0) && (
        <div className="mb-6 animate-fade-in">
          <ProgressBar pct={scaffoldPct} running={scaffoldRunning} phase="" />
          <LogPanel logRef={scaffoldLogRef} events={scaffoldEvents} running={scaffoldRunning} />
        </div>
      )}

      <div className="animate-fade-in space-y-5">
        <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold">Aktive Stilladser &amp; Reklamer</h2>
                <p className="text-sm text-white/70">
                  {scaffoldCity} &mdash; kun aktive tilladelser &mdash;{" "}
                  {new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                const top = sorted.filter((p) => p.score >= 7).slice(0, 15);
                if (top.length === 0) {
                  addToast("Ingen lokationer med score >= 7", "info");
                  return;
                }
                addToast(`Opretter ${top.length} ejendomme i pipeline...`, "info");
                let created = 0,
                  skipped = 0;
                for (const p of top) {
                  try {
                    const res = await fetch("/api/scaffold-to-pipeline", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        address: p.address,
                        city: scaffoldCity,
                        score: p.score,
                        source: "scaffolding",
                        category: p.category,
                        applicant: p.applicant || p.contractor,
                      }),
                    });
                    const data = await res.json();
                    if (data.success) created++;
                    else if (data.reason === "already_exists") skipped++;
                  } catch {
                    /* skip */
                  }
                }
                addToast(`${created} oprettet, ${skipped} fandtes allerede`, created > 0 ? "success" : "info");
                fetchData();
              }}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-xl transition-colors backdrop-blur-sm"
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Send top til pipeline
              </span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {ALL_CATS.map((cat) => {
              const count = groupTotals[cat] || 0;
              const style = CATEGORY_STYLE[cat];
              const isActive = scaffoldFilter.has(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  className={`rounded-xl px-4 py-3 text-left transition-all ${isActive ? "bg-white/20 ring-2 ring-white/40" : "bg-white/5 opacity-60"}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d={style.icon} />
                    </svg>
                    <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">{cat}</span>
                  </div>
                  <div className="text-3xl font-bold">{count}</div>
                  <div className="text-[10px] text-white/50">aktive tilladelser</div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-white/20 flex flex-wrap items-center gap-4">
            <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider">Nye oprettet</span>
            <div className="flex items-center gap-1.5">
              <span className="text-white/70 text-[11px]">I dag:</span>
              <span className="font-bold text-white tabular-nums">{reportDaily}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/70 text-[11px]">Denne uge:</span>
              <span className="font-bold text-white tabular-nums">{reportWeekly}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-white/70 text-[11px]">Denne måned:</span>
              <span className="font-bold text-white tabular-nums">{reportMonthly}</span>
            </div>
            <button
              onClick={() =>
                setScaffoldSort((prev) => ({
                  col: "created",
                  dir: prev.col === "created" && prev.dir === "desc" ? "asc" : "desc",
                }))
              }
              className={`ml-auto px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${scaffoldSort.col === "created" ? "bg-white/25 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
            >
              Nyeste først
            </button>
          </div>
        </div>

        {(() => {
          const highScore = filtered.filter((p) => p.score >= 8).length;
          const midScore = filtered.filter((p) => p.score >= 5 && p.score < 8).length;
          const lowScore = filtered.filter((p) => p.score < 5).length;
          const endingSoon = filtered.filter((p) => {
            const d = daysUntil(p.endDate);
            return d !== null && d > 0 && d <= 30;
          }).length;
          const expired = filtered.filter((p) => {
            const d = daysUntil(p.endDate);
            return d !== null && d <= 0;
          }).length;
          return (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] text-slate-500">Score 8-10:</span>
                <span className="text-xs font-bold text-emerald-700">{highScore}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[10px] text-slate-500">Score 5-7:</span>
                <span className="text-xs font-bold text-blue-700">{midScore}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-[10px] text-slate-500">Score &lt;5:</span>
                <span className="text-xs font-bold text-amber-700">{lowScore}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-[10px] text-slate-500">Slutter snart:</span>
                <span className="text-xs font-bold text-red-600">{endingSoon}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                <div className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-[10px] text-slate-500">Udloebet:</span>
                <span className="text-xs font-bold text-slate-600">{expired}</span>
              </div>
            </div>
          );
        })()}
        <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-4">
          <span>
            Viser <b className="text-slate-700">{filtered.length}</b> af {scaffoldReport.topPermits.length}
          </span>
          <span className="text-slate-300">|</span>
          <span>{mapPermits.filter((p) => scaffoldFilter.has(p.type)).length} med koordinater</span>
          <span className="text-slate-300">|</span>
          <span>Kilde: kbhkort.kk.dk (kun aktive)</span>
          <div className="flex-1" />
          <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
            {(["split", "map", "table"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setScaffoldView(v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${scaffoldView === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {v === "split" ? "Kort + Tabel" : v === "map" ? "Kun kort" : "Kun tabel"}
              </button>
            ))}
          </div>
        </div>

        {scaffoldReport.topPermits.length > 0 && (
          <div className={scaffoldView === "split" ? "grid grid-cols-1 xl:grid-cols-2 gap-4" : ""}>
            {(scaffoldView === "map" || scaffoldView === "split") && (
              <div>
                <ScaffoldingMap
                  permits={mapPermits}
                  activeCategories={scaffoldFilter}
                  selectedIdx={scaffoldSelectedIdx}
                  onSelect={setScaffoldSelectedIdx}
                  height={scaffoldView === "map" ? 600 : 520}
                />
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
                  {ALL_CATS.filter((c) => scaffoldFilter.has(c) && (groupTotals[c] || 0) > 0).map((cat) => (
                    <div key={cat} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <span className={`w-2.5 h-2.5 rounded-full ${CATEGORY_STYLE[cat].dot}`} />
                      {cat} ({groupTotals[cat]})
                    </div>
                  ))}
                  <span className="text-slate-300 mx-1">|</span>
                  {[
                    { label: "Score 8+", color: "bg-emerald-500" },
                    { label: "6-7", color: "bg-blue-500" },
                    { label: "4-5", color: "bg-amber-500" },
                    { label: "<4", color: "bg-red-500" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1 text-[10px] text-slate-400">
                      <span className={`w-2 h-2 rounded-full ${s.color}`} />
                      {s.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(scaffoldView === "table" || scaffoldView === "split") && (
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: scaffoldView === "split" ? 560 : 700 }}>
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-50/95 backdrop-blur-sm">
                        <th className="px-2 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider w-6 text-[10px]">#</th>
                        <SortHeader col="address" label="Adresse" />
                        <SortHeader col="type" label="Type" />
                        <SortHeader col="score" label="Score" align="center" />
                        <SortHeader col="traffic" label="Trafik" align="center" />
                        <SortHeader col="created" label="Oprettet" />
                        <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Tidslinje</th>
                        <SortHeader col="applicant" label="Entrepr." />
                        <th className="px-2 py-2.5 w-16" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sorted.map((p, i) => {
                        const origIdx = scaffoldReport.topPermits.indexOf(p);
                        const isSelected = origIdx === scaffoldSelectedIdx;
                        const style = CATEGORY_STYLE[p.type] || CATEGORY_STYLE["Stilladser"];
                        const dSince = daysSince(p.startDate);
                        const dLeft = daysUntil(p.endDate);
                        const totalDays = (p.durationWeeks || 0) * 7;
                        const elapsed = totalDays > 0 && dSince != null ? Math.min(dSince, totalDays) : 0;
                        const pctElapsed = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;
                        const timelineColor =
                          dLeft != null && dLeft <= 14 ? "bg-red-400" : dLeft != null && dLeft <= 60 ? "bg-amber-400" : "bg-emerald-400";

                        return (
                          <tr
                            key={i}
                            onClick={() => setScaffoldSelectedIdx(isSelected ? null : origIdx)}
                            className={`cursor-pointer transition-colors ${isSelected ? "bg-violet-50/70" : "hover:bg-violet-50/30"}`}
                          >
                            <td className="px-2 py-2.5 text-slate-400 font-mono text-[10px]">{i + 1}</td>
                            <td className="px-3 py-2.5 max-w-[180px]">
                              <div className="font-semibold text-slate-800 truncate text-[11px]">{p.address}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${style.bg} ${style.text}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                {p.type === "Stilladsreklamer" ? "Reklame" : "Stillads"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-[10px] font-bold ${
                                  p.score >= 8 ? "bg-emerald-100 text-emerald-700" : p.score >= 6 ? "bg-blue-100 text-blue-700" : p.score >= 4 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {p.score}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span
                                className={`text-[10px] font-semibold ${p.trafficNum >= 20000 ? "text-emerald-600" : p.trafficNum >= 10000 ? "text-blue-600" : "text-slate-400"}`}
                              >
                                {p.traffic}/d
                              </span>
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="text-[10px] font-mono text-slate-600 whitespace-nowrap">
                                {p.createdDate && p.createdDate !== "?" ? p.createdDate : "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 min-w-[160px]">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">{p.startDate || "?"}</span>
                                <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={`${timelineColor} h-full rounded-full transition-all`}
                                    style={{ width: `${Math.max(pctElapsed, pctElapsed > 0 ? 3 : 0)}%` }}
                                  />
                                </div>
                                <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">{p.endDate || "?"}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                {dSince !== null && <span className="text-[9px] text-slate-400">{dSince}d siden start</span>}
                                {dLeft !== null && (
                                  <span
                                    className={`text-[9px] font-semibold ${dLeft <= 0 ? "text-red-500" : dLeft <= 14 ? "text-red-500" : dLeft <= 60 ? "text-amber-500" : "text-emerald-600"}`}
                                  >
                                    {dLeft > 0 ? `${dLeft}d tilbage` : dLeft === 0 ? "Slutter i dag" : `Udloebet ${Math.abs(dLeft)}d`}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 max-w-[100px] truncate text-[11px]">{p.applicant || p.contractor || "-"}</td>
                            <td className="px-2 py-2.5">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOohInitialFrame({
                                      address: p.address,
                                      city: scaffoldCity,
                                      traffic: p.trafficNum || 0,
                                      type: "scaffolding",
                                    });
                                    setActiveTab("ooh");
                                    addToast(`Frame oprettet fra ${p.address}`, "success");
                                  }}
                                  className="px-2 py-1 text-[9px] font-semibold text-violet-600 bg-violet-50 border border-violet-200/60 rounded-md hover:bg-violet-100 whitespace-nowrap"
                                  title="Opret OOH Frame"
                                >
                                  OOH
                                </button>
                                <svg
                                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isSelected ? "rotate-180" : ""}`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  strokeWidth={2}
                                  stroke="currentColor"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                </svg>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {scaffoldSelectedIdx !== null && (() => {
                  const sel = scaffoldReport.topPermits[scaffoldSelectedIdx];
                  if (!sel) return null;
                  const dSince = daysSince(sel.startDate);
                  const dLeft = daysUntil(sel.endDate);
                  return (
                    <div className="border-t border-slate-200 bg-gradient-to-r from-violet-50/50 to-indigo-50/30 p-5 animate-fade-in">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">{sel.address}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {sel.category} &middot; {sel.type === "Stilladsreklamer" ? "Stilladsreklame" : "Stillads"}
                          </p>
                        </div>
                        <button onClick={() => setScaffoldSelectedIdx(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-white">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-white rounded-lg p-2.5 border border-slate-200/60">
                          <div className="text-[9px] font-semibold text-slate-400 uppercase">Score</div>
                          <div className={`text-lg font-bold ${sel.score >= 8 ? "text-emerald-600" : sel.score >= 6 ? "text-blue-600" : "text-amber-600"}`}>
                            {sel.score}/10
                          </div>
                        </div>
                        <div className="bg-white rounded-lg p-2.5 border border-slate-200/60">
                          <div className="text-[9px] font-semibold text-slate-400 uppercase">Daglig trafik</div>
                          <div className="text-lg font-bold text-slate-800">{sel.traffic}/d</div>
                        </div>
                        <div className="bg-white rounded-lg p-2.5 border border-slate-200/60">
                          <div className="text-[9px] font-semibold text-slate-400 uppercase">Varighed</div>
                          <div className="text-lg font-bold text-slate-800">{sel.durationWeeks || "?"} uger</div>
                        </div>
                        <div className="bg-white rounded-lg p-2.5 border border-slate-200/60">
                          <div className="text-[9px] font-semibold text-slate-400 uppercase">Status</div>
                          <div
                            className={`text-sm font-bold ${dLeft != null && dLeft <= 0 ? "text-red-600" : dLeft != null && dLeft <= 14 ? "text-red-500" : dLeft != null && dLeft <= 60 ? "text-amber-600" : "text-emerald-600"}`}
                          >
                            {dLeft != null && dLeft <= 0 ? "Udloebet" : dLeft != null && dLeft <= 14 ? `${dLeft}d (snart slut)` : dLeft != null ? `${dLeft}d tilbage` : "Ukendt"}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        {sel.createdDate && sel.createdDate !== "?" && (
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                              </svg>
                            </div>
                            <div>
                              <div className="text-[9px] text-slate-400 font-semibold">OPRETTET</div>
                              <div className="font-mono text-[11px]">{sel.createdDate}</div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
                            <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 font-semibold">START</div>
                            <div className="font-mono text-[11px]">
                              {sel.startDate || "?"}
                              {dSince != null ? ` (${dSince}d)` : ""}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${dLeft != null && dLeft <= 14 ? "bg-red-50" : "bg-slate-100"}`}>
                            <svg className={`w-3 h-3 ${dLeft != null && dLeft <= 14 ? "text-red-500" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                            </svg>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 font-semibold">SLUT</div>
                            <div className="font-mono text-[11px]">{sel.endDate || "?"}</div>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(sel.applicant || sel.contractor) && (
                          <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Entrepr. / Ansoeger</div>
                            <div className="text-xs text-slate-700">{sel.applicant || sel.contractor}</div>
                          </div>
                        )}
                        {sel.description && (
                          <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Beskrivelse</div>
                            <div className="text-xs text-slate-600">{sel.description}</div>
                          </div>
                        )}
                        {sel.facadeArea && (
                          <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Facadeareal</div>
                            <div className="text-xs text-slate-700">{sel.facadeArea} m&sup2;</div>
                          </div>
                        )}
                        {sel.sagsnr && (
                          <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Sagsnr.</div>
                            <div className="text-xs font-mono text-slate-700">{sel.sagsnr}</div>
                          </div>
                        )}
                        {sel.scoreReason && (
                          <div className="bg-white rounded-lg p-3 border border-slate-200/60 md:col-span-2">
                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Score-begrundelse</div>
                            <div className="text-xs text-slate-600 leading-relaxed">{sel.scoreReason}</div>
                          </div>
                        )}
                        {(sel.contactPerson || sel.contactEmail) && (
                          <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Kontaktinfo</div>
                            {sel.contactPerson && <div className="text-xs text-slate-700">{sel.contactPerson}</div>}
                            {sel.contactEmail && <div className="text-xs text-brand-600 mt-0.5">{sel.contactEmail}</div>}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200/60">
                        <button
                          onClick={() => {
                            setOohInitialFrame({
                              address: sel.address,
                              city: scaffoldCity,
                              traffic: sel.trafficNum || 0,
                              type: "scaffolding",
                            });
                            setActiveTab("ooh");
                            addToast(`Frame oprettet fra ${sel.address}`, "success");
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159" />
                          </svg>
                          Opret OOH Frame
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetch("/api/scaffold-to-pipeline", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  address: sel.address,
                                  city: scaffoldCity,
                                  score: sel.score,
                                  source: "scaffolding",
                                  category: sel.category,
                                  applicant: sel.applicant || sel.contractor,
                                }),
                              });
                              const data = await res.json();
                              if (data.success) {
                                addToast(`${sel.address} oprettet i pipeline`, "success");
                                fetchData();
                              } else addToast(data.message || "Fejl", "info");
                            } catch {
                              addToast("Fejl ved oprettelse", "error");
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          Send til pipeline
                        </button>
                        {sel.lat && sel.lng && (
                          <a
                            href={`https://www.google.com/maps?q=${sel.lat},${sel.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                            Google Maps
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
