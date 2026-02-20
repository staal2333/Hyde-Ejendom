"use client";

import type { RefObject } from "react";
import EmptyState from "../ui/EmptyState";

export interface ProgressEvent {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  timestamp: number;
}

export interface ResearchTabProps {
  researchRunning: string | null;
  researchEvents: ProgressEvent[];
  researchPct: number;
  researchLogRef: RefObject<HTMLDivElement | null>;
  triggerResearch: (propertyId?: string) => void;
  stopResearch: () => void;
  currentResearchProperty: { name?: string; address?: string; postalCode?: string; city?: string } | null | undefined;
  researchSummary: { oisOwner?: string | null; totalSearches: number; contactsFound: number; emailsFound: number };
  ProgressBar: React.ComponentType<{ pct: number; running: boolean; phase: string }>;
  LogPanel: React.ComponentType<{
    logRef: RefObject<HTMLDivElement | null>;
    events: ProgressEvent[];
    running: boolean;
    maxHeight?: string;
  }>;
}

export function ResearchTab({
  researchRunning,
  researchEvents,
  researchPct,
  researchLogRef,
  triggerResearch,
  stopResearch,
  currentResearchProperty,
  researchSummary,
  ProgressBar,
  LogPanel,
}: ResearchTabProps) {
  return (
    <div className="animate-fade-in">
      <div className="mb-5 flex items-center justify-between">
        <p className="text-xs text-slate-500">Kør research for ventende ejendomme. Se status i realtid.</p>
        {researchRunning && (
            <button onClick={stopResearch}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
              Stop
            </button>
        )}
      </div>

      {researchEvents.length === 0 && !researchRunning && (
        <div className="mb-6">
          <EmptyState
            icon="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3"
            title="Ingen aktiv research"
            description="Start research for at se AI-agenten arbejde i realtid -- websogning, kontaktfinding, og email-generering."
            action={{ label: "Koer research for alle ventende", onClick: () => triggerResearch() }}
          />
        </div>
      )}

      {(researchRunning || researchEvents.length > 0) && (
        <div className="space-y-4">
          {(currentResearchProperty || researchSummary.oisOwner) && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 animate-fade-in">
              {currentResearchProperty && (
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Ejendom</div>
                  <div className="text-sm font-bold text-slate-900">{currentResearchProperty.name || currentResearchProperty.address}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{currentResearchProperty.postalCode} {currentResearchProperty.city}</div>
                </div>
              )}
              {researchSummary.oisOwner && (
                <div className="bg-white rounded-2xl border border-green-200/60 shadow-[var(--card-shadow)] p-4">
                  <div className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-1">OIS Ejer</div>
                  <div className="text-sm font-bold text-slate-900">{researchSummary.oisOwner}</div>
                  <div className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    Officiel kilde
                  </div>
                </div>
              )}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Soegninger</div>
                <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{researchSummary.totalSearches}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">websogninger gennemfoert</div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Fundet</div>
                <div className="flex items-baseline gap-3">
                  <div>
                    <span className="text-2xl font-extrabold text-slate-900 tabular-nums">{researchSummary.contactsFound}</span>
                    <span className="text-[10px] text-slate-400 ml-1">kontakter</span>
                  </div>
                  <div>
                    <span className="text-2xl font-extrabold text-brand-600 tabular-nums">{researchSummary.emailsFound}</span>
                    <span className="text-[10px] text-slate-400 ml-1">emails</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <ProgressBar pct={researchPct} running={!!researchRunning} phase="" />
          <LogPanel logRef={researchLogRef} events={researchEvents} running={!!researchRunning} maxHeight="max-h-[550px]" />
        </div>
      )}
    </div>
  );
}
