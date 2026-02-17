"use client";

import { formatNumber } from "./utils";

export function ResultStat({ label, value, icon, color = "slate" }: { label: string; value: number; icon: string; color?: string }) {
  const textColor = color === "green" ? "text-green-600" : color === "brand" ? "text-brand-600" : "text-slate-900";
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-extrabold tabular-nums ${textColor}`}>{formatNumber(value)}</div>
    </div>
  );
}
