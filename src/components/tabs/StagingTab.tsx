"use client";

import dynamic from "next/dynamic";

const StagingQueue = dynamic(() => import("../StagingQueue"), {
  ssr: false,
  loading: () => <div className="animate-pulse rounded-2xl bg-white/[0.03] h-96" />,
});

export function StagingTab() {
  return (
    <div className="animate-fade-in">
      <p className="text-xs text-slate-500 mb-4">Godkend leads → generer mail-udkast → push til HubSpot.</p>
      <StagingQueue />
    </div>
  );
}
