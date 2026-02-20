"use client";

import { useDashboard } from "@/contexts/DashboardContext";
import type { TabId } from "@/contexts/DashboardContext";
import { getStatusConfig } from "@/lib/statusConfig";
import { formatPropertyTitle } from "@/lib/format-address";

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
  scaffoldCity = "København",
}: HomeTabProps) {
  const {
    setActiveTab,
    dashboard,
    properties,
    scaffoldPeriodCounts,
    systemHealth,
  } = useDashboard();

  const stilladsSectionTitle = "Stilladser (dagen før)";

  return (
    <div className="animate-fade-in w-full max-w-full">
      {/* Kun Full Circle-knap – sidens titel står i layout */}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setFullCircleOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-semibold shadow-md hover:shadow-lg transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
          </svg>
          Full Circle
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          {
            label: "Ejendomme",
            value: dashboard?.totalProperties ?? 0,
            icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75",
            gradient: "from-indigo-500 to-blue-600",
            ring: "ring-indigo-100",
            textColor: "text-indigo-700",
            bgColor: "bg-indigo-50/80",
          },
          {
            label: "Afventer research",
            value: dashboard?.pendingResearch ?? 0,
            icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
            gradient: "from-amber-500 to-orange-500",
            ring: "ring-amber-100",
            textColor: "text-amber-700",
            bgColor: "bg-amber-50/80",
          },
          {
            label: "Klar til udsendelse",
            value: dashboard?.readyToSend ?? 0,
            icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
            gradient: "from-emerald-500 to-green-600",
            ring: "ring-emerald-100",
            textColor: "text-emerald-700",
            bgColor: "bg-emerald-50/80",
          },
          {
            label: "Mails sendt",
            value: dashboard?.mailsSent ?? 0,
            icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
            gradient: "from-violet-500 to-purple-600",
            ring: "ring-violet-100",
            textColor: "text-violet-700",
            bgColor: "bg-violet-50/80",
          },
          {
            label: "Nye stillads ansøgninger (dagen før)",
            value: dashboard?.scaffoldingNewApplications?.previousDay ?? scaffoldPeriodCounts?.previousDay ?? "—",
            icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18",
            gradient: "from-cyan-500 to-teal-600",
            ring: "ring-cyan-100",
            textColor: "text-cyan-700",
            bgColor: "bg-cyan-50/80",
            isStillads: true,
          },
        ].map((kpi, ki) => {
          const Wrapper = kpi.isStillads ? "button" : "div";
          return (
            <Wrapper
              key={kpi.label}
              {...(kpi.isStillads ? { onClick: () => setActiveTab("scaffolding" as TabId) } : {})}
              className={`relative ${kpi.bgColor} rounded-2xl p-5 overflow-hidden card-hover border border-white/60 ring-1 ${kpi.ring} text-left ${kpi.isStillads ? "cursor-pointer hover:shadow-md" : ""}`}
              style={{ animationDelay: `${ki * 80}ms` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold text-slate-500/80 uppercase tracking-wider">{kpi.label}</p>
                  <p className={`text-3xl font-extrabold tabular-nums mt-2 tracking-tight ${kpi.textColor}`}>
                    {kpi.value}
                  </p>
                  {kpi.isStillads && (dashboard?.scaffoldingNewApplications?.at || scaffoldPeriodCounts?.at) && (
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      Live · opdateres hvert 10. min
                    </p>
                  )}
                  {kpi.isStillads && !dashboard?.scaffoldingNewApplications && !scaffoldPeriodCounts && (
                    <p className="text-[9px] text-slate-400 mt-0.5">Kør scan under Stilladser</p>
                  )}
                </div>
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center shadow-lg`}
                >
                  <svg
                    className="w-5 h-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={kpi.icon} />
                  </svg>
                </div>
              </div>
              <div
                className={`absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-gradient-to-br ${kpi.gradient} opacity-[0.07] blur-2xl`}
              />
            </Wrapper>
          );
        })}
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
          className="w-full flex items-center gap-4 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200/50 px-5 py-4 mb-6 hover:shadow-lg transition-all group card-hover"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/20">
            <span className="text-lg font-bold text-white">{dashboard?.staging?.awaitingAction || 0}</span>
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-amber-900">
              Ejendom{(dashboard?.staging?.awaitingAction || 0) !== 1 ? "me" : ""} afventer godkendelse
            </p>
            <p className="text-xs text-amber-600/80 mt-0.5">
              {(dashboard?.staging?.new || 0) > 0 && `${dashboard?.staging?.new} nye`}
              {(dashboard?.staging?.researched || 0) > 0 && ` · ${dashboard?.staging?.researched} klar`}
              {(dashboard?.staging?.researching || 0) > 0 && ` · ${dashboard?.staging?.researching} researching`}
            </p>
          </div>
          <svg
            className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition-transform"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      )}

      {/* Funnel */}
      {dashboard?.analytics?.funnel && (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-6">
          <h2 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </span>
            Funnel
          </h2>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {[
              { key: "discovered", label: "Fundet", value: dashboard.analytics.funnel.discovered, color: "bg-slate-100 text-slate-700" },
              { key: "staged", label: "Staging", value: dashboard.analytics.funnel.staged, color: "bg-amber-100 text-amber-700" },
              { key: "inHubSpot", label: "HubSpot", value: dashboard.analytics.funnel.inHubSpot, color: "bg-blue-100 text-blue-700" },
              { key: "ready", label: "Klar", value: dashboard.analytics.funnel.ready, color: "bg-emerald-100 text-emerald-700" },
              { key: "sent", label: "Sendt", value: dashboard.analytics.funnel.sent, color: "bg-violet-100 text-violet-700" },
            ].map((step, i) => (
              <div key={step.key} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-300 hidden sm:inline">→</span>}
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums ${step.color}`}>
                  {step.label}: {step.value}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-2">Sendt = antal med første mail sendt (hele tiden)</p>
        </div>
      )}

      {/* I dag – Hvad skal jeg gøre i dag? */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          I dag – hvad skal jeg gøre?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setActiveTab("staging")}
            className="flex items-center gap-3 rounded-xl border border-slate-200/80 p-4 text-left hover:bg-amber-50/50 hover:border-amber-200 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-amber-700">{dashboard?.staging?.awaitingAction ?? 0}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">I Staging</p>
              <p className="text-[11px] text-slate-500">Godkend & generer mail</p>
            </div>
            <svg className="w-4 h-4 text-slate-300 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <button
            onClick={() => { setActiveTab("outreach"); setStatusFilter("ready"); }}
            className="flex items-center gap-3 rounded-xl border border-slate-200/80 p-4 text-left hover:bg-emerald-50/50 hover:border-emerald-200 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-emerald-700">{dashboard?.readyToSend ?? 0}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Klar til mail</p>
              <p className="text-[11px] text-slate-500">Send første mail</p>
            </div>
            <svg className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
          <button
            onClick={() => setActiveTab("scaffolding")}
            className="flex items-center gap-3 rounded-xl border border-slate-200/80 p-4 text-left hover:bg-cyan-50/50 hover:border-cyan-200 transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-cyan-700">
                {typeof (dashboard?.scaffoldingNewApplications?.previousDay ?? scaffoldPeriodCounts?.previousDay) === "number"
                  ? (dashboard?.scaffoldingNewApplications?.previousDay ?? scaffoldPeriodCounts?.previousDay)
                  : "—"}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Nye stillads ansøgninger</p>
              <p className="text-[11px] text-slate-500">Dagen før · opdateres hvert 10. min</p>
            </div>
            <svg className="w-4 h-4 text-slate-300 group-hover:text-cyan-500 group-hover:translate-x-0.5 transition-all" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Visual Pipeline */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-bold text-slate-900">Pipeline</h2>
          <span className="text-[10px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
            Discovery → Research → Approve → Send
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
        {properties.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-8 text-[10px] text-slate-500">
            {(() => {
              const total = properties.length || 1;
              const ready = properties.filter((p) => p.outreachStatus === "KLAR_TIL_UDSENDELSE").length;
              const sent = properties.filter((p) => p.outreachStatus === "FOERSTE_MAIL_SENDT").length;
              return (
                <>
                  <span>
                    Research → Klar{" "}
                    <strong className="text-slate-700 ml-1">{Math.round((ready / total) * 100)}%</strong>
                  </span>
                  <span className="w-px h-3 bg-slate-200" />
                  <span>
                    Klar → Sendt{" "}
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
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5">
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
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5">
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

      {/* Analytics Overview */}
      {dashboard?.analytics && (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-6">
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
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
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
                        {p.city} · {sc.label}
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
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
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
