"use client";

import dynamic from "next/dynamic";
import { useDashboard } from "@/contexts/DashboardContext";

const StagingQueue = dynamic(() => import("../StagingQueue"), {
  ssr: false,
  loading: () => <div className="animate-pulse rounded-2xl bg-white/[0.03] h-96" />,
});

export function StagingTab() {
  const { setActiveTab, dashboard } = useDashboard();
  const stagingTotal = dashboard?.staging?.total ?? 0;

  return (
    <div className="animate-fade-in">
      <p className="text-xs text-slate-500 mb-4">Godkend leads → generer mail-udkast → push til HubSpot.</p>

      <div className="mb-5 p-4 rounded-2xl border border-slate-200/60 bg-slate-50/50">
        <p className="text-xs text-slate-600">
          <strong>Staging</strong> = leads der endnu ikke er i HubSpot. Her researchér og godkender I dem, derefter push til CRM.
          <br />
          <strong>Ejendomme</strong> = ejendomme der allerede er i HubSpot (fuld pipeline).
        </p>
      </div>

      {stagingTotal === 0 && (
        <div className="mb-5 p-5 rounded-2xl border border-amber-200/60 bg-amber-50/50 text-center">
          <p className="text-sm font-semibold text-amber-900 mb-1">Ingen leads i Staging endnu</p>
          <p className="text-xs text-amber-700 mb-3">Find ejendomme via Discovery eller Gade-Agent, så dukker de op her.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={() => setActiveTab("discover")} className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold">
              Start Discovery
            </button>
            <button onClick={() => setActiveTab("street_agent")} className="px-4 py-2 rounded-xl border border-amber-300 text-amber-800 hover:bg-amber-100 text-xs font-semibold">
              Gade-Agent
            </button>
          </div>
        </div>
      )}

      <StagingQueue />
    </div>
  );
}
