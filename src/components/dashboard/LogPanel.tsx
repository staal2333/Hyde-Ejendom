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
    <div className="bg-[#0a0f1e] rounded-2xl overflow-hidden border border-white/[0.06] relative log-scanline"
      style={{ boxShadow: "0 8px 32px -4px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.03)" }}
    >
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
          </div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider ml-2">AI Agent Log</span>
        </div>
        <div className="flex items-center gap-3">
          {running && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-gentle-pulse shadow-sm shadow-green-400/40" />
              <span className="text-[10px] text-green-400 font-semibold tracking-wide">LIVE</span>
            </div>
          )}
          <span className="text-[10px] text-slate-600 font-mono tabular-nums">{events.length} events</span>
        </div>
      </div>
      <div ref={logRef} className={`px-5 py-4 ${maxHeight} overflow-y-auto log-scroll space-y-1 font-mono text-[12px] leading-relaxed relative z-10`}>
        {events.map((evt, i) => {
          const lookupPhase = (evt as unknown as Record<string, unknown>).step as string | undefined;
          const icon = getPhaseIcon(evt.phase) !== "▶️"
            ? getPhaseIcon(evt.phase)
            : lookupPhase ? getPhaseIcon(lookupPhase) : "▶️";
          const color = getPhaseColor(evt.phase) !== "text-slate-300"
            ? getPhaseColor(evt.phase)
            : lookupPhase ? getPhaseColor(lookupPhase) : "text-slate-300";
          const time = new Date(evt.timestamp).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

          const isSubStep = evt.phase === "research_step" || evt.phase === "step";
          const opacity = isSubStep ? "opacity-70" : "";
          const isLast = i === events.length - 1;

          return (
            <div key={i} className={`${color} ${opacity} animate-fade-in flex`} style={{ animationDelay: `${Math.min(i * 10, 100)}ms` }}>
              <span className="text-slate-600/60 mr-2 select-none tabular-nums w-[4.5rem] flex-shrink-0 text-right border-r border-white/[0.04] pr-2">{time}</span>
              <span className="mr-1.5 flex-shrink-0">{icon}</span>
              <span className={isLast && running ? "typing-cursor" : ""}>{evt.message}</span>
              {evt.detail && (
                <div className="ml-2 text-slate-500/70 mt-0.5 whitespace-pre-wrap text-[11px] leading-snug">{evt.detail}</div>
              )}
            </div>
          );
        })}
        {running && events.length === 0 && (
          <div className="text-slate-600 mt-2 flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-[11px]">Venter på næste trin...</span>
          </div>
        )}
      </div>
    </div>
  );
}
