"use client";

export function ProgressBar({ pct, running, phase }: { pct: number; running: boolean; phase: string }) {
  const isError = phase === "error";
  const isDone = pct >= 100;
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {running && <div className="w-2 h-2 rounded-full bg-brand-500 animate-gentle-pulse" />}
          <span className="text-xs font-semibold text-slate-600">
            {running ? "Koerer..." : isDone ? "Afsluttet" : "Stoppet"}
          </span>
        </div>
        <span className="text-xs font-mono font-bold text-slate-400 tabular-nums">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isError ? "bg-gradient-to-r from-red-500 to-rose-500"
            : isDone ? "bg-gradient-to-r from-green-500 to-emerald-500"
            : "bg-gradient-to-r from-brand-500 to-brand-400"
          } ${running && !isDone ? "progress-stripe" : ""}`}
          style={{ width: `${Math.max(pct, running ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}
