"use client";

import dynamic from "next/dynamic";
import { useDashboard } from "@/contexts/DashboardContext";

const StagingQueue = dynamic(() => import("../StagingQueue"), {
  ssr: false,
  loading: () => <div className="animate-pulse rounded-2xl bg-white/[0.03] h-96" />,
});

const STAGES: { key: string; label: string; color: string; dot: string }[] = [
  { key: "new",         label: "Nye",           color: "text-amber-700",   dot: "bg-amber-400" },
  { key: "researching", label: "Researcher",    color: "text-blue-700",    dot: "bg-blue-400" },
  { key: "researched",  label: "Researched",    color: "text-indigo-700",  dot: "bg-indigo-400" },
  { key: "approved",    label: "Godkendt",      color: "text-emerald-700", dot: "bg-emerald-400" },
  { key: "rejected",    label: "Afvist",        color: "text-red-700",     dot: "bg-red-400" },
  { key: "pushed",      label: "I HubSpot",     color: "text-teal-700",    dot: "bg-teal-400" },
];

export function StagingTab() {
  const { setActiveTab, dashboard } = useDashboard();
  const st = dashboard?.staging;
  const stagingTotal = st?.total ?? 0;
  const counts: Record<string, number> = {
    new: st?.new ?? 0,
    researching: st?.researching ?? 0,
    researched: st?.researched ?? 0,
    approved: st?.approved ?? 0,
    rejected: st?.rejected ?? 0,
    pushed: st?.pushed ?? 0,
  };
  const maxCount = Math.max(1, ...Object.values(counts));

  return (
    <div className="animate-fade-in space-y-4">
      {/* Status overview card */}
      <div className="surface-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Staging overblik</h2>
          <span className="text-[10px] text-slate-400 tabular-nums">{stagingTotal} total</span>
        </div>

        {stagingTotal > 0 ? (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
              {STAGES.map((s) => (
                <div key={s.key} className="text-center py-2 px-1 rounded-lg bg-slate-50/80">
                  <p className={`text-lg font-extrabold tabular-nums ${s.color}`}>{counts[s.key]}</p>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <span className="text-[9px] font-medium text-slate-500">{s.label}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              {STAGES.filter((s) => counts[s.key] > 0).map((s) => {
                const pct = Math.round((counts[s.key] / maxCount) * 100);
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot} shrink-0`} />
                    <span className="text-[10px] text-slate-500 w-16">{s.label}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div className={`${s.dot} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.max(pct, 4)}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold tabular-nums ${s.color} w-5 text-right`}>{counts[s.key]}</span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-sm font-semibold text-slate-700 mb-1">Ingen leads i Staging endnu</p>
            <p className="text-[11px] text-slate-400 mb-3">Find ejendomme via Discovery eller Gade-Agent</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={() => setActiveTab("discover")} className="btn-primary text-[11px] !py-1.5">
                Start Discovery
              </button>
              <button onClick={() => setActiveTab("street_agent")} className="btn-ghost text-[11px] !py-1.5">
                Gade-Agent
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200/60">
        <p className="text-[11px] text-slate-500">
          <strong>Staging</strong> = leads der endnu ikke er i HubSpot. Research → godkend → push til CRM.
        </p>
      </div>

      <StagingQueue />
    </div>
  );
}
