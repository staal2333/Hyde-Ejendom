"use client";

import type { RefObject } from "react";
import type { TabId } from "@/contexts/DashboardContext";
import EmptyState from "../ui/EmptyState";

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
  return (
    <div className="animate-fade-in">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Gade-Agent</h1>
        <p className="text-xs text-slate-500 mt-0.5">Auto-pipeline: Scan &rarr; Research &rarr; Email</p>
      </div>

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
              <span className="font-semibold">Kun research (intet push til HubSpot endnu):</span> Agenten finder bygninger, gemmer dem internt i staging,
              og koerer dyb research (OIS/CVR/web). Du godkender i{" "}
              <button onClick={() => setActiveTab("staging")} className="underline font-semibold hover:text-amber-900">Staging</button>
              {" "}og genererer mail-udkast der – push til HubSpot sker først når du trykker &quot;Push til HubSpot&quot;.
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

          {(agentStats.emailDraftsGenerated || 0) > 0 && (
            <div className="bg-green-50 border border-green-200/80 rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-green-900">{agentStats.emailDraftsGenerated} email-udkast klar til godkendelse</h3>
                  <p className="text-sm text-green-700 mt-0.5">Ga til Outreach-fanen for at gennemga og sende mails</p>
                </div>
                <button onClick={() => { setActiveTab("outreach"); fetchOutreachData(); }}
                  className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">
                  Ga til Outreach &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!agentRunning && agentEvents.length === 0 && (
        <EmptyState
          icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
          title="Klar til at koere"
          description="Indtast et vejnavn og vaelg by. Agenten finder alle ejendomme, researcher ejere via OIS/CVR/web, og genererer personlige email-udkast. Du godkender mails inden afsendelse."
        />
      )}
    </div>
  );
}
