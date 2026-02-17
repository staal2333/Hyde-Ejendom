"use client";

import type { RefObject } from "react";
import { getPhaseIcon, getPhaseColor } from "./phaseLogUtils";

export interface ProgressEvent {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  timestamp: number;
}

export function LogPanel({ logRef, events, running, maxHeight = "max-h-80" }: {
  logRef: RefObject<HTMLDivElement | null>;
  events: ProgressEvent[];
  running: boolean;
  maxHeight?: string;
}) {
  return (
    <div className="bg-[#0c1222] rounded-2xl overflow-hidden shadow-xl border border-white/[0.04]">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider ml-2">AI Agent Log</span>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-gentle-pulse" />
              <span className="text-[10px] text-green-400 font-medium">LIVE</span>
            </div>
          )}
          <span className="text-[10px] text-slate-600 font-mono">{events.length} events</span>
        </div>
      </div>
      <div ref={logRef} className={`px-5 py-4 ${maxHeight} overflow-y-auto log-scroll space-y-1 font-mono text-[12px] leading-relaxed`}>
        {events.map((evt, i) => {
          const icon = getPhaseIcon(evt.phase);
          const color = getPhaseColor(evt.phase);
          const time = new Date(evt.timestamp).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

          return (
            <div key={i} className={`${color} animate-fade-in`} style={{ animationDelay: `${Math.min(i * 10, 100)}ms` }}>
              <span className="text-slate-600 mr-2 select-none tabular-nums">{time}</span>
              <span className="mr-1.5">{icon}</span>
              <span>{evt.message}</span>
              {evt.detail && (
                <div className="ml-[7rem] text-slate-500/80 mt-0.5 whitespace-pre-wrap text-[11px]">{evt.detail}</div>
              )}
            </div>
          );
        })}
        {running && (
          <div className="text-slate-600 mt-2 flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-[11px]">Venter paa naeste trin...</span>
          </div>
        )}
      </div>
    </div>
  );
}
