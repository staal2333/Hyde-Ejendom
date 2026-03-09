"use client";

// ============================================================
// Lead Scanner Tab – reviews inbox leads not in HubSpot
// ============================================================

import { useState, useEffect, useCallback, useMemo } from "react";
import type { LeadCandidate, CandidateStatus } from "@/lib/leads/candidate-store";
import type { HubSpotContact } from "@/app/api/leads/hubspot-contacts/route";

type Priority = "high" | "medium" | "low";
type MainTab = "scanner" | "hubspot";

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
  scannedFrom?: string;
  scannedMonths?: number;
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
    <span key={i} className={`inline-block w-2 h-2 rounded-full ${i < filled ? color : "bg-slate-200"}`} />
  ));
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "i dag";
  if (diffDays === 1) return "i går";
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}u`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}md`;
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "2-digit" });
}

function lifecycleLabel(stage: string | null) {
  const map: Record<string, { label: string; cls: string }> = {
    lead: { label: "Lead", cls: "bg-blue-50 text-blue-700" },
    marketingqualifiedlead: { label: "MQL", cls: "bg-indigo-50 text-indigo-700" },
    salesqualifiedlead: { label: "SQL", cls: "bg-violet-50 text-violet-700" },
    opportunity: { label: "Opportunity", cls: "bg-amber-50 text-amber-700" },
    customer: { label: "Kunde", cls: "bg-green-50 text-green-700" },
    subscriber: { label: "Subscriber", cls: "bg-slate-100 text-slate-600" },
    other: { label: "Anden", cls: "bg-slate-100 text-slate-500" },
  };
  if (!stage) return null;
  return map[stage.toLowerCase()] ?? { label: stage, cls: "bg-slate-100 text-slate-500" };
}

// ─── Main component ───────────────────────────────────────────

export function LeadScannerTab() {
  const [mainTab, setMainTab] = useState<MainTab>("scanner");

  // Scanner state
  const [candidates, setCandidates] = useState<CandidateWithPriority[]>([]);
  const [stats, setStats] = useState<CandidateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<CandidateWithPriority | null>(null);
  const [statusFilter, setStatusFilter] = useState<CandidateStatus | "all">("needs_review");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // HubSpot contacts state
  const [hsContacts, setHsContacts] = useState<HubSpotContact[]>([]);
  const [hsLoading, setHsLoading] = useState(false);
  const [hsSearch, setHsSearch] = useState("");
  const [hsSelected, setHsSelected] = useState<HubSpotContact | null>(null);
  const [hsTotal, setHsTotal] = useState(0);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── Fetch candidates ────────────────────────────────────────

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

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  // ─── Fetch HubSpot contacts ──────────────────────────────────

  const fetchHsContacts = useCallback(async (search = "") => {
    setHsLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/leads/hubspot-contacts${q}`);
      if (!res.ok) throw new Error("Fetch failed");
      const data = await res.json() as { contacts: HubSpotContact[]; total: number };
      setHsContacts(data.contacts);
      setHsTotal(data.total);
    } catch {
      showToast("Kunne ikke hente HubSpot kontakter", "error");
    } finally {
      setHsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab === "hubspot" && hsContacts.length === 0) {
      fetchHsContacts();
    }
  }, [mainTab, hsContacts.length, fetchHsContacts]);

  // ─── Scan ────────────────────────────────────────────────────

  const triggerScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/leads/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxThreads: 2000, months: 12 }),
      });
      const data = await res.json() as ScanResult;
      setLastScan(data);
      showToast(`Scan færdig: ${data.newCandidates} nye leads fundet (${data.matched} allerede i HubSpot)`);
      await fetchCandidates();
    } catch {
      showToast("Scan fejlede", "error");
    } finally {
      setScanning(false);
    }
  };

  // ─── Actions ─────────────────────────────────────────────────

  const approveAndSync = async (c: CandidateWithPriority) => {
    setActionLoading(c.id);
    try {
      const res = await fetch(`/api/leads/${c.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncNow: true }),
      });
      const data = await res.json() as { hubspotUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Fejlede");
      showToast(`${c.full_name || c.email} tilføjet til HubSpot`);
      if (selected?.id === c.id) setSelected(null);
      await fetchCandidates();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Fejl", "error");
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

  // ─── Filter ──────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (priorityFilter !== "all" && c.priority !== priorityFilter) return false;
      return true;
    });
  }, [candidates, priorityFilter]);

  const hsFiltered = useMemo(() => {
    if (!hsSearch) return hsContacts;
    const q = hsSearch.toLowerCase();
    return hsContacts.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.company ?? "").toLowerCase().includes(q)
    );
  }, [hsContacts, hsSearch]);

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border animate-fade-in ${
          toast.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ─── Top bar ─── */}
      <div className="flex items-center justify-between gap-4 px-1 py-3 flex-shrink-0 border-b border-slate-200/60">
        {/* Main tabs */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMainTab("scanner")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mainTab === "scanner" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            Lead Scanner
            {(stats?.needs_review ?? 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                {stats?.needs_review}
              </span>
            )}
          </button>
          <button
            onClick={() => setMainTab("hubspot")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mainTab === "hubspot" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
            HubSpot Kontakter
            {hsTotal > 0 && (
              <span className="text-[11px] text-slate-400 font-normal">{hsTotal}</span>
            )}
          </button>
        </div>

        {/* Scan button (only on scanner tab) */}
        {mainTab === "scanner" && (
          <div className="flex items-center gap-3">
            {lastScan && !scanning && (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 hidden sm:block">
                <span className="font-semibold text-slate-700">{lastScan.newCandidates} nye leads</span>
                {" · "}{lastScan.matched} i HubSpot
                {" · "}{lastScan.filtered} filtreret
                {lastScan.scannedFrom && <> · fra {lastScan.scannedFrom}</>}
              </div>
            )}
            <button
              onClick={triggerScan}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
            >
              {scanning ? (
                <>
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Scanner 12 måneder...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                  Scan 12 måneder
                </>
              )}
            </button>
          </div>
        )}

        {/* HubSpot search */}
        {mainTab === "hubspot" && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                placeholder="Søg kontakter..."
                value={hsSearch}
                onChange={(e) => setHsSearch(e.target.value)}
                className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </div>
            <button
              onClick={() => fetchHsContacts(hsSearch)}
              className="px-3 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Opdater
            </button>
          </div>
        )}
      </div>

      {/* ─── Scanner tab ─── */}
      {mainTab === "scanner" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main list */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            {/* Filter bar */}
            <div className="flex items-center gap-2 px-1 py-2.5 flex-shrink-0 border-b border-slate-100 overflow-x-auto">
              <div className="flex items-center gap-1 flex-shrink-0">
                {(["needs_review", "approved", "synced", "rejected", "all"] as const).map((s) => {
                  const labels: Record<string, string> = {
                    needs_review: `Review (${stats?.needs_review ?? 0})`,
                    approved: `Godkendt (${stats?.approved ?? 0})`,
                    synced: `I HubSpot (${stats?.synced ?? 0})`,
                    rejected: `Afvist (${stats?.rejected ?? 0})`,
                    all: `Alle (${stats?.total ?? 0})`,
                  };
                  return (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        statusFilter === s ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}>
                      {labels[s]}
                    </button>
                  );
                })}
              </div>
              <div className="w-px h-4 bg-slate-200 mx-1 flex-shrink-0" />
              <div className="flex items-center gap-1 flex-shrink-0">
                {(["all", "high", "medium", "low"] as const).map((p) => {
                  const pLabels: Record<string, string> = {
                    all: "Alle",
                    high: `Høj (${stats?.high ?? 0})`,
                    medium: `Medium (${stats?.medium ?? 0})`,
                    low: `Lav (${stats?.low ?? 0})`,
                  };
                  const dotCls = p === "high" ? "bg-red-500" : p === "medium" ? "bg-amber-400" : p === "low" ? "bg-slate-400" : "";
                  return (
                    <button key={p} onClick={() => setPriorityFilter(p)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        priorityFilter === p ? "bg-slate-800 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}>
                      {p !== "all" && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />}
                      {pLabels[p]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-y-auto scroll-slim">
              {loading ? (
                <div className="p-8 text-center">
                  <div className="w-6 h-6 mx-auto rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                  <p className="text-sm text-slate-400 mt-3">Indlæser kandidater...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-slate-600">Ingen leads endnu</p>
                  <p className="text-xs text-slate-400 mt-1">Klik "Scan 12 måneder" for at finde leads fra din indbakke</p>
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/60 sticky top-0 z-10">
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-3" />
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Navn / Email</th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Virksomhed</th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Konto</th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Score</th>
                      <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Dato</th>
                      <th className="text-right px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-36">Handling</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => {
                      const isLoading = actionLoading === c.id;
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
                          <td className="px-3 py-2.5 max-w-[180px]">
                            <div className="font-semibold text-slate-800 truncate text-xs">{c.full_name || c.email}</div>
                            {c.full_name && <div className="text-[11px] text-slate-400 truncate">{c.email}</div>}
                          </td>

                          {/* Company */}
                          <td className="px-3 py-2.5 max-w-[140px]">
                            {c.company_name ? (
                              <div className="flex items-center gap-1">
                                <span className="truncate text-slate-700 text-xs font-medium">{c.company_name}</span>
                                {c.hubspot_company_found && (
                                  <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">HS</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-300 text-xs">{c.domain ?? "—"}</span>
                            )}
                          </td>

                          {/* Account */}
                          <td className="px-3 py-2.5 hidden sm:table-cell">
                            <span className="text-[11px] text-slate-400">{c.source_account.split("@")[0]}</span>
                          </td>

                          {/* Score */}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full border ${scoreColor(c.lead_score)}`}>
                                {c.lead_score}
                              </span>
                              <span className="flex gap-0.5">{scoreDots(c.lead_score)}</span>
                            </div>
                          </td>

                          {/* Date */}
                          <td className="px-3 py-2.5 text-xs text-slate-400 whitespace-nowrap hidden md:table-cell">
                            {formatDate(c.first_seen_at)}
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1 justify-end">
                              {c.status === "needs_review" && (
                                <>
                                  <button
                                    onClick={() => approveAndSync(c)}
                                    disabled={isLoading}
                                    title="Tilføj til HubSpot"
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                  >
                                    {isLoading ? (
                                      <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />
                                    ) : (
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                      </svg>
                                    )}
                                    HubSpot
                                  </button>
                                  <button
                                    onClick={() => reject(c)}
                                    disabled={isLoading}
                                    title="Afvis"
                                    className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </>
                              )}
                              {c.status === "synced" && (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">I HubSpot ✓</span>
                                  {c.hubspot_contact_id && (
                                    <a href={`https://app.hubspot.com/contacts/${c.hubspot_contact_id}`}
                                      target="_blank" rel="noreferrer"
                                      className="p-1 rounded text-indigo-400 hover:text-indigo-600 transition-colors">
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                      </svg>
                                    </a>
                                  )}
                                </div>
                              )}
                              {c.status === "approved" && (
                                <button
                                  onClick={() => approveAndSync(c)}
                                  disabled={isLoading}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                >
                                  {isLoading ? <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" /> : null}
                                  Sync HubSpot
                                </button>
                              )}
                              {c.status === "rejected" && (
                                <span className="text-[10px] text-slate-400">Afvist</span>
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

          {/* Side panel */}
          {selected && (
            <div className="w-72 flex-shrink-0 border-l border-slate-200 flex flex-col min-h-0 bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
                <span className="text-sm font-bold text-slate-800">Detaljer</span>
                <button onClick={() => setSelected(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto scroll-slim p-4 space-y-4">
                {/* Identity */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Identitet</div>
                  <div className="space-y-1.5 text-sm">
                    {selected.full_name && (
                      <div className="flex gap-2">
                        <span className="text-slate-400 w-16 shrink-0 text-xs">Navn</span>
                        <span className="font-semibold text-slate-800 text-xs">{selected.full_name}</span>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <span className="text-slate-400 w-16 shrink-0 text-xs">Email</span>
                      <span className="text-slate-700 break-all text-xs">{selected.email}</span>
                    </div>
                    {selected.company_name && (
                      <div className="flex gap-2">
                        <span className="text-slate-400 w-16 shrink-0 text-xs">Firma</span>
                        <span className="text-slate-700 text-xs">{selected.company_name}</span>
                      </div>
                    )}
                    {selected.domain && (
                      <div className="flex gap-2">
                        <span className="text-slate-400 w-16 shrink-0 text-xs">Domæne</span>
                        <a href={`https://${selected.domain}`} target="_blank" rel="noreferrer"
                          className="text-indigo-600 hover:underline text-xs">{selected.domain}</a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Mail context */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Mail</div>
                  <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 space-y-1">
                    <div className="font-medium text-slate-800">{selected.subject}</div>
                    <div className="text-[11px] text-slate-400">{selected.source_account} · {formatDate(selected.first_seen_at)}</div>
                  </div>
                </div>

                {/* HubSpot match */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">HubSpot match</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`w-2 h-2 rounded-full ${selected.hubspot_company_found ? "bg-amber-400" : "bg-slate-200"}`} />
                      <span className="text-slate-600">{selected.hubspot_company_found ? "Virksomhed domæne-match" : "Ingen virksomhed fundet"}</span>
                    </div>
                  </div>
                </div>

                {/* Score */}
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Score: {selected.lead_score}/100</div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mb-2">
                    <div className={`h-1.5 rounded-full ${selected.lead_score >= 60 ? "bg-red-500" : selected.lead_score >= 30 ? "bg-amber-400" : "bg-slate-400"}`}
                      style={{ width: `${selected.lead_score}%` }} />
                  </div>
                  <ul className="space-y-0.5">
                    {selected.score_reasons.map((r, i) => (
                      <li key={i} className="text-[11px] text-slate-500 flex items-start gap-1">
                        <span className="text-slate-300">·</span>{r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Panel actions */}
              {selected.status === "needs_review" && (
                <div className="p-3 border-t border-slate-200 flex gap-2 flex-shrink-0">
                  <button onClick={() => approveAndSync(selected)} disabled={actionLoading === selected.id}
                    className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                    {actionLoading === selected.id
                      ? <span className="w-3 h-3 rounded-full border border-white/30 border-t-white animate-spin" />
                      : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                    }
                    Tilføj til HubSpot
                  </button>
                  <button onClick={() => reject(selected)} disabled={actionLoading === selected.id}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors">
                    Afvis
                  </button>
                </div>
              )}
              {selected.status === "synced" && selected.hubspot_contact_id && (
                <div className="p-3 border-t border-slate-200 flex-shrink-0">
                  <a href={`https://app.hubspot.com/contacts/${selected.hubspot_contact_id}`}
                    target="_blank" rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    Åbn i HubSpot
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── HubSpot contacts tab ─── */}
      {mainTab === "hubspot" && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto scroll-slim">
              {hsLoading ? (
                <div className="p-8 text-center">
                  <div className="w-6 h-6 mx-auto rounded-full border-2 border-indigo-200 border-t-indigo-600 animate-spin" />
                  <p className="text-sm text-slate-400 mt-3">Henter HubSpot kontakter...</p>
                </div>
              ) : hsFiltered.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-sm font-semibold text-slate-600">Ingen kontakter fundet</p>
                </div>
              ) : (
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200/80 bg-slate-50/60 sticky top-0 z-10">
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Navn</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Virksomhed</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Titel</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Lifecycle</th>
                      <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide hidden lg:table-cell">Oprettet</th>
                      <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {hsFiltered.map((c) => {
                      const isSelected = hsSelected?.id === c.id;
                      const lc = lifecycleLabel(c.lifecyclestage);
                      return (
                        <tr key={c.id}
                          onClick={() => setHsSelected(isSelected ? null : c)}
                          className={`border-b border-slate-100 cursor-pointer transition-colors ${isSelected ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-slate-800 text-xs truncate max-w-[160px]">{c.fullName}</div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 max-w-[180px] truncate">{c.email ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 hidden sm:table-cell max-w-[140px] truncate">{c.company ?? "—"}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 hidden md:table-cell max-w-[120px] truncate">{c.jobtitle ?? "—"}</td>
                          <td className="px-4 py-2.5 hidden lg:table-cell">
                            {lc ? (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${lc.cls}`}>{lc.label}</span>
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell">
                            {formatDate(c.createdate)}
                          </td>
                          <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                            <a href={c.hubspotUrl} target="_blank" rel="noreferrer"
                              className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors inline-flex">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                              </svg>
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* HubSpot side panel */}
          {hsSelected && (
            <div className="w-72 flex-shrink-0 border-l border-slate-200 flex flex-col min-h-0 bg-white">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
                <span className="text-sm font-bold text-slate-800">Kontakt</span>
                <button onClick={() => setHsSelected(null)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto scroll-slim p-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                    {(hsSelected.fullName || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{hsSelected.fullName}</div>
                    {hsSelected.jobtitle && <div className="text-xs text-slate-500">{hsSelected.jobtitle}</div>}
                  </div>
                </div>
                <div className="space-y-2 text-xs">
                  {hsSelected.email && (
                    <div className="flex gap-2">
                      <span className="text-slate-400 w-16 shrink-0">Email</span>
                      <a href={`mailto:${hsSelected.email}`} className="text-indigo-600 hover:underline break-all">{hsSelected.email}</a>
                    </div>
                  )}
                  {hsSelected.phone && (
                    <div className="flex gap-2">
                      <span className="text-slate-400 w-16 shrink-0">Telefon</span>
                      <span className="text-slate-700">{hsSelected.phone}</span>
                    </div>
                  )}
                  {hsSelected.company && (
                    <div className="flex gap-2">
                      <span className="text-slate-400 w-16 shrink-0">Firma</span>
                      <span className="text-slate-700">{hsSelected.company}</span>
                    </div>
                  )}
                  {hsSelected.city && (
                    <div className="flex gap-2">
                      <span className="text-slate-400 w-16 shrink-0">By</span>
                      <span className="text-slate-700">{hsSelected.city}</span>
                    </div>
                  )}
                  {hsSelected.lifecyclestage && (
                    <div className="flex gap-2">
                      <span className="text-slate-400 w-16 shrink-0">Lifecycle</span>
                      {(() => {
                        const lc = lifecycleLabel(hsSelected.lifecyclestage);
                        return lc ? <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${lc.cls}`}>{lc.label}</span> : null;
                      })()}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <span className="text-slate-400 w-16 shrink-0">Oprettet</span>
                    <span className="text-slate-600">{formatDate(hsSelected.createdate)}</span>
                  </div>
                </div>
              </div>
              <div className="p-3 border-t border-slate-200 flex-shrink-0">
                <a href={hsSelected.hubspotUrl} target="_blank" rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                  Åbn i HubSpot
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
