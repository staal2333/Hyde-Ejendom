"use client";

import type { RefObject } from "react";
import EmptyState from "../ui/EmptyState";

// Mirror of page types for discovery (avoids importing from app/page)
export interface ScoredCandidateData {
  address: string;
  postalCode: string;
  city: string;
  area?: number;
  floors?: number;
  units?: number;
  usageText?: string;
  buildingYear?: number;
  outdoorScore: number;
  scoreReason: string;
  estimatedDailyTraffic?: number;
  trafficSource?: string;
}

export interface DiscoveryResultData {
  success?: boolean;
  street: string;
  city: string;
  totalAddresses: number;
  afterPreFilter: number;
  afterTrafficFilter: number;
  afterScoring: number;
  created: number;
  skipped: number;
  alreadyExists: number;
  estimatedTraffic?: number;
  trafficSource?: string;
  candidates: ScoredCandidateData[];
  error?: string;
}

export interface ProgressEvent {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  candidates?: ScoredCandidateData[];
  result?: DiscoveryResultData;
  stats?: Record<string, number>;
  timestamp: number;
}

function formatTraffic(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);
}

function formatNumber(n: number): string {
  return n.toLocaleString("da-DK");
}

function ResultStat({
  label,
  value,
  icon,
  color = "slate",
}: {
  label: string;
  value: number;
  icon: string;
  color?: string;
}) {
  const textColor =
    color === "green" ? "text-green-600" : color === "brand" ? "text-brand-600" : "text-slate-900";
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
      <div className="flex items-center gap-2 mb-1">
        <svg
          className="w-3.5 h-3.5 text-slate-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className={`text-xl font-extrabold tabular-nums ${textColor}`}>{formatNumber(value)}</div>
    </div>
  );
}

function TrafficBadge({ traffic, source }: { traffic: number; source?: string }) {
  const isHigh = traffic >= 20000;
  const isMed = traffic >= 10000;
  const color = isHigh
    ? "bg-green-50 text-green-700 border-green-200/60"
    : isMed
      ? "bg-amber-50 text-amber-700 border-amber-200/60"
      : "bg-red-50 text-red-700 border-red-200/60";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${color}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
        />
      </svg>
      ~{formatTraffic(traffic)}/dag
      {source && source !== "estimate" && (
        <span className="opacity-50 text-[9px]">
          ({source === "vejdirektoratet" ? "VD" : "KK"})
        </span>
      )}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 8
      ? "from-green-500 to-emerald-500"
      : score >= 6
        ? "from-brand-500 to-blue-500"
        : score >= 4
          ? "from-amber-500 to-orange-500"
          : "from-red-400 to-rose-400";
  const bgColor =
    score >= 8 ? "bg-green-50" : score >= 6 ? "bg-brand-50" : score >= 4 ? "bg-amber-50" : "bg-red-50";
  return (
    <div className={`score-ring ${bgColor}`}>
      <div
        className={`w-full h-full rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-extrabold text-xs shadow-sm`}
      >
        {score}
      </div>
    </div>
  );
}

function CandidateTable({
  candidates,
  minScore,
}: {
  candidates: ScoredCandidateData[];
  minScore: number;
}) {
  const filtered = candidates.filter((c) => c.outdoorScore >= minScore).slice(0, 40);
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-6 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Adresse
            </th>
            <th className="px-4 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Bygning
            </th>
            <th className="px-4 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Trafik
            </th>
            <th className="px-4 py-3.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Score
            </th>
            <th className="px-4 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              AI Vurdering
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {filtered.map((c, i) => (
            <tr key={i} className="group hover:bg-brand-50/30 transition-colors">
              <td className="px-6 py-4">
                <div className="font-semibold text-sm text-slate-900">{c.address}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {c.postalCode} {c.city}
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-1.5">
                  {c.area && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                      {c.area}m2
                    </span>
                  )}
                  {c.floors && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                      {c.floors} etg.
                    </span>
                  )}
                  {c.usageText && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">
                      {c.usageText}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-4">
                {c.estimatedDailyTraffic ? (
                  <TrafficBadge traffic={c.estimatedDailyTraffic} source={c.trafficSource} />
                ) : (
                  <span className="text-xs text-slate-300">--</span>
                )}
              </td>
              <td className="px-4 py-4">
                <div className="flex justify-center">
                  <ScoreRing score={c.outdoorScore} />
                </div>
              </td>
              <td className="px-4 py-4">
                <p className="text-[12px] text-slate-500 leading-relaxed max-w-xs">{c.scoreReason}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface DiscoverTabProps {
  discoverStreet: string;
  setDiscoverStreet: (v: string) => void;
  discoverCity: string;
  setDiscoverCity: (v: string) => void;
  discoverMinScore: number;
  setDiscoverMinScore: (v: number) => void;
  discoverMinTraffic: number;
  setDiscoverMinTraffic: (v: number) => void;
  discoveryRunning: boolean;
  discoveryResult: DiscoveryResultData | null;
  progressEvents: ProgressEvent[];
  progressPct: number;
  currentPhase: string;
  progressLogRef: RefObject<HTMLDivElement | null>;
  triggerDiscovery: () => void;
  stopDiscovery: () => void;
  ProgressBar: React.ComponentType<{ pct: number; running: boolean; phase: string }>;
  LogPanel: React.ComponentType<{
    logRef: RefObject<HTMLDivElement | null>;
    events: ProgressEvent[];
    running: boolean;
    maxHeight?: string;
  }>;
}

export function DiscoverTab({
  discoverStreet,
  setDiscoverStreet,
  discoverCity,
  setDiscoverCity,
  discoverMinScore,
  setDiscoverMinScore,
  discoverMinTraffic,
  setDiscoverMinTraffic,
  discoveryRunning,
  discoveryResult,
  progressEvents,
  progressPct,
  currentPhase,
  progressLogRef,
  triggerDiscovery,
  stopDiscovery,
  ProgressBar,
  LogPanel,
}: DiscoverTabProps) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Street Discovery</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Scan en vej og find ejendomme med outdoor reklame-potentiale
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-4">
            <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
              Vejnavn
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <svg
                  className="w-4 h-4 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={discoverStreet}
                onChange={(e) => setDiscoverStreet(e.target.value)}
                placeholder="fx Jagtvej, Vesterbrogade..."
                onKeyDown={(e) => e.key === "Enter" && triggerDiscovery()}
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300 placeholder:text-slate-400"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
              By
            </label>
            <input
              type="text"
              value={discoverCity}
              onChange={(e) => setDiscoverCity(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
              Min. score <span className="text-brand-600 font-bold">{discoverMinScore}/10</span>
            </label>
            <div className="relative pt-1">
              <input
                type="range"
                min={1}
                max={10}
                value={discoverMinScore}
                onChange={(e) => setDiscoverMinScore(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-600"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">
              {discoverMinScore <= 3
                ? "Lavt: Inkluderer de fleste bygninger, mange irrelevante"
                : discoverMinScore <= 5
                  ? "Middel: God balance mellem volumen og relevans"
                  : discoverMinScore <= 7
                    ? "Hoejt: Kun bygninger med tydeligt outdoor-potentiale"
                    : "Meget hoejt: Kun de allerbedste lokationer (faa resultater)"}
            </p>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
              Min. trafik{" "}
              <span className="text-brand-600 font-bold">{formatTraffic(discoverMinTraffic)}/dag</span>
            </label>
            <div className="relative pt-1">
              <input
                type="range"
                min={0}
                max={30000}
                step={1000}
                value={discoverMinTraffic}
                onChange={(e) => setDiscoverMinTraffic(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-600"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">
              {discoverMinTraffic === 0
                ? "Ingen filtrering paa trafik — alle gader inkluderes"
                : discoverMinTraffic <= 5000
                  ? "Lav: Sidegader og rolige kvarterer"
                  : discoverMinTraffic <= 15000
                    ? "Middel: Typiske bystroeget og mellembygader"
                    : "Hoejt: Kun hovedveje og stoerre stroeget med mange forbipasserende"}
            </p>
          </div>
          <div className="md:col-span-2 flex gap-2">
            {discoveryRunning ? (
              <>
                <button
                  disabled
                  className="flex-1 inline-flex items-center justify-center gap-2.5 px-5 py-3 gradient-brand text-white text-sm font-semibold rounded-xl opacity-70 cursor-not-allowed"
                >
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                  Scanner...
                </button>
                <button
                  onClick={stopDiscovery}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z"
                    />
                  </svg>
                  Stop
                </button>
              </>
            ) : (
              <button
                onClick={triggerDiscovery}
                disabled={!discoverStreet.trim()}
                className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 gradient-brand text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z"
                  />
                </svg>
                Scan vej
              </button>
            )}
          </div>
        </div>
      </div>

      {(discoveryRunning || progressEvents.length > 0) && (
        <div className="mb-6 animate-fade-in">
          <ProgressBar pct={progressPct} running={discoveryRunning} phase={currentPhase} />
          <LogPanel
            logRef={progressLogRef}
            events={progressEvents}
            running={discoveryRunning}
          />
        </div>
      )}

      {discoveryResult &&
        !discoveryRunning &&
        discoveryResult.candidates?.length > 0 && (
          <div className="animate-fade-in">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <ResultStat
                label="Scannet"
                value={discoveryResult.totalAddresses}
                icon="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
              />
              <ResultStat
                label="Filtreret"
                value={discoveryResult.afterPreFilter}
                icon="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
              />
              <ResultStat
                label="AI Scoret"
                value={discoveryResult.afterScoring}
                icon="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                color="brand"
              />
              <ResultStat
                label="Oprettet"
                value={discoveryResult.created}
                icon="M12 4.5v15m7.5-7.5h-15"
                color="green"
              />
              {discoveryResult.estimatedTraffic && (
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Estimeret trafik
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-xl font-extrabold tabular-nums ${
                        discoveryResult.estimatedTraffic >= 10000 ? "text-green-600" : "text-amber-600"
                      }`}
                    >
                      {formatTraffic(discoveryResult.estimatedTraffic)}
                    </span>
                    <span className="text-xs text-slate-400">/dag</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-brand-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
                      />
                    </svg>
                  </div>
                  <div>
                    <span className="font-bold text-sm text-slate-900">
                      {discoveryResult.street}, {discoveryResult.city}
                    </span>
                    <span className="text-xs text-slate-400 ml-2">
                      {
                        discoveryResult.candidates.filter((c) => c.outdoorScore >= discoverMinScore)
                          .length
                      }{" "}
                      kandidater
                    </span>
                  </div>
                </div>
              </div>
              <CandidateTable
                candidates={discoveryResult.candidates}
                minScore={discoverMinScore}
              />
            </div>
          </div>
        )}

      {!discoveryRunning && !discoveryResult && progressEvents.length === 0 && (
        <EmptyState
          icon="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z"
          title="Klar til at scanne"
          description="Indtast et vejnavn ovenfor for at finde ejendomme med outdoor reklame-potentiale. AI-agenten scanner automatisk alle adresser og vurderer potentialet."
        />
      )}
    </div>
  );
}
