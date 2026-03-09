"use client";

// ============================================================
// Lead Scanner Tab – reviews inbox leads not in HubSpot
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import type { LeadCandidate, CandidateStatus } from "@/lib/leads/candidate-store";

type Priority = "high" | "medium" | "low";

interface CandidateWithPriority extends LeadCandidate {
  priority: Priority;
}

interface CandidateStats {
  total: number;
  needs_review: number;
  approved: number;
  rejected: number;
  synced: number;
  high: number;
  medium: number;
  low: number;
}

interface ScanResult {
  scanRunId: string;
  total: number;
  newCandidates: number;
  matched: number;
  filtered: number;
  highPriority: number;
  mediumPriority: number;
}

// ─── Helpers ─────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 60) return "text-red-600 bg-red-50 border-red-200";
  if (score >= 30) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-slate-500 bg-slate-50 border-slate-200";
}

function scoreDots(score: number) {
  const filled = score >= 60 ? 3 : score >= 30 ? 2 : 1;
  const color = score >= 60 ? "bg-red-500" : score >= 30 ? "bg-amber-400" : "bg-slate-300";
  return Array.from({ length: 3 }, (_, i) => (
    <span
      key={i}
      className={`inline-block w-2 h-2 rounded-full ${i < filled ? color : "bg-slate-200"}`}
    />
  ));
}

function priorityLabel(p: Priority) {
  if (p === "high") return { label: "Høj", cls: "text-red-700 bg-red-50" };
  if (p === "medium") return { label: "Medium", cls: "text-amber-700 bg-amber-50" };
  return { label: "Lav", cls: "text-slate-600 bg-slate-100" };
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "i dag";
  if (diffDays === 1) return "i går";
  if (diffDays < 7) return `${diffDays}d siden`;
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

// ─── Main component ───────────────────────────────────────────

export function LeadScannerTab() {
  const [candidates, setCandidates] = useState<CandidateWithPriority[]>([]);
  const [stats, setStats] = useState<CandidateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<CandidateWithPriority | null>(null);
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | "all">("needs_review");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/leads/candidates${q}`);
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json() as { candidates: CandidateWithPriority[]; stats: CandidateStats };
      setCandidates(data.candidates);
      setStats(data.stats);
    } catch {
      showToast("Kunne ikke hente kandidater", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const triggerScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/leads/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxThreads: 300 }),
      });
      const data = await res.json() as ScanResult;
      setLastScan(data);
      showToast(`Scan færdig: ${data.newCandidates} nye leads fundet`);
      await fetchCandidates();
    } catch {
      showToast("Scan fejlede", "error");
    } finally {
      setScanning(false);
    }
  };

  const approve = async (c: CandidateWithPriority) => {
    setActionLoading(c.id);
    try {
      const res = await fetch(`/api/leads/${c.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
      showToast(`${c.full_name || c.email} godkendt`);
      if (selected?.id === c.id) setSelected(null);
      await fetchCandidates();
    } catch {
      showToast("Godkendelse fejlede", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const reject = async (c: CandidateWithPriority) => {
    setActionLoading(c.id);
    try {
      const res = await fetch(`/api/leads/${c.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
      showToast(`${c.full_name || c.email} afvist`);
      if (selected?.id === c.id) setSelected(null);
      await fetchCandidates();
    } catch {
      showToast("Afvisning fejlede", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const syncHubSpot = async (c: CandidateWithPriority) => {
    setActionLoading(c.id);
    try {
      const res = await fetch(`/api/leads/${c.id}/sync-hubspot`, { method: "POST" });
      const data = await res.json() as { hubspotUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Sync fejlede");
      showToast(`Oprettet i HubSpot`);
      if (data.hubspotUrl) window.open(data.hubspotUrl, "_blank");
      await fetchCandidates();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Sync fejlede", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
      return true;
    });
  }, [candidates, priorityFilter]);

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 gap-0 relative">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border animate-fade-in ${
          toast.type === "success"
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ─── Main panel ─── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-1 py-3 flex-shrink-0 border-b border-slate-200/60">
          <div className="flex items-center gap-3">
            <button
              onClick={triggerScan}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              {scanning ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Scanner indbakke...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  Scan indbakke for leads
                </>
              )}
            </button>

            {lastScan && !scanning && (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                Sidst scan: <span className="font-semibold text-slate-700">{lastScan.newCandidates} nye</span>
                {" · "}{lastScan.matched} i HubSpot allerede
                {" · "}{lastScan.filtered} filtreret
              </div>
            )}
          </div>

          {/* Stats chips */}
          {stats && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">{stats.needs_review} til review</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-green-600 font-medium">{stats.synced} i HubSpot</span>
            </div>
          )}
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 px-1 py-2.5 flex-shrink-0 border-b border-slate-100">
          {/* Status filter */}
          <div className="flex items-center gap-1">
            {(["needs_review", "approved", "synced", "rejected", "all"] as const).map((s) => {
              const labels: Record<string, string> = {
                needs_review: `Review (${stats?.needs_review ?? 0})`,
                approved: `Godkendt (${stats?.approved ?? 0})`,
                synced: `I HubSpot (${stats?.synced ?? 0})`,
                rejected: `Afvist (${stats?.rejected ?? 0})`,
                all: `Alle (${stats?.total ?? 0})`,
              };
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    statusFilter === s
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>

          <div className="w-px h-4 bg-slate-200 mx-1" />

          {/* Priority filter */}
          <div className="flex items-center gap-1">
            {(["all", "high", "medium", "low"] as const).map((p) => {
              const pLabels: Record<string, string> = {
                all: "Alle prioriteter",
                high: `Høj (${stats?.high ?? 0})`,
                medium: `Medium (${stats?.medium ?? 0})`,
                low: `Lav (${stats?.low ?? 0})`,
              };
              const active = priorityFilter === p;
              const dotCls = p === "high" ? "bg-red-500" : p === "medium" ? "bg-amber-400" : p === "low" ? "bg-slate-400" : "";
              return (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    active ? "bg-slate-800 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {p !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />}
                  {pLabels[p]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-y-auto scroll-slim">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Indlæser...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-600">Ingen leads her endnu</p>
              <p className="text-xs text-slate-400 mt-1">Klik "Scan indbakke" for at finde nye leads</p>
            </div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/60 sticky top-0 z-10">
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-8" />
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Navn / Email</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Virksomhed</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Konto</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Score</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Dato</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-28" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isLoading = actionLoading === c.id;
                  const { label: prioLabel, cls: prioCls } = priorityLabel(c.priority);
                  const isSelected = selected?.id === c.id;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelected(isSelected ? null : c)}
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${
                        isSelected ? "bg-indigo-50" : "hover:bg-slate-50/80"
                      }`}
                    >
                      {/* Priority dot */}
                      <td className="px-3 py-2.5">
                        <span className={`inline-block w-2 h-2 rounded-full ${
                          c.priority === "high" ? "bg-red-500" :
                          c.priority === "medium" ? "bg-amber-400" : "bg-slate-300"
                        }`} />
                      </td>

                      {/* Name + email */}
                      <td className="px-3 py-2.5 max-w-[200px]">
                        <div className="font-semibold text-slate-800 truncate">
                          {c.full_name || c.email}
                        </div>
                        {c.full_name && (
                          <div className="text-[11px] text-slate-400 truncate">{c.email}</div>
                        )}
                      </td>

                      {/* Company */}
                      <td className="px-3 py-2.5 max-w-[160px]">
                        {c.company_name ? (
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-slate-700 font-medium">{c.company_name}</span>
                            {c.hubspot_company_found && (
                              <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">HS</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                        {c.domain && <div className="text-[11px] text-slate-400">{c.domain}</div>}
                      </td>

                      {/* Account */}
                      <td className="px-3 py-2.5">
                        <span className="text-[11px] text-slate-500 truncate max-w-[100px] block">
                          {c.source_account.split("@")[0]}
                        </span>
                      </td>

                      {/* Score */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${scoreColor(c.lead_score)}`}>
                            {c.lead_score}
                          </span>
                          <span className="flex gap-0.5">{scoreDots(c.lead_score)}</span>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                        {formatDate(c.first_seen_at)}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        {c.status === "needs_review" && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${prioCls}`}>
                            {prioLabel}
                          </span>
                        )}
                        {c.status === "approved" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Godkendt</span>
                        )}
                        {c.status === "synced" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">I HubSpot</span>
                        )}
                        {c.status === "rejected" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Afvist</span>
                        )}
                      </td>

                      {/* Quick actions */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                          {c.status === "needs_review" && (
                            <>
                              <button
                                onClick={() => approve(c)}
                                disabled={isLoading}
                                title="Godkend"
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                              </button>
                              <button
                                onClick={() => reject(c)}
                                disabled={isLoading}
                                title="Afvis"
                                className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </>
                          )}
                          {c.status === "approved" && (
                            <button
                              onClick={() => syncHubSpot(c)}
                              disabled={isLoading}
                              title="Tilføj til HubSpot"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                              {isLoading ? (
                                <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />
                              ) : (
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                                </svg>
                              )}
                              HubSpot
                            </button>
                          )}
                          {c.status === "synced" && c.hubspot_contact_id && (
                            <a
                              href={`https://app.hubspot.com/contacts/${c.hubspot_contact_id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-colors"
                              title="Åbn i HubSpot"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── Side panel ─── */}
      {selected && (
        <div className="w-80 flex-shrink-0 border-l border-slate-200 flex flex-col min-h-0 bg-white">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
            <span className="text-sm font-bold text-slate-800">Lead detaljer</span>
            <button
              onClick={() => setSelected(null)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scroll-slim p-4 space-y-4">
            {/* Identity */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Identitet</div>
              <div className="space-y-1.5">
                {selected.full_name && (
                  <div className="flex gap-2 text-sm">
                    <span className="text-slate-400 w-20 shrink-0">Navn</span>
                    <span className="font-semibold text-slate-800">{selected.full_name}</span>
                  </div>
                )}
                <div className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-20 shrink-0">Email</span>
                  <span className="text-slate-700 break-all">{selected.email}</span>
                </div>
                {selected.company_name && (
                  <div className="flex gap-2 text-sm">
                    <span className="text-slate-400 w-20 shrink-0">Firma</span>
                    <span className="text-slate-700">{selected.company_name}</span>
                  </div>
                )}
                {selected.domain && (
                  <div className="flex gap-2 text-sm">
                    <span className="text-slate-400 w-20 shrink-0">Domæne</span>
                    <a href={`https://${selected.domain}`} target="_blank" rel="noreferrer"
                      className="text-indigo-600 hover:underline">
                      {selected.domain}
                    </a>
                  </div>
                )}
                {selected.job_title && (
                  <div className="flex gap-2 text-sm">
                    <span className="text-slate-400 w-20 shrink-0">Titel</span>
                    <span className="text-slate-700">{selected.job_title}</span>
                  </div>
                )}
                {selected.phone && (
                  <div className="flex gap-2 text-sm">
                    <span className="text-slate-400 w-20 shrink-0">Telefon</span>
                    <span className="text-slate-700">{selected.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Email context */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Mailkontext</div>
              <div className="space-y-1.5">
                <div className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-20 shrink-0">Emne</span>
                  <span className="text-slate-700 text-xs">{selected.subject}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-20 shrink-0">Konto</span>
                  <span className="text-slate-600 text-xs">{selected.source_account}</span>
                </div>
                <div className="flex gap-2 text-sm">
                  <span className="text-slate-400 w-20 shrink-0">Dato</span>
                  <span className="text-slate-600 text-xs">{formatDate(selected.first_seen_at)}</span>
                </div>
              </div>
            </div>

            {/* HubSpot status */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">HubSpot</div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${selected.hubspot_contact_found ? "bg-red-400" : "bg-emerald-400"}`} />
                  <span className="text-slate-600">
                    {selected.hubspot_contact_found ? "Kontakt fundet (eksisterer allerede)" : "Kontakt ikke fundet — ny lead"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full ${selected.hubspot_company_found ? "bg-amber-400" : "bg-slate-300"}`} />
                  <span className="text-slate-600">
                    {selected.hubspot_company_found ? "Virksomhed domæne-match fundet" : "Virksomhed ikke i HubSpot"}
                  </span>
                </div>
              </div>
            </div>

            {/* Score breakdown */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Score: {selected.lead_score}/100
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                <div
                  className={`h-1.5 rounded-full transition-all ${
                    selected.lead_score >= 60 ? "bg-red-500" :
                    selected.lead_score >= 30 ? "bg-amber-400" : "bg-slate-400"
                  }`}
                  style={{ width: `${selected.lead_score}%` }}
                />
              </div>
              <ul className="space-y-1">
                {selected.score_reasons.map((r, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                    <span className="text-slate-300 mt-0.5">·</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Panel actions */}
          {selected.status === "needs_review" && (
            <div className="p-3 border-t border-slate-200 flex gap-2 flex-shrink-0">
              <button
                onClick={() => approve(selected)}
                disabled={actionLoading === selected.id}
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                Godkend
              </button>
              <button
                onClick={() => reject(selected)}
                disabled={actionLoading === selected.id}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
              >
                Afvis
              </button>
            </div>
          )}
          {selected.status === "approved" && (
            <div className="p-3 border-t border-slate-200 flex-shrink-0">
              <button
                onClick={() => syncHubSpot(selected)}
                disabled={actionLoading === selected.id}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {actionLoading === selected.id ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                )}
                Tilføj til HubSpot
              </button>
            </div>
          )}
          {selected.status === "synced" && (
            <div className="p-3 border-t border-slate-200 flex-shrink-0">
              <a
                href={`https://app.hubspot.com/contacts/${selected.hubspot_contact_id}`}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                Åbn i HubSpot
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
