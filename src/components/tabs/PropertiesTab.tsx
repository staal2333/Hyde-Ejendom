"use client";

import type { PropertyItem, TabId, DashboardData, OOHInitialFrame, OOHInitialClient } from "@/contexts/DashboardContext";
import EmptyState from "../ui/EmptyState";

type SortKey = "name" | "status" | "score" | "owner";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Adresse" },
  { key: "status", label: "Status" },
  { key: "score", label: "Score" },
  { key: "owner", label: "Ejer" },
];

export interface PropertiesTabProps {
  properties: PropertyItem[];
  dashboard: DashboardData | null;
  filteredProperties: PropertyItem[];
  statusFilter: string | null;
  setStatusFilter: (v: string | null) => void;
  propertyFilter: string;
  setPropertyFilter: (v: string) => void;
  cityFilter: string;
  setCityFilter: (v: string) => void;
  scoreFilter: [number, number];
  setScoreFilter: (v: [number, number]) => void;
  sortBy: SortKey;
  setSortBy: (v: SortKey) => void;
  sortAsc: boolean;
  setSortAsc: (v: boolean) => void;
  expandedProperty: string | null;
  setExpandedProperty: (v: string | null) => void;
  quickAddAddress: string;
  setQuickAddAddress: (v: string) => void;
  quickAddLoading: boolean;
  quickAddProperty: (withResearch: boolean) => void;
  researchRunning: string | null;
  triggerResearch: (propertyId?: string) => void;
  stopResearch: () => void;
  submitFeedback: (propertyId: string, feedback: string, note?: string) => void;
  sendSingleEmail: (propertyId: string) => void;
  addToast: (message: string, type: "success" | "error" | "info", detail?: string) => void;
  fetchData: () => Promise<void>;
  setActiveTab: (tab: TabId) => void;
  setOohInitialFrame: (v: OOHInitialFrame | undefined) => void;
  setOohInitialClient: (v: OOHInitialClient | undefined) => void;
  availableCities: string[];
  PipelineStat: React.ComponentType<{ label: string; value: number; color: string; icon: string; active?: boolean; onClick?: () => void }>;
  PropertyCard: React.ComponentType<{
    property: PropertyItem;
    expanded: boolean;
    onToggle: () => void;
    onResearch: () => void;
    researchRunning: boolean;
    onFeedback?: (feedback: string) => void;
    onCreateProposal?: () => void;
  }>;
}

export function PropertiesTab({
  properties,
  dashboard,
  filteredProperties,
  statusFilter,
  setStatusFilter,
  propertyFilter,
  setPropertyFilter,
  cityFilter,
  setCityFilter,
  scoreFilter,
  setScoreFilter,
  sortBy,
  setSortBy,
  sortAsc,
  setSortAsc,
  expandedProperty,
  setExpandedProperty,
  quickAddAddress,
  setQuickAddAddress,
  quickAddLoading,
  quickAddProperty,
  researchRunning,
  triggerResearch,
  stopResearch,
  submitFeedback,
  sendSingleEmail,
  addToast,
  fetchData,
  setActiveTab,
  setOohInitialFrame,
  setOohInitialClient,
  availableCities,
  PipelineStat,
  PropertyCard,
}: PropertiesTabProps) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Ejendomme</h1>
          <p className="text-xs text-slate-500 mt-0.5">{properties.length} ejendomme i pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          {researchRunning ? (
            <button onClick={stopResearch}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl shadow-sm transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
              Stop research
            </button>
          ) : (
            <button onClick={() => triggerResearch()} disabled={!!researchRunning}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg>
              Koer al research
            </button>
          )}
        </div>
      </div>

      <div className="mb-5 bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <input type="text" value={quickAddAddress} onChange={(e) => setQuickAddAddress(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && quickAddAddress.trim()) quickAddProperty(true); }}
              placeholder="Tilfoej ejendom — fx Jagtvej 43, 2200 Koebenhavn"
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200/60 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300 placeholder:text-slate-400"
              disabled={quickAddLoading} />
          </div>
          <button onClick={() => quickAddProperty(false)} disabled={!quickAddAddress.trim() || quickAddLoading}
            className="px-3.5 py-2.5 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap transition-colors">
            {quickAddLoading ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-300/30 border-t-slate-600" /> : "Tilfoej"}
          </button>
          <button onClick={() => quickAddProperty(true)} disabled={!quickAddAddress.trim() || quickAddLoading}
            className="px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/15 disabled:opacity-40 whitespace-nowrap transition-all">
            {quickAddLoading ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white" /> : "+ Research"}
          </button>
        </div>
      </div>

      {properties.filter(p => p.outreachStatus === "KLAR_TIL_UDSENDELSE").length > 0 && (
        <div className="mb-6 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-800">Godkendelseskoe</h3>
                <p className="text-[10px] text-emerald-600">{properties.filter(p => p.outreachStatus === "KLAR_TIL_UDSENDELSE").length} ejendomme klar til udsendelse</p>
              </div>
            </div>
            <button onClick={() => setStatusFilter(statusFilter === "ready" ? null : "ready")}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition-colors">
              {statusFilter === "ready" ? "Vis alle" : "Vis kun klar"}
            </button>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {properties.filter(p => p.outreachStatus === "KLAR_TIL_UDSENDELSE").slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between bg-white/70 rounded-xl px-4 py-2.5 border border-emerald-100">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{p.name || p.address}</div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                    {p.primaryContact?.email && <span className="text-emerald-600">{p.primaryContact.email}</span>}
                    {p.emailDraftSubject && <span className="truncate max-w-[200px]">Emne: {p.emailDraftSubject}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 ml-3">
                  <button onClick={() => { setExpandedProperty(p.id); setStatusFilter("ready"); }}
                    className="px-2.5 py-1 text-[10px] font-semibold text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">
                    Se udkast
                  </button>
                  <button onClick={() => sendSingleEmail(p.id)}
                    className="px-2.5 py-1 text-[10px] font-semibold text-white bg-emerald-500 rounded-md hover:bg-emerald-600">
                    Send
                  </button>
                  <button onClick={() => submitFeedback(p.id, "irrelevant")}
                    className="px-2 py-1 text-[10px] font-semibold text-red-500 border border-red-200 rounded-md hover:bg-red-50">
                    Afvis
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
        <PipelineStat label="Total" value={dashboard?.totalProperties || 0} color="slate" icon="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21" active={!statusFilter} onClick={() => setStatusFilter(null)} />
        <PipelineStat label="Afventer" value={dashboard?.pendingResearch || 0} color="amber" icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" active={statusFilter === "pending"} onClick={() => setStatusFilter(statusFilter === "pending" ? null : "pending")} />
        <PipelineStat label="Researching" value={dashboard?.researchInProgress || 0} color="blue" icon="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" active={statusFilter === "researching"} onClick={() => setStatusFilter(statusFilter === "researching" ? null : "researching")} />
        <PipelineStat label="Researched" value={dashboard?.researchDone || 0} color="indigo" icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" active={statusFilter === "researched"} onClick={() => setStatusFilter(statusFilter === "researched" ? null : "researched")} />
        <PipelineStat label="Klar" value={dashboard?.readyToSend || 0} color="green" icon="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" active={statusFilter === "ready"} onClick={() => setStatusFilter(statusFilter === "ready" ? null : "ready")} />
        <PipelineStat label="Sendt" value={dashboard?.mailsSent || 0} color="emerald" icon="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859" active={statusFilter === "sent"} onClick={() => setStatusFilter(statusFilter === "sent" ? null : "sent")} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[140px] max-w-[200px]">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" />
              </svg>
            </div>
            <input type="text" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}
              placeholder="Soeg adresse/ejer..."
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:border-indigo-300 placeholder:text-slate-400" />
          </div>

          {availableCities.length > 1 && (
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:border-indigo-300">
              <option value="">Alle byer</option>
              {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">Score</span>
            <select value={scoreFilter[0]} onChange={(e) => setScoreFilter([parseInt(e.target.value), scoreFilter[1]])}
              className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white w-12 text-center">
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-[10px] text-slate-400">-</span>
            <select value={scoreFilter[1]} onChange={(e) => setScoreFilter([scoreFilter[0], parseInt(e.target.value)])}
              className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white w-12 text-center">
              {[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {(statusFilter || cityFilter || scoreFilter[0] > 0 || scoreFilter[1] < 10) && (
            <button onClick={() => { setStatusFilter(null); setCityFilter(""); setScoreFilter([0, 10]); setPropertyFilter(""); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-brand-50 text-brand-700 text-[10px] font-semibold rounded-lg border border-brand-200/60 hover:bg-brand-100">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              Nulstil
            </button>
          )}

          <div className="flex-1" />

          <span className="text-[10px] text-slate-400">{filteredProperties.length}/{properties.length}</span>

          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            {SORT_OPTIONS.map((opt) => (
              <button key={opt.key}
                onClick={() => { if (sortBy === opt.key) setSortAsc(!sortAsc); else { setSortBy(opt.key); setSortAsc(true); } }}
                className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                  sortBy === opt.key ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}>
                {opt.label}
                {sortBy === opt.key && (
                  <svg className={`inline w-3 h-3 ml-0.5 transition-transform ${sortAsc ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredProperties.length === 0 ? (
          <EmptyState
            icon="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75"
            title={propertyFilter || statusFilter ? "Ingen resultater" : "Ingen ejendomme endnu"}
            description={propertyFilter || statusFilter ? "Proev et andet sogeord eller nulstil filteret" : "Brug Discovery-fanen til at scanne veje og finde ejendomme."}
          />
        ) : (
          filteredProperties.map((p) => (
            <PropertyCard
              key={p.id}
              property={p}
              expanded={expandedProperty === p.id}
              onToggle={() => setExpandedProperty(expandedProperty === p.id ? null : p.id)}
              onResearch={() => triggerResearch(p.id)}
              researchRunning={researchRunning === p.id}
              onFeedback={(fb) => submitFeedback(p.id, fb)}
              onCreateProposal={() => {
                setOohInitialClient({
                  company: p.ownerCompanyName || p.name || "",
                  contactName: p.primaryContact?.name ?? p.contactPerson ?? "",
                  email: p.primaryContact?.email ?? p.contactEmail ?? "",
                });
                setOohInitialFrame({
                  address: p.address || p.name || "",
                  city: p.city || "",
                  traffic: 0,
                  type: "facade" as const,
                });
                setActiveTab("ooh");
                addToast(`OOH Proposal startet for ${p.name || p.address} – frame oprettes automatisk`, "success");
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
