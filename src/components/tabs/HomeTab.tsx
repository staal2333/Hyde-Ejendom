"use client";

import { useState, useEffect } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import type { TabId } from "@/contexts/DashboardContext";
import { getStatusConfig } from "@/lib/statusConfig";

interface OOHProposalPreview {
  id: string;
  clientCompany: string;
  mockupUrl?: string;
  mockupBuffer?: string;
  status?: string;
  createdAt: string;
}

export interface HomeTabProps {
  discoveryRunning: boolean;
  scaffoldRunning: boolean;
  researchRunning: boolean;
  agentRunning: boolean;
  fullCircleOpen: boolean;
  setFullCircleOpen: (v: boolean) => void;
  setStatusFilter: (v: string | null) => void;
  setExpandedProperty: (v: string | null) => void;
  scaffoldCity?: string;
}

export function HomeTab({
  discoveryRunning,
  scaffoldRunning,
  researchRunning,
  agentRunning,
  setFullCircleOpen,
  setStatusFilter,
  setExpandedProperty,
}: HomeTabProps) {
  const { setActiveTab, dashboard, properties, scaffoldPeriodCounts, systemHealth } = useDashboard();

  const hasScaffoldData = (dashboard?.scaffoldingNewApplications?.at ?? scaffoldPeriodCounts?.at) != null;
  const scaffoldDisplayValue = (dashboard?.scaffoldingNewApplications?.previousDay ?? scaffoldPeriodCounts?.previousDay) ?? null;
  const totalSent = dashboard?.analytics?.ooh?.totalSent ?? 0;

  const [oohProposals, setOohProposals] = useState<OOHProposalPreview[]>([]);
  useEffect(() => {
    let c = false;
    fetch("/api/ooh/proposals?limit=6").then((r) => r.json()).then((d: { items?: OOHProposalPreview[] }) => { if (!c && d?.items) setOohProposals(d.items); }).catch(() => {});
    return () => { c = true; };
  }, []);

  const anyRunning = discoveryRunning || scaffoldRunning || researchRunning || agentRunning;
  const oohAnalytics = dashboard?.analytics?.ooh;

  const statusCounts: Record<string, number> = {};
  properties.forEach((p) => { statusCounts[p.outreachStatus] = (statusCounts[p.outreachStatus] || 0) + 1; });

  return (
    <div className="animate-fade-in space-y-5">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Overblik</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {dashboard?.totalProperties ?? 0} ejendomme &middot; {dashboard?.readyToSend ?? 0} klar &middot; {dashboard?.mailsSent ?? 0} sendt
          </p>
        </div>
        <div className="flex items-center gap-2">
          {anyRunning && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-semibold rounded-md">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Processer aktive
            </span>
          )}
          <button onClick={() => setFullCircleOpen(true)} className="btn-primary text-[11px] !px-3 !py-1.5">
            Full Circle Pipeline
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {([
          { label: "Ejendomme", value: dashboard?.totalProperties ?? 0, color: "text-indigo-600", tab: "properties" as TabId },
          { label: "Afventer research", value: dashboard?.pendingResearch ?? 0, color: "text-amber-600", tab: "research" as TabId },
          { label: "Klar til udsendelse", value: dashboard?.readyToSend ?? 0, color: "text-emerald-600", tab: "outreach" as TabId },
          { label: "Mails sendt", value: dashboard?.mailsSent ?? 0, color: "text-violet-600", tab: "outreach" as TabId },
          { label: "Stilladser", value: typeof scaffoldDisplayValue === "number" ? scaffoldDisplayValue : (hasScaffoldData ? 0 : "\u2014"), color: "text-sky-600", tab: "scaffolding" as TabId },
        ]).map((kpi) => (
          <button key={kpi.label} onClick={() => setActiveTab(kpi.tab)} className="surface-card p-3.5 text-left hover:shadow-md transition-shadow group">
            <p className={`text-2xl font-extrabold tabular-nums ${kpi.color}`}>{kpi.value}</p>
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mt-1 group-hover:text-slate-600 transition-colors">{kpi.label}</p>
          </button>
        ))}
      </div>

      {/* ── Urgent tasks (only if any) ── */}
      {(() => {
        const ls = dashboard?.leadSummary;
        const st = dashboard?.staging;
        const tasks: { label: string; count: number; color: string; dot: string; action: () => void }[] = [];

        if (ls && ls.overdueFollowups > 0) tasks.push({ label: "Forfaldne follow-ups", count: ls.overdueFollowups, color: "text-red-600", dot: "bg-red-500 animate-pulse", action: () => setActiveTab("lead_sourcing" as TabId) });
        if (ls && ls.todayFollowups > 0) tasks.push({ label: "Follow-ups i dag", count: ls.todayFollowups, color: "text-amber-600", dot: "bg-amber-500", action: () => setActiveTab("lead_sourcing" as TabId) });
        if (st && st.researched > 0) tasks.push({ label: "Klar til mail-udkast", count: st.researched, color: "text-indigo-600", dot: "bg-indigo-500", action: () => setActiveTab("staging") });
        if (dashboard?.readyToSend && dashboard.readyToSend > 0) tasks.push({ label: "Klar til udsendelse", count: dashboard.readyToSend, color: "text-emerald-600", dot: "bg-emerald-500", action: () => { setActiveTab("outreach"); setStatusFilter("ready"); } });
        if (st && st.new > 0) tasks.push({ label: "Nye til research", count: st.new, color: "text-blue-600", dot: "bg-blue-400", action: () => setActiveTab("staging") });
        const ts = dashboard?.tilbudSummary;
        if (ts && ts.draft > 0) tasks.push({ label: "Tilbud i udkast", count: ts.draft, color: "text-violet-600", dot: "bg-violet-400", action: () => setActiveTab("tilbud" as TabId) });

        if (tasks.length === 0) return null;

        return (
          <div className="surface-card p-4">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3">Opgaver</h2>
            <div className="space-y-1">
              {tasks.map((t) => (
                <button key={t.label} onClick={t.action} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left group">
                  <span className={`w-2 h-2 rounded-full ${t.dot} shrink-0`} />
                  <span className="flex-1 text-xs text-slate-700 group-hover:text-slate-900">{t.label}</span>
                  <span className={`text-xs font-bold tabular-nums ${t.color}`}>{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── Staging alert (compact) ── */}
      {(dashboard?.staging?.awaitingAction || 0) > 0 && (
        <button onClick={() => setActiveTab("staging")} className="w-full flex items-center gap-3 surface-card p-3 hover:shadow-md transition-shadow group">
          <span className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
            <span className="text-sm font-extrabold text-amber-700">{dashboard?.staging?.awaitingAction}</span>
          </span>
          <div className="flex-1 text-left">
            <p className="text-xs font-semibold text-slate-800">Ejendomme afventer godkendelse</p>
            <p className="text-[10px] text-slate-400">
              {(dashboard?.staging?.new || 0) > 0 && `${dashboard?.staging?.new} nye`}
              {(dashboard?.staging?.researched || 0) > 0 && ` · ${dashboard?.staging?.researched} klar`}
              {(dashboard?.staging?.researching || 0) > 0 && ` · ${dashboard?.staging?.researching} researching`}
            </p>
          </div>
          <svg className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      )}

      {/* ── Two-column: Pipeline + Funnel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline status */}
        <div className="surface-card p-4">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3">Pipeline</h2>
          <div className="space-y-2">
            {[
              { key: "NY_KRAEVER_RESEARCH", label: "Ny", dot: "bg-amber-400" },
              { key: "RESEARCH_IGANGSAT", label: "Researching", dot: "bg-blue-400" },
              { key: "RESEARCH_DONE_CONTACT_PENDING", label: "Researched", dot: "bg-indigo-400" },
              { key: "KLAR_TIL_UDSENDELSE", label: "Klar", dot: "bg-emerald-400" },
              { key: "FOERSTE_MAIL_SENDT", label: "Sendt", dot: "bg-violet-400" },
              { key: "FEJL", label: "Fejl", dot: "bg-red-400" },
            ].map((s) => {
              const count = statusCounts[s.key] || 0;
              const total = properties.length || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <button key={s.key} onClick={() => { setActiveTab("properties"); setStatusFilter(getStatusConfig(s.key).filterKey); }} className="w-full flex items-center gap-2.5 group">
                  <span className={`w-2 h-2 rounded-full ${s.dot} shrink-0`} />
                  <span className="text-[11px] text-slate-600 w-20 text-left">{s.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className={`${s.dot} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 tabular-nums w-6 text-right">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Funnel */}
        {dashboard?.analytics?.funnel && (() => {
          const f = dashboard.analytics.funnel;
          const steps = [
            { label: "Fundet", value: f.discovered, color: "text-slate-600" },
            { label: "Staging", value: f.staged, color: "text-amber-600" },
            { label: "HubSpot", value: f.inHubSpot, color: "text-blue-600" },
            { label: "Klar", value: f.ready, color: "text-emerald-600" },
            { label: "Sendt", value: f.sent, color: "text-violet-600" },
          ];
          return (
            <div className="surface-card p-4">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3">Konvertering</h2>
              <div className="space-y-2.5">
                {steps.map((step, i) => {
                  const prev = i > 0 ? steps[i - 1].value : 0;
                  const rate = i > 0 && prev > 0 ? Math.round((step.value / prev) * 100) : null;
                  return (
                    <div key={step.label} className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 w-14">{step.label}</span>
                      <span className={`text-sm font-bold tabular-nums ${step.color} w-10`}>{step.value}</span>
                      {rate !== null && (
                        <span className={`text-[10px] font-medium tabular-nums ${rate >= 50 ? "text-emerald-500" : rate >= 20 ? "text-amber-500" : "text-red-400"}`}>
                          {rate}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Stilladser (only if data) ── */}
      {((dashboard?.scaffoldingNewApplications?.previousDayPermits?.length ?? 0) > 0) && (
        <button onClick={() => setActiveTab("scaffolding")} className="w-full surface-card p-4 text-left hover:shadow-md transition-shadow group">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-2">Stilladser (i g\u00e5r)</h2>
          <div className="space-y-1.5">
            {(dashboard?.scaffoldingNewApplications?.previousDayPermits ?? []).slice(0, 5).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-700 truncate">{p.address}</span>
                <span className="text-sky-600 font-medium shrink-0 ml-2">{p.durationText}</span>
              </div>
            ))}
            {(dashboard?.scaffoldingNewApplications?.previousDayPermits?.length ?? 0) > 5 && (
              <p className="text-[10px] text-slate-400">+ {(dashboard?.scaffoldingNewApplications?.previousDayPermits?.length ?? 0) - 5} flere</p>
            )}
          </div>
        </button>
      )}

      {/* ── OOH performance (compact) ── */}
      {oohAnalytics && totalSent > 0 && (
        <button onClick={() => setActiveTab("ooh")} className="w-full surface-card p-4 text-left hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">OOH Performance</h2>
            <span className="text-[10px] text-indigo-500 font-medium">Se detaljer &rarr;</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: "Sendt", value: oohAnalytics.totalSent, color: "text-slate-700" },
              { label: "\u00c5bnet", value: oohAnalytics.opened ?? 0, color: "text-violet-600" },
              { label: "Klikket", value: oohAnalytics.clicked ?? 0, color: "text-cyan-600" },
              { label: "Svar", value: oohAnalytics.replied ?? 0, color: "text-emerald-600" },
              { label: "M\u00f8der", value: oohAnalytics.meetings ?? 0, color: "text-amber-600" },
              { label: "Solgt", value: oohAnalytics.sold ?? 0, color: "text-green-600" },
            ].map((m) => (
              <div key={m.label} className="text-center">
                <p className={`text-lg font-bold tabular-nums ${m.color}`}>{m.value}</p>
                <p className="text-[9px] text-slate-400 uppercase">{m.label}</p>
              </div>
            ))}
          </div>
        </button>
      )}

      {/* ── Tilbud pipeline ── */}
      {dashboard?.tilbudSummary && dashboard.tilbudSummary.total > 0 && (() => {
        const t = dashboard.tilbudSummary!;
        const fmtDKK = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v);
        return (
          <button onClick={() => setActiveTab("tilbud")} className="w-full surface-card p-4 text-left hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Tilbud Pipeline</h2>
              <span className="text-[10px] text-indigo-500 font-medium">Se tilbud &rarr;</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Udkast", value: t.draft, color: "text-amber-600" },
                { label: "Godkendt", value: t.final, color: "text-emerald-600" },
                { label: "Samlet værdi", value: `${fmtDKK(t.totalValue)} kr`, color: "text-slate-700" },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <p className={`text-lg font-bold tabular-nums ${m.color}`}>{m.value}</p>
                  <p className="text-[9px] text-slate-400 uppercase mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          </button>
        );
      })()}

      {/* ── OOH mockups ── */}
      {oohProposals.length > 0 && (
        <button onClick={() => setActiveTab("ooh")} className="w-full surface-card p-4 text-left hover:shadow-md transition-shadow">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-2">Seneste OOH-mockups</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {oohProposals.slice(0, 6).map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-100 overflow-hidden aspect-square bg-slate-50">
                {p.mockupBuffer ? (
                  <img src={p.mockupBuffer} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-[9px] text-slate-400 text-center px-1 truncate">{p.clientCompany}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </button>
      )}

      {/* ── Two-column: Recent + System ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent properties */}
        <div className="surface-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Seneste ejendomme</h2>
            <button onClick={() => setActiveTab("properties")} className="text-[10px] text-indigo-500 font-medium hover:underline">Se alle</button>
          </div>
          {properties.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">Ingen ejendomme endnu</p>
          ) : (
            <div className="space-y-1">
              {properties.slice(0, 5).map((p) => {
                const sc = getStatusConfig(p.outreachStatus);
                return (
                  <button key={p.id} onClick={() => { setActiveTab("properties"); setExpandedProperty(p.id); }} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors text-left">
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">{p.name || p.address}</p>
                      <p className="text-[10px] text-slate-400 truncate">{p.city} &middot; {sc.label}</p>
                    </div>
                    {p.outdoorScore != null && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.outdoorScore >= 7 ? "bg-emerald-50 text-emerald-600" : p.outdoorScore >= 4 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-500"}`}>{p.outdoorScore}/10</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* System health */}
        <div className="surface-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">System</h2>
            {systemHealth && (
              <span className={`flex items-center gap-1 text-[10px] font-medium ${systemHealth.status === "healthy" ? "text-emerald-500" : systemHealth.status === "degraded" ? "text-amber-500" : "text-red-500"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${systemHealth.status === "healthy" ? "bg-emerald-400" : systemHealth.status === "degraded" ? "bg-amber-400" : "bg-red-400"}`} />
                {systemHealth.status === "healthy" ? "OK" : systemHealth.status === "degraded" ? "Nedsat" : "Fejl"}
              </span>
            )}
          </div>
          {systemHealth ? (
            <div className="space-y-1.5">
              {Object.entries(systemHealth.pings || {}).map(([key, ping]) => {
                const p = ping as { ok: boolean; service?: string; latencyMs?: number };
                return (
                  <div key={key} className="flex items-center justify-between px-2 py-1.5 rounded-md bg-slate-50/80">
                    <div className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${p.ok ? "bg-emerald-400" : "bg-red-400"}`} />
                      <span className="text-[11px] text-slate-600">{p.service || key}</span>
                    </div>
                    {p.latencyMs != null && (
                      <span className={`text-[10px] tabular-nums ${p.latencyMs < 200 ? "text-emerald-500" : p.latencyMs < 500 ? "text-amber-500" : "text-red-500"}`}>{p.latencyMs}ms</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-200 border-t-slate-400" />
            </div>
          )}
          {anyRunning && (
            <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
              {discoveryRunning && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-medium rounded">Discovery</span>}
              {scaffoldRunning && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-50 text-cyan-600 text-[9px] font-medium rounded">Stilladser</span>}
              {researchRunning && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 text-[9px] font-medium rounded">Research</span>}
              {agentRunning && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-600 text-[9px] font-medium rounded">Gade-agent</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
