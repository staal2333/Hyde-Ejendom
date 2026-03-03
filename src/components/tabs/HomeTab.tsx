"use client";

import { useState, useEffect } from "react";
import { useDashboard } from "@/contexts/DashboardContext";
import type { TabId } from "@/contexts/DashboardContext";
import { getStatusConfig } from "@/lib/statusConfig";
import { formatPropertyTitle } from "@/lib/format-address";

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
  /** City for Full Circle wizard (e.g. scaffoldCity from Stilladser) */
  scaffoldCity?: string;
}

export function HomeTab({
  discoveryRunning,
  scaffoldRunning,
  researchRunning,
  agentRunning,
  fullCircleOpen,
  setFullCircleOpen,
  setStatusFilter,
  setExpandedProperty,
  scaffoldCity = "KÃ¸benhavn",
}: HomeTabProps) {
  const {
    setActiveTab,
    dashboard,
    properties,
    scaffoldPeriodCounts,
    systemHealth,
  } = useDashboard();

  const stilladsSectionTitle = "Stilladser (dagen fÃ¸r)";

  const hasScaffoldData = (dashboard?.scaffoldingNewApplications?.at ?? scaffoldPeriodCounts?.at) != null;
  const scaffoldDisplayValue = (dashboard?.scaffoldingNewApplications?.previousDay ?? scaffoldPeriodCounts?.previousDay) ?? null;
  const totalSent = dashboard?.analytics?.ooh?.totalSent ?? 0;
  const showConversionRates = properties.length >= 5;

  const [oohProposals, setOohProposals] = useState<OOHProposalPreview[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ooh/proposals?limit=6")
      .then((r) => r.json())
      .then((data: { items?: OOHProposalPreview[] }) => {
        if (!cancelled && Array.isArray(data?.items)) setOohProposals(data.items);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const oohAnalytics = dashboard?.analytics?.ooh;

  return (
    <div className="animate-fade-in w-full max-w-full space-y-6">
      {/* â”€â”€â”€ Hero Banner â”€â”€â”€ */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0a0e1f 0%, #1a1250 40%, #130f3f 70%, #0d1224 100%)" }}>
        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-8 -left-8 w-56 h-56 rounded-full bg-indigo-500/15 blur-3xl animate-float" />
          <div className="absolute -bottom-8 -right-8 w-56 h-56 rounded-full bg-violet-500/15 blur-3xl animate-float" style={{ animationDelay: "-3s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-36 rounded-full bg-blue-500/8 blur-3xl animate-float" style={{ animationDelay: "-1.5s" }} />
          <div className="absolute top-4 left-1/4 w-1 h-1 rounded-full bg-indigo-300/40 animate-float" style={{ animationDelay: "-1s" }} />
          <div className="absolute top-8 right-1/3 w-1.5 h-1.5 rounded-full bg-violet-300/30 animate-float" style={{ animationDelay: "-2.5s" }} />
          <div className="absolute bottom-6 left-1/3 w-1 h-1 rounded-full bg-cyan-300/30 animate-float" style={{ animationDelay: "-4s" }} />
        </div>
        <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-4 px-7 py-6">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/60" style={{ animation: "gentle-pulse 2s ease-in-out infinite" }} />
              <span className="text-2xs font-semibold text-emerald-400/80 uppercase tracking-widest">System klar</span>
            </div>
            <h2 className="text-xl font-extrabold text-white tracking-tight leading-none">
              Ejendom AI Pipeline
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {dashboard?.totalProperties ?? 0} ejendomme Â· {dashboard?.readyToSend ?? 0} klar Â· {dashboard?.mailsSent ?? 0} sendt
            </p>
          </div>
          <button
            onClick={() => setFullCircleOpen(true)}
            className="flex items-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm text-white transition-all flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              boxShadow: "0 4px 20px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
            </svg>
            Full Circle Pipeline
          </button>
        </div>
      </div>

      {/* KPI Cards â€” full vivid gradient */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        {[
          {
            label: "Ejendomme",
            value: dashboard?.totalProperties ?? 0,
            icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75",
            style: { background: "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)", boxShadow: "0 8px 24px rgba(99,102,241,0.35)" },
            onClick: () => setActiveTab("properties" as TabId),
          },
          {
            label: "Afventer research",
            value: dashboard?.pendingResearch ?? 0,
            icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
            style: { background: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)", boxShadow: "0 8px 24px rgba(217,119,6,0.35)" },
            onClick: () => setActiveTab("research" as TabId),
          },
          {
            label: "Klar til udsendelse",
            value: dashboard?.readyToSend ?? 0,
            icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
            style: { background: "linear-gradient(135deg, #059669 0%, #10b981 100%)", boxShadow: "0 8px 24px rgba(5,150,105,0.35)" },
            onClick: () => setActiveTab("outreach" as TabId),
          },
          {
            label: "Mails sendt",
            value: dashboard?.mailsSent ?? 0,
            icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
            style: { background: "linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)", boxShadow: "0 8px 24px rgba(124,58,237,0.35)" },
            onClick: () => setActiveTab("outreach" as TabId),
          },
          {
            label: "Stilladser (dagen fÃ¸r)",
            value: typeof scaffoldDisplayValue === "number" ? scaffoldDisplayValue : (hasScaffoldData ? 0 : "â€”"),
            icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18",
            style: { background: "linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)", boxShadow: "0 8px 24px rgba(2,132,199,0.35)" },
            onClick: () => setActiveTab("scaffolding" as TabId),
            isStillads: true,
          },
        ].map((kpi, ki) => (
          <button
            key={kpi.label}
            onClick={kpi.onClick}
            className="relative rounded-2xl p-4 overflow-hidden text-left text-white card-hover group"
            style={{ ...kpi.style, animationDelay: `${ki * 60}ms` }}
          >
            {/* Glow orb with glass overlay */}
            <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-white/10 blur-2xl group-hover:bg-white/15 transition-all duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-white/5 pointer-events-none" />
            <div className="absolute inset-[1px] rounded-[15px] pointer-events-none" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)" }} />
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/10">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={kpi.icon} />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-extrabold tabular-nums tracking-tight leading-none animate-count-up">{kpi.value}</p>
              <p className="text-2xs font-semibold text-white/60 uppercase tracking-wider mt-1.5">{kpi.label}</p>
              {kpi.isStillads && !hasScaffoldData && (
                <p className="text-[9px] text-white/50 mt-0.5">Scan ikke kÃ¸rt endnu</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {((dashboard?.scaffoldingNewApplications?.previousDayPermits?.length ?? 0) > 0) && (
        <button
          onClick={() => setActiveTab("scaffolding")}
          className="w-full rounded-2xl border border-cyan-200/60 bg-cyan-50/50 p-5 mb-6 text-left hover:bg-cyan-50 hover:border-cyan-200 transition-all card-hover"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center" aria-hidden>
                <svg className="w-4 h-4 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />
                </svg>
              </span>
              <span>{stilladsSectionTitle}</span>
            </h2>
            <span className="text-[10px] text-slate-400">Opdateres hvert 10. min</span>
          </div>
            <div className="space-y-2">
              {(dashboard?.scaffoldingNewApplications?.previousDayPermits ?? []).slice(0, 10).map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-cyan-100/80 last:border-0">
                  <span className="text-sm font-medium text-slate-800 truncate">{p.address}</span>
                  <span className="text-xs text-cyan-700 font-semibold shrink-0">{p.durationText}</span>
                </div>
              ))}
              {(dashboard?.scaffoldingNewApplications?.previousDayPermits?.length ?? 0) > 10 && (
                <p className="text-[10px] text-slate-500 pt-1">
                  + {(dashboard?.scaffoldingNewApplications?.previousDayPermits?.length ?? 0) - 10} flere
                </p>
              )}
            </div>
          </button>
      )}

      {/* Staging Alert */}
      {(dashboard?.staging?.awaitingAction || 0) > 0 && (
        <button
          onClick={() => setActiveTab("staging")}
          className="w-full flex items-center gap-4 rounded-2xl px-5 py-4 hover:opacity-95 transition-all group card-hover text-white"
          style={{ background: "linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%)", boxShadow: "0 8px 24px rgba(180,83,9,0.3)" }}
        >
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <span className="text-xl font-extrabold text-white">{dashboard?.staging?.awaitingAction || 0}</span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-white">
              Ejendom{(dashboard?.staging?.awaitingAction || 0) !== 1 ? "me" : ""} afventer godkendelse
            </p>
            <p className="text-xs text-white/70 mt-0.5">
              {(dashboard?.staging?.new || 0) > 0 && `${dashboard?.staging?.new} nye`}
              {(dashboard?.staging?.researched || 0) > 0 && ` Â· ${dashboard?.staging?.researched} klar til udkast`}
              {(dashboard?.staging?.researching || 0) > 0 && ` Â· ${dashboard?.staging?.researching} researching`}
            </p>
          </div>
          <svg className="w-5 h-5 text-white/70 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Funnel */}
      {dashboard?.analytics?.funnel && (() => {
        const f = dashboard.analytics.funnel;
        const steps = [
          { key: "discovered", label: "Fundet", value: f.discovered, bar: "bg-slate-400" },
          { key: "staged", label: "Staging", value: f.staged, bar: "bg-amber-400" },
          { key: "inHubSpot", label: "HubSpot", value: f.inHubSpot, bar: "bg-blue-400" },
          { key: "ready", label: "Klar", value: f.ready, bar: "bg-emerald-400" },
          { key: "sent", label: "Sendt", value: f.sent, bar: "bg-violet-400" },
        ];
        const maxVal = Math.max(...steps.map(s => s.value), 1);
        return (
          <div className="surface-card p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </span>
              Konverteringstragt
            </h2>
            <div className="space-y-2.5">
              {steps.map((step, i) => {
                const pct = maxVal > 0 ? Math.round((step.value / maxVal) * 100) : 0;
                const prevVal = i > 0 ? steps[i - 1].value : 0;
                const convRate = i > 0 && prevVal > 0 ? Math.round((step.value / prevVal) * 100) : null;
                return (
                  <div key={step.key}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700 w-16">{step.label}</span>
                        <span className="text-xs font-bold text-slate-900 tabular-nums">{step.value}</span>
                      </div>
                      {convRate !== null && (
                        <span className={`text-[10px] font-semibold tabular-nums ${convRate >= 50 ? "text-green-600" : convRate >= 20 ? "text-amber-600" : "text-red-500"}`}>
                          {convRate}%
                        </span>
                      )}
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${step.bar} transition-all duration-700`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 mt-3">Procenttal viser konverteringsrate fra forrige trin</p>
          </div>
        );
      })()}

      {/* Trend (14 dage) */}
      {dashboard?.analytics?.trend && dashboard.analytics.trend.length > 1 && (() => {
        const trend = dashboard.analytics.trend as { snapshotDate: string; discovered: number; staged: number; sent: number }[];
        const maxV = Math.max(...trend.map(t => t.discovered), 1);
        return (
          <div className="surface-card p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                </svg>
              </span>
              Udvikling (14 dage)
            </h2>
            <div className="flex items-end gap-1 h-24">
              {trend.map((day, i) => {
                const h1 = Math.max(4, (day.discovered / maxV) * 100);
                const h2 = Math.max(2, (day.sent / maxV) * 100);
                const dateStr = day.snapshotDate.split("-").slice(1).join("/");
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                    <div className="w-full flex flex-col items-center gap-0.5">
                      <div className="w-full bg-slate-200 rounded-t" style={{ height: `${h1}%` }} title={`Fundet: ${day.discovered}`} />
                      <div className="w-full bg-violet-400 rounded-b" style={{ height: `${h2}%` }} title={`Sendt: ${day.sent}`} />
                    </div>
                    <span className="text-[8px] text-slate-400 mt-1 hidden sm:block">{dateStr}</span>
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                      {dateStr}: {day.discovered} fundet, {day.sent} sendt
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2">
              <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-slate-200 inline-block" /> Fundet</span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500"><span className="w-2 h-2 rounded-sm bg-violet-400 inline-block" /> Sendt</span>
            </div>
          </div>
        );
      })()}

      {/* â•â•â• Dagens opgaver â•â•â• */}
      {(() => {
        const ls = dashboard?.leadSummary;
        const st = dashboard?.staging;

        type TaskItem = {
          key: string;
          count: number;
          priority: "urgent" | "high" | "medium" | "low";
          label: string;
          sub: string;
          action: () => void;
          dotColor: string;
          badgeBg: string;
          badgeText: string;
          borderHover: string;
          bgHover: string;
        };

        const tasks: TaskItem[] = [
          ls && ls.overdueFollowups > 0 ? {
            key: "overdue",
            count: ls.overdueFollowups,
            priority: "urgent" as const,
            label: "Forfaldne follow-ups",
            sub: "Kontakt disse leads nu â€“ de er overskredet",
            action: () => setActiveTab("lead_sourcing" as TabId),
            dotColor: "bg-red-500 animate-pulse",
            badgeBg: "bg-red-500",
            badgeText: "text-white",
            borderHover: "hover:border-red-300",
            bgHover: "hover:bg-red-50/60",
          } : null,
          ls && ls.todayFollowups > 0 ? {
            key: "today-followup",
            count: ls.todayFollowups,
            priority: "high" as const,
            label: "Follow-ups forfald i dag",
            sub: "PlanlÃ¦g kontakt inden dagen er omme",
            action: () => setActiveTab("lead_sourcing" as TabId),
            dotColor: "bg-orange-500",
            badgeBg: "bg-orange-500",
            badgeText: "text-white",
            borderHover: "hover:border-orange-300",
            bgHover: "hover:bg-orange-50/60",
          } : null,
          st && st.researched > 0 ? {
            key: "draft",
            count: st.researched,
            priority: "high" as const,
            label: "Klar til mail-udkast",
            sub: "Generer udkast og godkend disse ejendomme",
            action: () => setActiveTab("staging"),
            dotColor: "bg-amber-500",
            badgeBg: "bg-amber-500",
            badgeText: "text-white",
            borderHover: "hover:border-amber-300",
            bgHover: "hover:bg-amber-50/60",
          } : null,
          st && st.approved > 0 ? {
            key: "hubspot",
            count: st.approved,
            priority: "medium" as const,
            label: "Klar til HubSpot",
            sub: "Godkendte ejendomme â€“ push og klar til udsendelse",
            action: () => setActiveTab("staging"),
            dotColor: "bg-emerald-500",
            badgeBg: "bg-emerald-500",
            badgeText: "text-white",
            borderHover: "hover:border-emerald-300",
            bgHover: "hover:bg-emerald-50/60",
          } : null,
          dashboard?.readyToSend && dashboard.readyToSend > 0 ? {
            key: "send",
            count: dashboard.readyToSend,
            priority: "medium" as const,
            label: "Klar til udsendelse",
            sub: "Send disse mails til ejere i HubSpot",
            action: () => { setActiveTab("outreach"); setStatusFilter("ready"); },
            dotColor: "bg-violet-500",
            badgeBg: "bg-violet-500",
            badgeText: "text-white",
            borderHover: "hover:border-violet-300",
            bgHover: "hover:bg-violet-50/60",
          } : null,
          st && st.new > 0 ? {
            key: "research",
            count: st.new,
            priority: "low" as const,
            label: "Nye ejendomme til research",
            sub: "KÃ¸r research for at finde kontaktinfo og score",
            action: () => setActiveTab("staging"),
            dotColor: "bg-blue-400",
            badgeBg: "bg-blue-100",
            badgeText: "text-blue-700",
            borderHover: "hover:border-blue-200",
            bgHover: "hover:bg-blue-50/40",
          } : null,
          ls && ls.counts && (ls.counts.new || 0) > 0 ? {
            key: "leads-new",
            count: ls.counts.new,
            priority: "low" as const,
            label: "Nye leads at berige",
            sub: "KÃ¸r auto-berigelse for CVR, kontakt og Ã¸konomi",
            action: () => setActiveTab("lead_sourcing" as TabId),
            dotColor: "bg-indigo-400",
            badgeBg: "bg-indigo-100",
            badgeText: "text-indigo-700",
            borderHover: "hover:border-indigo-200",
            bgHover: "hover:bg-indigo-50/40",
          } : null,
        ].filter(Boolean) as TaskItem[];

        if (tasks.length === 0) {
          return (
            <div className="surface-card p-8 text-center">
              <div className="relative w-16 h-16 mx-auto mb-4">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50" />
                <div className="absolute inset-0 rounded-2xl flex items-center justify-center animate-scale-in">
                  <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-300 animate-float" style={{ animationDelay: "-1s" }} />
                <div className="absolute -bottom-1 -left-1 w-1.5 h-1.5 rounded-full bg-emerald-200 animate-float" style={{ animationDelay: "-2s" }} />
                <div className="absolute top-0 left-0 w-1 h-1 rounded-full bg-emerald-300/50 animate-float" style={{ animationDelay: "-3s" }} />
              </div>
              <p className="text-sm font-bold text-slate-800">Alt er opdateret</p>
              <p className="text-xs text-slate-400 mt-1">Ingen ventende opgaver i dag</p>
            </div>
          );
        }

        return (
          <div className="surface-card p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
              Dagens opgaver
              <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold tabular-nums">{tasks.length}</span>
            </h2>
            <div className="space-y-2">
              {tasks.map((task, i) => (
                <button
                  key={task.key}
                  onClick={task.action}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-slate-200/70 text-left transition-all group card-hover ${task.bgHover} ${task.borderHover}`}
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <span className={`flex-shrink-0 w-2 h-2 rounded-full ${task.dotColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{task.label}</p>
                    <p className="text-[11px] text-slate-400 truncate">{task.sub}</p>
                  </div>
                  <span className={`flex-shrink-0 min-w-[28px] h-6 px-2 rounded-full ${task.badgeBg} ${task.badgeText} text-[11px] font-bold flex items-center justify-center tabular-nums`}>
                    {task.count}
                  </span>
                  <svg className="w-4 h-4 text-slate-300 group-hover:translate-x-0.5 transition-transform flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* â•â•â• Leads Action Center â•â•â• */}
      {(() => {
        const ls = dashboard?.leadSummary;
        if (!ls) return null;
        const totalLeads = Object.values(ls.counts).reduce((a, b) => a + b, 0);
        if (totalLeads === 0 && ls.overdueFollowups === 0) return null;
        const urgentCount = ls.overdueFollowups + ls.todayFollowups;
        return (
          <div className="surface-card p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </span>
              Lead Pipeline
              {urgentCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums">{urgentCount}</span>
              )}
            </h2>

            {/* Follow-up alerts */}
            {(ls.overdueFollowups > 0 || ls.todayFollowups > 0) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {ls.overdueFollowups > 0 && (
                  <button onClick={() => setActiveTab("lead_sourcing" as TabId)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200/60 text-red-700 hover:bg-red-100 transition-all">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs font-bold">{ls.overdueFollowups} forfaldne follow-ups</span>
                  </button>
                )}
                {ls.todayFollowups > 0 && (
                  <button onClick={() => setActiveTab("lead_sourcing" as TabId)} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-700 hover:bg-amber-100 transition-all">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-xs font-bold">{ls.todayFollowups} follow-ups i dag</span>
                  </button>
                )}
              </div>
            )}

            {/* Lead pipeline mini-funnel */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: "Nye", count: ls.counts.new || 0, color: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-500" },
                { label: "Kvalificerede", count: ls.counts.qualified || 0, color: "text-indigo-600", bg: "bg-indigo-50", dot: "bg-indigo-500" },
                { label: "Kontaktet", count: ls.counts.contacted || 0, color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
                { label: "Kunder", count: ls.counts.customer || 0, color: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
              ].map(s => (
                <button key={s.label} onClick={() => setActiveTab("lead_sourcing" as TabId)} className={`${s.bg} rounded-xl p-3 text-center hover:opacity-80 transition`}>
                  <div className={`text-xl font-extrabold tabular-nums ${s.color}`}>{s.count}</div>
                  <div className="flex items-center justify-center gap-1 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    <span className="text-[10px] font-semibold text-slate-600">{s.label}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Top new leads */}
            {ls.topNewLeads.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Top nye leads</p>
                <div className="space-y-1.5">
                  {ls.topNewLeads.map(l => (
                    <button key={l.id} onClick={() => setActiveTab("lead_sourcing" as TabId)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-50 transition text-left group"
                    >
                      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-[10px] font-bold tabular-nums border ${
                        l.ooh_score >= 60 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                          : l.ooh_score >= 30 ? "text-amber-700 bg-amber-50 border-amber-200"
                          : "text-red-700 bg-red-50 border-red-200"
                      }`}>{l.ooh_score}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{l.name}</p>
                        <p className="text-[10px] text-slate-400">
                          {l.source_platform} Â· {new Date(l.discovered_at).toLocaleDateString("da-DK")}
                        </p>
                      </div>
                      {l.contact_email ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0" title="Har kontaktinfo">
                          <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center shrink-0" title="Mangler kontaktinfo">
                          <svg className="w-3 h-3 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Seneste OOH-mockups */}
      {oohProposals.length > 0 && (
        <button
          type="button"
          onClick={() => setActiveTab("ooh")}
          className="w-full rounded-2xl border border-violet-200/60 bg-violet-50/30 p-5 mb-6 text-left hover:bg-violet-50/50 hover:border-violet-200 transition-all card-hover"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center" aria-hidden>
                <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </span>
              Seneste OOH-mockups
            </h2>
            <span className="text-[10px] text-violet-600 font-semibold">Klik for at Ã¥bne OOH</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {oohProposals.slice(0, 6).map((p) => (
              <div key={p.id} className="rounded-xl border border-violet-100 bg-white overflow-hidden aspect-square">
                {p.mockupBuffer ? (
                  <img src={p.mockupBuffer} alt="" className="w-full h-full object-cover" />
                ) : p.mockupUrl ? (
                  <a href={p.mockupUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full bg-violet-50 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <svg className="w-8 h-8 text-violet-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                  </a>
                ) : (
                  <div className="w-full h-full bg-slate-50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                  </div>
                )}
                <div className="p-1.5 bg-white border-t border-violet-50">
                  <p className="text-[10px] font-semibold text-slate-700 truncate" title={p.clientCompany}>{p.clientCompany}</p>
                </div>
              </div>
            ))}
          </div>
        </button>
      )}

      {/* OOH Kampagne-performance */}
      {oohAnalytics && (oohAnalytics.totalSent > 0 || oohAnalytics.opened > 0) && (
        <button
          type="button"
          onClick={() => setActiveTab("ooh")}
          className="w-full rounded-2xl border border-slate-200/60 bg-white shadow-[var(--card-shadow)] p-4 mb-6 text-left hover:shadow-lg transition-all flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">OOH Kampagne-performance</p>
              <p className="text-xs text-slate-500">
                Sendt: {oohAnalytics.totalSent} Â· Ã…bnet: {oohAnalytics.opened ?? 0} Â· Klikket: {oohAnalytics.clicked ?? 0} Â· Svar: {oohAnalytics.replied ?? 0}
                {(oohAnalytics.meetings ?? 0) > 0 && ` Â· MÃ¸der: ${oohAnalytics.meetings}`}
                {(oohAnalytics.sold ?? 0) > 0 && ` Â· Solgt: ${oohAnalytics.sold}`}
              </p>
            </div>
          </div>
          <span className="text-[10px] text-violet-600 font-semibold shrink-0">Se i OOH â†’</span>
        </button>
      )}

      {/* Visual Pipeline */}
      <div className="surface-card p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-slate-900">Pipeline</h2>
          <span className="text-[10px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
            Discovery â†’ Research â†’ Approve â†’ Send
          </span>
        </div>
        {(() => {
          const statusCounts: Record<string, number> = {};
          properties.forEach((p) => {
            statusCounts[p.outreachStatus] = (statusCounts[p.outreachStatus] || 0) + 1;
          });
          const stagingNew = dashboard?.staging?.new || 0;
          const stagingResearched = dashboard?.staging?.researched || 0;
          const pipelineStages = [
            {
              key: "discovery",
              label: "Discovery",
              count: stagingNew,
              desc: "Nye leads",
              gradient: "from-blue-500 to-cyan-500",
              text: "text-blue-600",
              tab: "discover" as TabId,
              filter: null as string | null,
            },
            {
              key: "staging",
              label: "Staging",
              count: stagingNew + stagingResearched,
              desc: "Afventer",
              gradient: "from-amber-500 to-orange-500",
              text: "text-amber-600",
              tab: "staging" as TabId,
              filter: null,
            },
            {
              key: "research",
              label: "Research",
              count: (statusCounts["NY_KRAEVER_RESEARCH"] || 0) + (statusCounts["RESEARCH_IGANGSAT"] || 0),
              desc: "Analyserer",
              gradient: "from-indigo-500 to-blue-500",
              text: "text-indigo-600",
              tab: "research" as TabId,
              filter: null,
            },
            {
              key: "approved",
              label: "HubSpot",
              count: (dashboard?.staging?.pushed || 0) + (dashboard?.totalProperties || 0),
              desc: "I CRM",
              gradient: "from-violet-500 to-purple-500",
              text: "text-violet-600",
              tab: "properties" as TabId,
              filter: null,
            },
            {
              key: "ready",
              label: "Klar",
              count: statusCounts["KLAR_TIL_UDSENDELSE"] || 0,
              desc: "Til sending",
              gradient: "from-green-500 to-emerald-500",
              text: "text-emerald-600",
              tab: "outreach" as TabId,
              filter: "ready",
            },
            {
              key: "sent",
              label: "Sendt",
              count: statusCounts["FOERSTE_MAIL_SENDT"] || 0,
              desc: "Afsendt",
              gradient: "from-emerald-500 to-teal-500",
              text: "text-teal-600",
              tab: "outreach" as TabId,
              filter: "sent",
            },
          ];
          const maxCount = Math.max(1, ...pipelineStages.map((s) => s.count));
          return (
            <div className="flex items-center gap-1">
              {pipelineStages.map((stage, i) => (
                <div key={stage.key} className="flex-1 flex items-center">
                  <button
                    onClick={() => {
                      setActiveTab(stage.tab);
                      if (stage.filter) setStatusFilter(stage.filter);
                    }}
                    className="flex-1 text-center group"
                  >
                    <div className="relative mx-auto mb-2">
                      <div className="w-14 h-14 mx-auto relative">
                        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                          <circle
                            cx="28"
                            cy="28"
                            r="24"
                            fill="none"
                            stroke="currentColor"
                            className="text-slate-100"
                            strokeWidth="3"
                          />
                          <circle
                            cx="28"
                            cy="28"
                            r="24"
                            fill="none"
                            stroke="url(#grad)"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={`${Math.max(5, (stage.count / maxCount) * 150)} 150`}
                          />
                          <defs>
                            <linearGradient id={`grad-${stage.key}`}>
                              <stop offset="0%" className={stage.text} />
                              <stop offset="100%" className={stage.text} />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-lg font-extrabold tabular-nums ${stage.text}`}>{stage.count}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] font-bold text-slate-800 group-hover:text-slate-900">
                      {stage.label}
                    </div>
                    <div className="text-[9px] text-slate-400">{stage.desc}</div>
                  </button>
                  {i < pipelineStages.length - 1 && (
                    <svg
                      className="w-4 h-4 text-slate-200 shrink-0 -mt-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
        {properties.length > 0 && showConversionRates && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-8 text-[10px] text-slate-500">
            {(() => {
              const total = properties.length || 1;
              const ready = properties.filter((p) => p.outreachStatus === "KLAR_TIL_UDSENDELSE").length;
              const sent = properties.filter((p) => p.outreachStatus === "FOERSTE_MAIL_SENDT").length;
              return (
                <>
                  <span>
                    Research â†’ Klar{" "}
                    <strong className="text-slate-700 ml-1">{Math.round((ready / total) * 100)}%</strong>
                  </span>
                  <span className="w-px h-3 bg-slate-200" />
                  <span>
                    Klar â†’ Sendt{" "}
                    <strong className="text-slate-700 ml-1">
                      {ready > 0 ? Math.round((sent / ready) * 100) : 0}%
                    </strong>
                  </span>
                  <span className="w-px h-3 bg-slate-200" />
                  <span>
                    Total{" "}
                    <strong className="text-slate-700 ml-1">{Math.round((sent / total) * 100)}%</strong>
                  </span>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Status Breakdown + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 surface-card p-5">
          <h2 className="text-xs font-bold text-slate-900 mb-4 uppercase tracking-wide">HubSpot Status</h2>
          <div className="space-y-2.5">
            {(() => {
              const statusCounts: Record<string, number> = {};
              properties.forEach((p) => {
                statusCounts[p.outreachStatus] = (statusCounts[p.outreachStatus] || 0) + 1;
              });
              const total = properties.length || 1;
              const stages = [
                { key: "NY_KRAEVER_RESEARCH", label: "Ny", color: "bg-amber-500", textColor: "text-amber-600" },
                { key: "RESEARCH_IGANGSAT", label: "Researching", color: "bg-blue-500", textColor: "text-blue-600" },
                {
                  key: "RESEARCH_DONE_CONTACT_PENDING",
                  label: "Researched",
                  color: "bg-indigo-500",
                  textColor: "text-indigo-600",
                },
                { key: "KLAR_TIL_UDSENDELSE", label: "Klar", color: "bg-emerald-500", textColor: "text-emerald-600" },
                { key: "FOERSTE_MAIL_SENDT", label: "Sendt", color: "bg-teal-500", textColor: "text-teal-600" },
                { key: "FEJL", label: "Fejl", color: "bg-red-500", textColor: "text-red-600" },
              ];
              return stages.map((s) => {
                const count = statusCounts[s.key] || 0;
                const pct = Math.round((count / total) * 100);
                return (
                  <button
                    key={s.key}
                    onClick={() => {
                      setActiveTab("properties");
                      setStatusFilter(getStatusConfig(s.key).filterKey);
                    }}
                    className="w-full flex items-center gap-3 group"
                  >
                    <span className={`w-2 h-2 rounded-full ${s.color} shrink-0`} />
                    <span className="text-xs text-slate-600 group-hover:text-slate-900 w-24 text-left truncate">
                      {s.label}
                    </span>
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`${s.color} h-full rounded-full transition-all duration-700`}
                        style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${s.textColor} w-8 text-right`}>{count}</span>
                  </button>
                );
              });
            })()}
          </div>
          {properties.length === 0 && (
            <div className="text-center py-6">
              <p className="text-xs text-slate-400">Ingen ejendomme i pipeline endnu</p>
              <button
                onClick={() => setActiveTab("discover")}
                className="text-xs text-indigo-600 hover:underline mt-1.5 font-semibold"
              >
                Start discovery
              </button>
            </div>
          )}
        </div>
        <div className="lg:col-span-2 surface-card p-5">
          <h2 className="text-xs font-bold text-slate-900 mb-3 uppercase tracking-wide">Genveje</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: "Discovery",
                icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z",
                tab: "discover" as TabId,
                color: "text-blue-600",
                bg: "bg-blue-50 hover:bg-blue-100/80",
              },
              {
                label: "Stilladser",
                icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18",
                tab: "scaffolding" as TabId,
                color: "text-cyan-600",
                bg: "bg-cyan-50 hover:bg-cyan-100/80",
              },
              {
                label: "Staging",
                icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
                tab: "staging" as TabId,
                color: "text-amber-600",
                bg: "bg-amber-50 hover:bg-amber-100/80",
              },
              {
                label: "Ejendomme",
                icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21",
                tab: "properties" as TabId,
                color: "text-indigo-600",
                bg: "bg-indigo-50 hover:bg-indigo-100/80",
              },
              {
                label: "Research",
                icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5",
                tab: "research" as TabId,
                color: "text-violet-600",
                bg: "bg-violet-50 hover:bg-violet-100/80",
              },
              {
                label: "OOH",
                icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159",
                tab: "ooh" as TabId,
                color: "text-purple-600",
                bg: "bg-purple-50 hover:bg-purple-100/80",
              },
              {
                label: "Email Koe",
                icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75",
                tab: "outreach" as TabId,
                color: "text-rose-600",
                bg: "bg-rose-50 hover:bg-rose-100/80",
              },
              {
                label: "Settings",
                icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z",
                tab: "settings" as TabId,
                color: "text-slate-600",
                bg: "bg-slate-50 hover:bg-slate-100/80",
              },
            ].map((a) => (
              <button
                key={a.label}
                onClick={() => setActiveTab(a.tab)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${a.bg} transition-all text-left group`}
              >
                <svg
                  className={`w-4 h-4 ${a.color} shrink-0`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
                </svg>
                <span className="text-[11px] font-semibold text-slate-700">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Analytics Overview â€“ kun nÃ¥r der er sendt mails */}
      {dashboard?.analytics && totalSent > 0 && (
        <div className="surface-card p-5">
          <h2 className="text-xs font-bold text-slate-900 mb-4 uppercase tracking-wide">Analytics</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
            {[
              { label: "Sendt", value: dashboard.analytics.ooh.totalSent, color: "text-blue-600", dot: "bg-blue-500" },
              { label: "Aabnet", value: dashboard.analytics.ooh.opened, color: "text-violet-600", dot: "bg-violet-500" },
              { label: "Klikket", value: dashboard.analytics.ooh.clicked, color: "text-cyan-600", dot: "bg-cyan-500" },
              { label: "Svar", value: dashboard.analytics.ooh.replied, color: "text-green-600", dot: "bg-green-500" },
              { label: "Moeder", value: dashboard.analytics.ooh.meetings, color: "text-amber-600", dot: "bg-amber-500" },
              { label: "Solgt", value: dashboard.analytics.ooh.sold, color: "text-emerald-600", dot: "bg-emerald-500" },
            ].map((m) => (
              <div key={m.label} className="text-center py-3 px-2 rounded-xl bg-slate-50/80">
                <div className={`text-xl font-extrabold tabular-nums ${m.color}`}>{m.value}</div>
                <div className="flex items-center justify-center gap-1.5 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                  <span className="text-[10px] font-medium text-slate-500">{m.label}</span>
                </div>
              </div>
            ))}
          </div>
          {dashboard.analytics.ooh.totalSent > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {[
                {
                  label: "Open",
                  pct: Math.round(
                    (dashboard.analytics.ooh.opened / Math.max(1, dashboard.analytics.ooh.totalSent)) * 100
                  ),
                  color: "bg-violet-500",
                },
                {
                  label: "Click",
                  pct: Math.round(
                    (dashboard.analytics.ooh.clicked / Math.max(1, dashboard.analytics.ooh.totalSent)) * 100
                  ),
                  color: "bg-cyan-500",
                },
                {
                  label: "Reply",
                  pct: Math.round(
                    (dashboard.analytics.ooh.replied / Math.max(1, dashboard.analytics.ooh.totalSent)) * 100
                  ),
                  color: "bg-green-500",
                },
                {
                  label: "Meeting",
                  pct: Math.round(
                    (dashboard.analytics.ooh.meetings / Math.max(1, dashboard.analytics.ooh.totalSent)) * 100
                  ),
                  color: "bg-amber-500",
                },
              ].map((r) => (
                <div key={r.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500">{r.label}</span>
                    <span className="text-[10px] font-bold text-slate-700">{r.pct}%</span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`${r.color} h-full rounded-full transition-all`}
                      style={{ width: `${Math.max(r.pct, r.pct > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${dashboard.analytics.emailQueue.queued > 0 ? "bg-amber-500 animate-pulse" : "bg-slate-300"}`}
              />
              <span className="text-slate-500">
                Email-koe: <strong className="text-slate-700">{dashboard.analytics.emailQueue.queued}</strong>
              </span>
            </div>
            <span className="text-slate-200">|</span>
            <span className="text-slate-500">
              Sendt:{" "}
              <strong className="text-slate-700">
                {dashboard.analytics.emailQueue.sentThisHour}/{dashboard.analytics.emailQueue.rateLimitPerHour}/t
              </strong>
            </span>
            {dashboard.analytics.emailQueue.failed > 0 && (
              <>
                <span className="text-slate-200">|</span>
                <span className="text-red-500 font-semibold">Fejlet: {dashboard.analytics.emailQueue.failed}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Recent Activity + System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">Seneste ejendomme</h2>
            <button
              onClick={() => setActiveTab("properties")}
              className="text-[10px] font-semibold text-brand-600 hover:underline"
            >
              Se alle
            </button>
          </div>
          {properties.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">
              Ingen ejendomme endnu. Koer en discovery scan for at komme i gang.
            </p>
          ) : (
            <div className="space-y-2">
              {properties.slice(0, 5).map((p) => {
                const sc = getStatusConfig(p.outreachStatus);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setActiveTab("properties");
                      setExpandedProperty(p.id);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left group"
                  >
                    <div className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.name || p.address}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {p.city} Â· {sc.label}
                      </p>
                    </div>
                    {p.outdoorScore != null && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          p.outdoorScore >= 7
                            ? "bg-green-100 text-green-700"
                            : p.outdoorScore >= 4
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {p.outdoorScore}/10
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="surface-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">System Status</h2>
            {systemHealth && (
              <div
                className={`flex items-center gap-1.5 text-[10px] font-semibold ${
                  systemHealth.status === "healthy"
                    ? "text-emerald-600"
                    : systemHealth.status === "degraded"
                      ? "text-amber-600"
                      : "text-red-600"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    systemHealth.status === "healthy"
                      ? "bg-emerald-500"
                      : systemHealth.status === "degraded"
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                />
                {systemHealth.status === "healthy"
                  ? "Alle systemer OK"
                  : systemHealth.status === "degraded"
                    ? "Delvis nedsat"
                    : "Problemer"}
              </div>
            )}
          </div>
          {systemHealth ? (
            <div className="space-y-3">
              {Object.entries(systemHealth.pings || {}).map(([key, ping]) => {
                const p = ping as { ok: boolean; service?: string; latencyMs?: number };
                return (
                  <div key={key} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2 h-2 rounded-full ${p.ok ? "bg-emerald-500" : "bg-red-500"}`}
                      />
                      <span className="text-xs font-medium text-slate-700">{p.service || key}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.latencyMs != null && (
                        <span
                          className={`text-[10px] font-mono ${
                            p.latencyMs < 200
                              ? "text-emerald-600"
                              : p.latencyMs < 500
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {p.latencyMs}ms
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold ${p.ok ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {p.ok ? "OK" : "Fejl"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-500" />
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Aktive processer
            </p>
            <div className="flex flex-wrap gap-2">
              {discoveryRunning && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Discovery koerer
                </span>
              )}
              {scaffoldRunning && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cyan-50 text-cyan-700 text-[10px] font-semibold rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  Stilladser scanner
                </span>
              )}
              {researchRunning && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Research aktiv
                </span>
              )}
              {agentRunning && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-700 text-[10px] font-semibold rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                  Gade-agent aktiv
                </span>
              )}
              {!discoveryRunning && !scaffoldRunning && !researchRunning && !agentRunning && (
                <span className="text-[10px] text-slate-400">Ingen aktive processer</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Full Circle Wizard is rendered at root in page.tsx so it stays open when switching tabs */}
    </div>
  );
}

