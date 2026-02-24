"use client";

import { useState, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { TabId } from "@/contexts/DashboardContext";
import EmptyState from "../ui/EmptyState";

const AGENT_RUNS_KEY = "ejendom_agent_runs";
const MAX_RUNS = 10;

interface AgentRunEntry {
  street: string;
  city: string;
  date: string;
  created?: number;
  researchCompleted?: number;
}

export interface ProgressEvent {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  timestamp: number;
}

export interface AgentStats {
  totalBuildings?: number;
  created?: number;
  researchCompleted?: number;
  researchFailed?: number;
  emailDraftsGenerated?: number;
}

export interface StreetAgentTabProps {
  agentStreet: string;
  setAgentStreet: (v: string) => void;
  agentCity: string;
  setAgentCity: (v: string) => void;
  agentRunning: boolean;
  agentEvents: ProgressEvent[];
  agentPct: number;
  agentPhaseLabel: string;
  agentStats: AgentStats | null;
  agentLogRef: RefObject<HTMLDivElement | null>;
  triggerStreetAgent: () => void;
  stopStreetAgent: () => void;
  setActiveTab: (tab: TabId) => void;
  fetchOutreachData: () => Promise<void>;
  ProgressBar: React.ComponentType<{ pct: number; running: boolean; phase: string }>;
  LogPanel: React.ComponentType<{
    logRef: RefObject<HTMLDivElement | null>;
    events: ProgressEvent[];
    running: boolean;
    maxHeight?: string;
  }>;
  ResultStat: React.ComponentType<{ label: string; value: number; icon: string; color?: string }>;
}

export function StreetAgentTab({
  agentStreet,
  setAgentStreet,
  agentCity,
  setAgentCity,
  agentRunning,
  agentEvents,
  agentPct,
  agentPhaseLabel,
  agentStats,
  agentLogRef,
  triggerStreetAgent,
  stopStreetAgent,
  setActiveTab,
  fetchOutreachData,
  ProgressBar,
  LogPanel,
  ResultStat,
}: StreetAgentTabProps) {
  const [lastRuns, setLastRuns] = useState<AgentRunEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(AGENT_RUNS_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as AgentRunEntry[];
      return Array.isArray(arr) ? arr.slice(0, MAX_RUNS) : [];
    } catch {
      return [];
    }
  });
  const prevRunningRef = useRef(agentRunning);

  useEffect(() => {
    if (prevRunningRef.current && !agentRunning && agentStats && agentStreet.trim()) {
      const entry: AgentRunEntry = {
        street: agentStreet.trim(),
        city: agentCity,
        date: new Date().toISOString(),
        created: agentStats.created,
        researchCompleted: agentStats.researchCompleted,
      };
      setLastRuns((prev) => {
        const next = [entry, ...prev.filter((r) => !(r.street === entry.street && r.city === entry.city && r.date === entry.date))].slice(0, MAX_RUNS);
        try {
          localStorage.setItem(AGENT_RUNS_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    }
    prevRunningRef.current = agentRunning;
  }, [agentRunning, agentStats, agentStreet, agentCity]);

  return (
    <div className="animate-fade-in">
      <p className="text-xs text-slate-500 mb-4">Scan → Research → Email-udkast. Kør for én vej.</p>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Vejnavn</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
              </div>
              <input type="text" value={agentStreet} onChange={(e) => setAgentStreet(e.target.value)}
                placeholder="fx Vesterbrogade, Noerrebrogade, Amagerbrogade..."
                onKeyDown={(e) => e.key === "Enter" && triggerStreetAgent()}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300 placeholder:text-slate-400" />
            </div>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">By</label>
            <select value={agentCity} onChange={(e) => setAgentCity(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300">
              <option value="København">Koebenhavn</option>
              <option value="Aarhus">Aarhus</option>
              <option value="Odense">Odense</option>
              <option value="Aalborg">Aalborg</option>
              <option value="Frederiksberg">Frederiksberg</option>
            </select>
          </div>
          <div className="md:col-span-4 flex gap-2">
            {agentRunning ? (
              <>
                <button disabled className="flex-1 inline-flex items-center justify-center gap-2.5 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold rounded-xl opacity-70 cursor-not-allowed">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />Agent koerer...
                </button>
                <button onClick={stopStreetAgent} className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                  Stop
                </button>
              </>
            ) : (
              <button onClick={triggerStreetAgent} disabled={!agentStreet.trim()}
                className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-amber-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                Start Agent
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200/60">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-xs text-amber-800 leading-relaxed">
              <span className="font-semibold">Auto-pipeline:</span> Agenten finder bygninger, researcher ejere (OIS/CVR/web) og genererer email-udkast automatisk.
              Ejendomme lander i{" "}
              <button onClick={() => setActiveTab("staging")} className="underline font-semibold hover:text-amber-900">Staging</button>
              {" "}hvor du godkender og sender med ét klik.
            </p>
          </div>
        </div>
      </div>

      {(agentRunning || agentEvents.length > 0) && (
        <div className="mb-6 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            {["discovery", "research", "done"].map((phase, i) => {
              const isActive = agentPhaseLabel === phase || (phase === "done" && agentStats);
              const isDone = (phase === "discovery" && (agentPhaseLabel === "research" || !!agentStats)) ||
                             (phase === "research" && !!agentStats) ||
                             (phase === "done" && !!agentStats && !agentRunning);
              return (
                <div key={phase} className="flex items-center gap-2">
                  {i > 0 && <div className={`w-8 h-0.5 ${isDone ? "bg-green-400" : isActive ? "bg-amber-400" : "bg-slate-200"}`} />}
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                    isDone ? "bg-green-100 text-green-700" :
                    isActive ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-400"
                  }`}>
                    {isDone && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                    {isActive && !isDone && <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                    {phase === "discovery" ? "Find bygninger" : phase === "research" ? "Research ejere" : "Faerdig"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-property research counter */}
          {agentRunning && agentPhaseLabel === "research" && (() => {
            const lastEvent = agentEvents.filter(e => (e as unknown as Record<string, unknown>).researchIndex).at(-1);
            const idx = (lastEvent as unknown as Record<string, unknown> | undefined)?.researchIndex as number | undefined;
            const total = (lastEvent as unknown as Record<string, unknown> | undefined)?.researchTotal as number | undefined;
            if (!idx || !total) return null;
            return (
              <div className="mb-3 flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-200/60">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-300 border-t-blue-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-blue-800">
                      Researcher ejendom {idx} af {total}
                    </span>
                    <span className="text-xs font-mono text-blue-600 tabular-nums">{idx}/{total}</span>
                  </div>
                  <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((idx / total) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })()}

          <ProgressBar pct={agentPct} running={agentRunning} phase={agentPhaseLabel} />
          <LogPanel logRef={agentLogRef} events={agentEvents} running={agentRunning} maxHeight="max-h-[500px]" />
        </div>
      )}

      {agentStats && !agentRunning && (
        <div className="animate-fade-in">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <ResultStat label="Bygninger fundet" value={agentStats.totalBuildings || 0} icon="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />
            <ResultStat label="Nye ejendomme" value={agentStats.created || 0} icon="M12 4.5v15m7.5-7.5h-15" color="green" />
            <ResultStat label="Research OK" value={agentStats.researchCompleted || 0} icon="M4.5 12.75l6 6 9-13.5" color="brand" />
            <ResultStat label="Email-udkast" value={agentStats.emailDraftsGenerated || 0} icon="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" color="green" />
            <ResultStat label="Fejlet" value={agentStats.researchFailed || 0} icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" color={agentStats.researchFailed ? "red" : undefined} />
          </div>

          {(agentStats.researchCompleted || 0) > 0 && (
            <div className="bg-green-50 border border-green-200/80 rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-green-900">
                    {agentStats.researchCompleted} ejendomme researched
                    {(agentStats.emailDraftsGenerated || 0) > 0 && ` · ${agentStats.emailDraftsGenerated} email-udkast`}
                  </h3>
                  <p className="text-sm text-green-700 mt-0.5">Gå til Staging for at godkende og sende</p>
                </div>
                <button onClick={() => setActiveTab("staging")}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">
                  Gå til Staging &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {lastRuns.length > 0 && !agentRunning && (
        <div className="mb-6 bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Seneste kørsler</h3>
          <ul className="space-y-2">
            {lastRuns.slice(0, 5).map((run, i) => (
              <li key={`${run.street}-${run.date}-${i}`} className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl bg-slate-50/80">
                <div>
                  <span className="font-semibold text-sm text-slate-800">{run.street}</span>
                  <span className="text-xs text-slate-500 ml-2">{run.city}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  {run.created != null && <span>{run.created} oprettet</span>}
                  <span>{new Date(run.date).toLocaleDateString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!agentRunning && agentEvents.length === 0 && !agentStats && (
        <EmptyState
          icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          title="Klar til at koere"
          description="Indtast et vejnavn og vaelg by. Agenten finder alle ejendomme, researcher ejere via OIS/CVR/web, og genererer personlige email-udkast. Du godkender mails inden afsendelse."
        />
      )}
    </div>
  );
}
