"use client";

import type { PropertyItem } from "@/contexts/DashboardContext";
import { getStatusConfig } from "@/lib/statusConfig";
import { ScoreRing } from "./ScoreRing";

export function PropertyCard({
  property: p,
  expanded,
  onToggle,
  onResearch,
  researchRunning,
  onFeedback,
  onCreateProposal,
}: {
  property: PropertyItem;
  expanded: boolean;
  onToggle: () => void;
  onResearch: () => void;
  researchRunning: boolean;
  onFeedback?: (feedback: string) => void;
  onCreateProposal?: () => void;
}) {
  const status = getStatusConfig(p.outreachStatus);
  const hasContact = p.primaryContact?.email;
  const hasOwner = p.ownerCompanyName && p.ownerCompanyName !== "Ukendt";

  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden transition-all duration-200 group/card ${
        expanded
          ? "border-indigo-200/60 shadow-[var(--card-shadow-hover)]"
          : "border-slate-200/50 shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-hover)] hover:border-slate-200"
      }`}
    >
      <div className="flex">
        <div className={`w-1 flex-shrink-0 ${status.stripe}`} />
        <div className="flex-1 min-w-0">
          <div className="px-4 py-3.5 flex items-center gap-3 cursor-pointer" onClick={onToggle}>
            {p.outdoorScore != null && <ScoreRing score={p.outdoorScore} />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13px] text-slate-900 truncate">{p.name || "Unavngivet"}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold ${status.bg} ${status.color}`}>{status.label}</span>
                {hasOwner && <span className="hidden sm:inline text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold">Ejer</span>}
                {hasContact && <span className="hidden sm:inline text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-semibold">Email</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                <span className="truncate">{p.address}, {p.postalCode} {p.city}</span>
                {p.ownerCompanyName && <span className="hidden md:inline text-slate-400">· {p.ownerCompanyName}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(p.outreachStatus === "NY_KRAEVER_RESEARCH" || p.outreachStatus === "FEJL") ? (
                <button onClick={(e) => { e.stopPropagation(); onResearch(); }} disabled={researchRunning}
                  className="text-[10px] px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg shadow-sm disabled:opacity-40 font-bold whitespace-nowrap">
                  {researchRunning ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" /> : "Research"}
                </button>
              ) : (p.outreachStatus !== "RESEARCH_IGANGSAT") && (
                <button onClick={(e) => { e.stopPropagation(); onResearch(); }} disabled={researchRunning}
                  className="text-[10px] px-2.5 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-40 font-semibold whitespace-nowrap">
                  {researchRunning ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-200 border-t-indigo-600" /> : "Re-research"}
                </button>
              )}
              {onCreateProposal && (
                <button onClick={(e) => { e.stopPropagation(); onCreateProposal(); }}
                  className="text-[10px] px-2.5 py-1.5 border border-violet-200 text-violet-600 rounded-lg hover:bg-violet-50 font-semibold whitespace-nowrap">OOH</button>
              )}
              <svg className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>

          {expanded && (
            <div className="border-t border-slate-100 animate-slide-down">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-cyan-50 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Research</h4>
                  </div>
                  {p.researchSummary ? (
                    <p className="text-[13px] text-slate-600 leading-relaxed">{p.researchSummary}</p>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <p className="text-sm italic">Ingen research endnu</p>
                    </div>
                  )}
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-purple-50 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Kontakt</h4>
                  </div>
                  {p.primaryContact ? (
                    <div className="space-y-2">
                      <div className="font-semibold text-sm text-slate-800">{p.primaryContact.name || "Ukendt"}</div>
                      {p.primaryContact.role && (
                        <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-[10px] font-semibold text-purple-700">{p.primaryContact.role}</div>
                      )}
                      {p.primaryContact.email ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          <span className="text-[12px] text-brand-600 font-medium">{p.primaryContact.email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-1 text-amber-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                          <span className="text-[12px] font-medium">Email mangler</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                      </svg>
                      <p className="text-sm italic">Ingen kontakt fundet</p>
                    </div>
                  )}
                </div>

                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Email-udkast</h4>
                  </div>
                  {p.emailDraftSubject ? (
                    <div>
                      <div className="text-sm font-semibold text-slate-800 mb-2">{p.emailDraftSubject}</div>
                      <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[12px] text-slate-500 leading-relaxed line-clamp-5">{p.emailDraftBody}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" />
                      </svg>
                      <p className="text-sm italic">Intet udkast endnu</p>
                    </div>
                  )}
                </div>
              </div>

              {onFeedback && (
                <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between bg-slate-50/50">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Feedback</span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { key: "good_lead", label: "God lead", color: "text-emerald-600 hover:bg-emerald-50 border-emerald-200", icon: "M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V2.75a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" },
                      { key: "irrelevant", label: "Irrelevant", color: "text-slate-500 hover:bg-slate-100 border-slate-200", icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" },
                      { key: "too_small", label: "For lille", color: "text-amber-600 hover:bg-amber-50 border-amber-200", icon: "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" },
                      { key: "wrong_owner", label: "Forkert ejer", color: "text-red-500 hover:bg-red-50 border-red-200", icon: "M12 9v3.75m9-.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" },
                      { key: "needs_reresearch", label: "Re-research", color: "text-blue-500 hover:bg-blue-50 border-blue-200", icon: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" },
                    ].map((fb) => (
                      <button
                        key={fb.key}
                        onClick={(e) => { e.stopPropagation(); onFeedback(fb.key); }}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border rounded-lg transition-colors ${fb.color}`}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d={fb.icon} />
                        </svg>
                        {fb.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
