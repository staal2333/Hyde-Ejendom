"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useDashboard } from "@/contexts/DashboardContext";

/* ─── Types ─── */
export interface LeadCompany {
  cvr: string;
  name: string;
  address: string;
  industry?: string;
  website?: string;
  domain: string | null;
  egenkapital: number | null;
  resultat: number | null;
  omsaetning: number | null;
  inCrm: boolean;
  source: "cvr" | "ad";
  sourcePlatform?: string;
  pageCategory: string | null;
  pageLikes: number | null;
  adCount: number;
  platforms: string[];
  oohScore: number;
  oohReason: string;
}

interface LeadContact {
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  source: string;
  confidence?: number;
}

interface LeadRow {
  id: string;
  name: string;
  cvr: string | null;
  address: string | null;
  industry: string | null;
  website: string | null;
  domain: string | null;
  egenkapital: number | null;
  resultat: number | null;
  omsaetning: number | null;
  page_category: string | null;
  page_likes: number | null;
  ad_count: number;
  platforms: string[];
  ooh_score: number;
  ooh_reason: string | null;
  source_platform: string;
  status: string;
  hubspot_company_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contacts: LeadContact[];
  last_contacted_at: string | null;
  next_followup_at: string | null;
  notes: { text: string; created_at: string; author?: string }[];
  discovered_at: string;
  updated_at: string;
}

interface CustomerActivity {
  hubspotId: string;
  companyName: string;
  domain: string | null;
  advertising: boolean;
  platforms: string[];
  totalAdCount: number;
  matchedAdvertisers: { platform: string; pageName: string; adCount: number }[];
}

type PipelineTab = "nye" | "kvalificerede" | "kontaktet" | "kunder" | "hubspot";
type SortKey = "oohScore" | "name" | "egenkapital" | "followup";
type AdPlatform = "meta" | "tiktok" | "linkedin" | "google";

const PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  google: "Google/YouTube",
};

const PLATFORM_COLORS: Record<AdPlatform, string> = {
  meta: "bg-blue-100 text-blue-700",
  tiktok: "bg-gray-900 text-white",
  linkedin: "bg-sky-100 text-sky-700",
  google: "bg-red-100 text-red-700",
};

const TAB_STATUS_MAP: Record<PipelineTab, string | null> = {
  nye: "new",
  kvalificerede: "qualified",
  kontaktet: "contacted",
  kunder: "customer",
  hubspot: null,
};

function formatNumber(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(n);
}

/* ─── OOH Score Badge ─── */
function OohScoreBadge({ score }: { score: number }) {
  const color =
    score >= 60
      ? "text-emerald-700 bg-emerald-100 border-emerald-200"
      : score >= 30
        ? "text-amber-700 bg-amber-100 border-amber-200"
        : "text-red-700 bg-red-100 border-red-200";
  const ring =
    score >= 60 ? "stroke-emerald-500" : score >= 30 ? "stroke-amber-500" : "stroke-red-400";
  const pct = score / 100;
  const circumference = 2 * Math.PI * 18;

  return (
    <div className={`relative inline-flex items-center justify-center w-12 h-12 rounded-full border ${color}`}>
      <svg className="absolute inset-0 w-12 h-12 -rotate-90" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="18" fill="none" strokeWidth="3" className="stroke-slate-200" />
        <circle
          cx="20" cy="20" r="18" fill="none" strokeWidth="3"
          className={ring}
          strokeDasharray={`${circumference * pct} ${circumference * (1 - pct)}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="relative text-xs font-bold tabular-nums">{score}</span>
    </div>
  );
}

/* ─── Platform Icon ─── */
function PlatformBadge({ platform }: { platform: string }) {
  const p = platform.toLowerCase();
  let label = platform;
  let cls = "bg-slate-100 text-slate-600";
  if (p.includes("meta") || p.includes("facebook") || p.includes("instagram")) {
    label = "Meta"; cls = PLATFORM_COLORS.meta;
  } else if (p.includes("tiktok")) {
    label = "TikTok"; cls = PLATFORM_COLORS.tiktok;
  } else if (p.includes("linkedin")) {
    label = "LinkedIn"; cls = PLATFORM_COLORS.linkedin;
  } else if (p.includes("google") || p.includes("youtube")) {
    label = "Google"; cls = PLATFORM_COLORS.google;
  }
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${cls}`}>{label}</span>;
}

/* ─── Main Component ─── */
export function LeadSourcingTab() {
  const { addToast } = useDashboard();

  /* Discovery state */
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverCountry, setDiscoverCountry] = useState("DK");
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<AdPlatform>>(new Set(["meta"]));
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverPhase, setDiscoverPhase] = useState("");

  /* Pipeline state */
  const [activeTab, setActiveTab] = useState<PipelineTab>("nye");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("oohScore");
  const [sortAsc, setSortAsc] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});

  /* Pipeline search/filter */
  const [pipelineSearch, setPipelineSearch] = useState("");
  const [scoreFilter, setScoreFilter] = useState<string | null>(null);

  /* Customer monitoring */
  const [customers, setCustomers] = useState<CustomerActivity[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  /* API status */
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [apiError, setApiError] = useState<{ errorType: string; hint?: string } | null>(null);

  /* Check API on mount */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/lead-sourcing/test-meta");
        if (cancelled) return;
        const data = await res.json();
        setApiOk(data.ok === true);
        if (!data.ok) setApiError({ errorType: data.errorType || "unknown", hint: data.hint });
      } catch {
        if (!cancelled) setApiOk(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* Load pipeline leads */
  const loadLeads = useCallback(async (status?: string) => {
    setLeadsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      setLeads(data.leads || []);
    } catch {
      /* ignore */
    } finally {
      setLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "hubspot") return;
    const status = TAB_STATUS_MAP[activeTab];
    if (status) loadLeads(status);
  }, [activeTab, loadLeads]);

  /* Toggle platform */
  const togglePlatform = (p: AdPlatform) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(p)) { next.delete(p); } else { next.add(p); }
      if (next.size === 0) next.add("meta");
      return next;
    });
  };

  /* Run discovery */
  const runDiscover = useCallback(async (batch = false) => {
    setDiscoverLoading(true);
    const sources = Array.from(selectedPlatforms);
    setDiscoverPhase(batch ? `Fuld scanning: ${sources.map(s => PLATFORM_LABELS[s]).join(", ")}…` : `Søger på ${sources.map(s => PLATFORM_LABELS[s]).join(", ")}…`);
    try {
      const res = await fetch("/api/lead-sourcing/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: sources.length === 1 ? sources[0] : "all",
          sources,
          query: discoverQuery.trim() || undefined,
          country: discoverCountry.trim() || "DK",
          limit: 80,
          batch,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast((data.error || "Discovery fejlede").slice(0, 200), "error");
        return;
      }
      const companies: LeadCompany[] = data.companies || [];
      if (companies.length === 0) {
        addToast("Ingen nye leads fundet. Prøv andre søgeord eller platforme.", "info");
        return;
      }

      setDiscoverPhase("Gemmer leads i pipeline…");
      const saveRes = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies }),
      });
      const saveData = await saveRes.json();

      const crmFiltered = data.filteredByCrm || 0;
      const crmNote = crmFiltered > 0 ? ` (${crmFiltered} filtreret — allerede i CRM)` : "";
      addToast(
        `${companies.length} nye leads fundet fra ${(data.sources || sources).join(", ")}. ${saveData.saved || 0} gemt i pipeline.${crmNote}`,
        "success"
      );

      setActiveTab("nye");
      await loadLeads("new");
    } catch (e) {
      console.error("[Lead Discovery]", e);
      addToast(e instanceof Error ? e.message.slice(0, 200) : "Fejl ved discovery", "error");
    } finally {
      setDiscoverLoading(false);
      setDiscoverPhase("");
    }
  }, [discoverQuery, discoverCountry, selectedPlatforms, addToast, loadLeads]);

  /* Pipeline actions */
  const updateLeadStatus = useCallback(async (id: string, status: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Kunne ikke opdatere status");
      addToast(`Lead flyttet til "${status}"`, "success");
      const currentStatus = TAB_STATUS_MAP[activeTab];
      if (currentStatus) await loadLeads(currentStatus);
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fejl", "error");
    } finally {
      setActionLoading(null);
    }
  }, [activeTab, addToast, loadLeads]);

  const qualifyLead = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/leads/${id}/qualify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kvalificering fejlede");

      const parts: string[] = ["Lead kvalificeret"];
      if (data.enrichment?.contact_email) parts.push(`· Email fundet: ${data.enrichment.contact_email}`);
      if (data.enrichment?.contact_phone) parts.push(`· Tlf: ${data.enrichment.contact_phone}`);
      if (data.hubspotId) parts.push("· Synkroniseret til HubSpot");
      addToast(parts.join(" "), "success");
      await loadLeads("new");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fejl", "error");
    } finally {
      setActionLoading(null);
    }
  }, [addToast, loadLeads]);

  const addNoteTo = useCallback(async (id: string) => {
    const text = noteInputs[id]?.trim();
    if (!text) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: text }),
      });
      if (!res.ok) throw new Error("Kunne ikke tilføje note");
      setNoteInputs(prev => ({ ...prev, [id]: "" }));
      const currentStatus = TAB_STATUS_MAP[activeTab];
      if (currentStatus) await loadLeads(currentStatus);
      addToast("Note tilføjet", "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fejl", "error");
    } finally {
      setActionLoading(null);
    }
  }, [noteInputs, activeTab, addToast, loadLeads]);

  const snoozeFollowup = useCallback(async (id: string, days: number) => {
    setActionLoading(id);
    try {
      const date = new Date();
      date.setDate(date.getDate() + days);
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next_followup_at: date.toISOString().slice(0, 10) }),
      });
      if (!res.ok) throw new Error("Kunne ikke opdatere follow-up");
      addToast(`Follow-up sat til ${date.toLocaleDateString("da-DK")}`, "success");
      const currentStatus = TAB_STATUS_MAP[activeTab];
      if (currentStatus) await loadLeads(currentStatus);
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fejl", "error");
    } finally {
      setActionLoading(null);
    }
  }, [activeTab, addToast, loadLeads]);

  const deleteLead = useCallback(async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Sletning fejlede");
      addToast("Lead slettet", "success");
      const currentStatus = TAB_STATUS_MAP[activeTab];
      if (currentStatus) await loadLeads(currentStatus);
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fejl", "error");
    } finally {
      setActionLoading(null);
    }
  }, [activeTab, addToast, loadLeads]);

  /* Customer monitoring */
  const runCustomerScan = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const res = await fetch("/api/lead-sourcing/monitor-customers", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scanning fejlede");
      setCustomers(data.customers || []);
      addToast(`${data.advertising} af ${data.total} kunder annoncerer aktivt`, "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fejl", "error");
    } finally {
      setCustomersLoading(false);
    }
  }, [addToast]);

  /* Filtered + sorted leads */
  const sortedLeads = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    let filtered = [...leads];

    if (pipelineSearch.trim()) {
      const q = pipelineSearch.toLowerCase();
      filtered = filtered.filter(l =>
        l.name.toLowerCase().includes(q) ||
        (l.industry || "").toLowerCase().includes(q) ||
        l.notes.some(n => n.text.toLowerCase().includes(q))
      );
    }

    if (scoreFilter) {
      const [min, max] = scoreFilter.split("-").map(Number);
      filtered = filtered.filter(l => l.ooh_score >= min && l.ooh_score <= max);
    }

    return filtered.sort((a, b) => {
      if (sortKey === "oohScore") return dir * (a.ooh_score - b.ooh_score);
      if (sortKey === "name") return dir * a.name.localeCompare(b.name, "da");
      if (sortKey === "egenkapital") return dir * ((a.egenkapital ?? -Infinity) - (b.egenkapital ?? -Infinity));
      if (sortKey === "followup") {
        const aDate = a.next_followup_at || "9999";
        const bDate = b.next_followup_at || "9999";
        return dir * aDate.localeCompare(bDate);
      }
      return 0;
    });
  }, [leads, sortKey, sortAsc, pipelineSearch, scoreFilter]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "name"); }
  };

  /* Counts for tabs */
  const [tabCounts, setTabCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/leads?limit=5000");
        const data = await res.json();
        const allLeads: LeadRow[] = data.leads || [];
        const counts: Record<string, number> = {};
        for (const l of allLeads) counts[l.status] = (counts[l.status] || 0) + 1;
        setTabCounts(counts);
      } catch { /* ignore */ }
    })();
  }, [leads]);

  return (
    <div className="animate-fade-in space-y-5">
      {/* API Status Warning */}
      {apiOk === false && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                {apiError?.errorType === "no_token" ? "SearchAPI.io er ikke konfigureret" : "Ad Library API fejl"}
              </p>
              <p className="text-xs mt-0.5 text-amber-800">
                {apiError?.hint || "Tilføj SEARCHAPI_API_KEY i .env.local"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DISCOVERY BAR ═══════ */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-200/60 shadow-[var(--card-shadow)] p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          Lead Discovery
        </h2>

        {/* Platform selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(Object.keys(PLATFORM_LABELS) as AdPlatform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                selectedPlatforms.has(p)
                  ? `${PLATFORM_COLORS[p]} border-current`
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              {selectedPlatforms.has(p) && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Search fields */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Søgeord (valgfri)</label>
            <input
              type="text"
              value={discoverQuery}
              onChange={(e) => setDiscoverQuery(e.target.value)}
              placeholder="fx reklame, marketing, retail"
              className="w-56 px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Land</label>
            <select
              value={discoverCountry}
              onChange={(e) => setDiscoverCountry(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
            >
              <option value="DK">Danmark</option>
              <option value="NO">Norge</option>
              <option value="SE">Sverige</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => runDiscover(false)}
            disabled={discoverLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {discoverLoading ? (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            )}
            {discoverLoading ? "Kører…" : "Søg"}
          </button>
          <button
            type="button"
            onClick={() => runDiscover(true)}
            disabled={discoverLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-sm font-bold rounded-xl shadow-lg hover:from-violet-700 hover:to-purple-700 disabled:opacity-50"
          >
            {discoverLoading ? (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
            Fuld scanning (15 brancher)
          </button>
        </div>
        {discoverLoading && discoverPhase && (
          <div className="mt-3 flex items-center gap-2">
            <span className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-300 border-t-indigo-600" />
            <span className="text-xs text-indigo-700 font-medium">{discoverPhase}</span>
          </div>
        )}
      </div>

      {/* ═══════ PIPELINE TABS ═══════ */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {([
          { key: "nye", label: "Nye", status: "new" },
          { key: "kvalificerede", label: "Kvalificerede", status: "qualified" },
          { key: "kontaktet", label: "Kontaktet", status: "contacted" },
          { key: "kunder", label: "Kunder", status: "customer" },
          { key: "hubspot", label: "Mine HubSpot-kunder", status: null },
        ] as { key: PipelineTab; label: string; status: string | null }[]).map(({ key, label, status }) => {
          const count = status ? (tabCounts[status] || 0) : customers.length;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition ${
                activeTab === key
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-200 hover:text-indigo-700"
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                  activeTab === key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══════ PIPELINE CONTENT ═══════ */}
      {activeTab !== "hubspot" ? (
        <>
          {/* Search, filter & sort controls */}
          {leads.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    value={pipelineSearch}
                    onChange={(e) => setPipelineSearch(e.target.value)}
                    placeholder="Søg navn, branche, noter…"
                    className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div className="flex items-center gap-1 text-[10px]">
                  {(["0-30", "30-60", "60-100"] as const).map(range => (
                    <button
                      key={range}
                      onClick={() => setScoreFilter(scoreFilter === range ? null : range)}
                      className={`px-2 py-1 rounded-lg font-semibold transition ${scoreFilter === range ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                    >
                      OOH {range}
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-[10px] text-slate-400 tabular-nums">{sortedLeads.length}/{leads.length} leads</span>
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-slate-500 font-medium uppercase tracking-wide">Sortér:</span>
                {(["oohScore", "name", "egenkapital", "followup"] as SortKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => handleSort(k)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition ${sortKey === k ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                  >
                    {k === "oohScore" ? "OOH Score" : k === "name" ? "Navn" : k === "egenkapital" ? "Egenkapital" : "Follow-up"}
                    {sortKey === k ? (sortAsc ? " ↑" : " ↓") : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {leadsLoading ? (
            <div className="flex items-center justify-center py-12">
              <span className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-300 border-t-indigo-600" />
            </div>
          ) : leads.length === 0 ? (
            <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-8 text-center">
              <p className="text-sm text-slate-500">
                {activeTab === "nye"
                  ? "Ingen nye leads. Kør Lead Discovery ovenfor for at finde annoncører."
                  : "Ingen leads i denne kategori."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedLeads.map((lead) => (
                <PipelineLeadCard
                  key={lead.id}
                  lead={lead}
                  tab={activeTab}
                  expanded={expandedId === lead.id}
                  onToggle={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
                  actionLoading={actionLoading === lead.id}
                  noteValue={noteInputs[lead.id] || ""}
                  onNoteChange={(v) => setNoteInputs(prev => ({ ...prev, [lead.id]: v }))}
                  onQualify={() => qualifyLead(lead.id)}
                  onStatusChange={(s) => updateLeadStatus(lead.id, s)}
                  onAddNote={() => addNoteTo(lead.id)}
                  onDelete={() => deleteLead(lead.id)}
                  onSnooze={(days) => snoozeFollowup(lead.id, days)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        /* ═══════ HUBSPOT CUSTOMERS TAB ═══════ */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600">Scan dine eksisterende HubSpot-kunder for at se deres annonceaktivitet på tværs af alle platforme.</p>
            <button
              type="button"
              onClick={runCustomerScan}
              disabled={customersLoading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl shadow-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {customersLoading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
              )}
              {customersLoading ? "Scanner…" : "Overvåg annoncer"}
            </button>
          </div>

          {customers.length > 0 && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums text-slate-800">{customers.length}</div>
                  <div className="text-[10px] font-semibold uppercase text-slate-500">Kunder i alt</div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums text-emerald-800">{customers.filter(c => c.advertising).length}</div>
                  <div className="text-[10px] font-semibold uppercase text-emerald-600">Annoncerer</div>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center">
                  <div className="text-2xl font-bold tabular-nums text-amber-800">{customers.filter(c => !c.advertising).length}</div>
                  <div className="text-[10px] font-semibold uppercase text-amber-600">Ingen annoncer</div>
                </div>
              </div>

              <div className="space-y-2">
                {customers
                  .sort((a, b) => (b.advertising ? 1 : 0) - (a.advertising ? 1 : 0) || b.totalAdCount - a.totalAdCount)
                  .map((c) => (
                  <div key={c.hubspotId} className={`rounded-2xl border p-4 transition ${c.advertising ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 truncate">{c.companyName}</h4>
                        {c.domain && <p className="text-[10px] text-slate-500">{c.domain}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.advertising ? (
                          <>
                            {c.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
                            <span className="text-[10px] font-bold text-emerald-700 ml-1">{c.totalAdCount} ads</span>
                          </>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium">Ingen annoncer fundet</span>
                        )}
                      </div>
                    </div>
                    {c.matchedAdvertisers.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.matchedAdvertisers.map((m, i) => (
                          <span key={i} className="text-[10px] bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-slate-600">
                            {m.pageName} ({m.platform}, {m.adCount} ads)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {customers.length === 0 && !customersLoading && (
            <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-8 text-center">
              <p className="text-sm text-slate-500">Klik &quot;Overvåg annoncer&quot; for at scanne dine HubSpot-kunder.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Follow-up indicator helper ─── */
function FollowupIndicator({ date }: { date: string | null }) {
  if (!date) return null;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const fDate = date.slice(0, 10);
  const diff = Math.round((new Date(fDate).getTime() - new Date(todayStr).getTime()) / 86400000);

  if (fDate < todayStr) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        {Math.abs(diff)} dage forsinket
      </span>
    );
  }
  if (fDate === todayStr) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        I dag
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
      om {diff} dag{diff !== 1 ? "e" : ""}
    </span>
  );
}

/* ─── Email-ready indicator ─── */
function EmailReadyBadge({ email, name }: { email: string | null; name: string }) {
  if (email) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600" title={email}>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        Klar til email
      </span>
    );
  }
  if (name) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-500">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
        Mangler email
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-400">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      Ingen kontakt
    </span>
  );
}

/* ─── Pipeline Lead Card ─── */
function PipelineLeadCard({
  lead,
  tab,
  expanded,
  onToggle,
  actionLoading,
  noteValue,
  onNoteChange,
  onQualify,
  onStatusChange,
  onAddNote,
  onDelete,
  onSnooze,
}: {
  lead: LeadRow;
  tab: PipelineTab;
  expanded: boolean;
  onToggle: () => void;
  actionLoading: boolean;
  noteValue: string;
  onNoteChange: (v: string) => void;
  onQualify: () => void;
  onStatusChange: (status: string) => void;
  onAddNote: () => void;
  onDelete: () => void;
  onSnooze: (days: number) => void;
}) {
  const crmBadge = lead.hubspot_company_id
    ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">I CRM</span>
    : <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">Ikke i CRM</span>;

  return (
    <div className={`rounded-2xl border bg-white shadow-[var(--card-shadow)] transition ${
      lead.next_followup_at && lead.next_followup_at.slice(0,10) < new Date().toISOString().slice(0,10)
        ? "border-red-200"
        : "border-slate-200"
    }`}>
      {/* Header — redesigned with info hierarchy */}
      <button type="button" onClick={onToggle} className="w-full text-left p-4">
        {/* Line 1: Name + OOH Score + CRM badge */}
        <div className="flex items-center gap-3 mb-1.5">
          <OohScoreBadge score={lead.ooh_score} />
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-900 truncate">{lead.name}</h3>
            {crmBadge}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <EmailReadyBadge email={lead.contact_email} name={lead.name} />
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </div>

        {/* Line 2: Industry + platforms */}
        <div className="flex items-center gap-2 flex-wrap ml-[60px] mb-1.5">
          {lead.industry && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{lead.industry}</span>}
          {lead.platforms.length > 0 && lead.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
          {lead.ad_count > 0 && <span className="text-[10px] text-slate-500"><strong>{lead.ad_count}</strong> annoncer</span>}
        </div>

        {/* Line 3: Financials */}
        <div className="flex items-center gap-4 flex-wrap ml-[60px] mb-1.5 text-[10px] text-slate-600">
          {lead.egenkapital != null && <span><strong>Egenkapital:</strong> {formatNumber(lead.egenkapital)}</span>}
          {lead.omsaetning != null && <span><strong>Omsætning:</strong> {formatNumber(lead.omsaetning)}</span>}
          {lead.resultat != null && <span><strong>Resultat:</strong> {formatNumber(lead.resultat)}</span>}
        </div>

        {/* Line 4: Contact info */}
        <div className="ml-[60px] mb-1">
          {lead.contacts && lead.contacts.length > 0 ? (
            <div className="space-y-0.5">
              {lead.contacts.slice(0, expanded ? 5 : 2).map((c, ci) => (
                <div key={ci} className="flex items-center gap-2 text-[10px]">
                  <span className="font-medium text-slate-700">{c.name}</span>
                  {c.role && c.role !== "anden" && c.role !== "Ukendt" && (
                    <span className="px-1 py-0.5 rounded text-[8px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">{c.role}</span>
                  )}
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="text-brand-600 hover:underline">{c.email}</a>
                  ) : (
                    <span className="text-slate-400 italic">ingen email</span>
                  )}
                  {c.phone && <span className="text-slate-500">{c.phone}</span>}
                </div>
              ))}
              {!expanded && lead.contacts.length > 2 && (
                <span className="text-[9px] text-slate-400">+{lead.contacts.length - 2} flere kontakter</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 text-[10px]">
              {lead.contact_email ? (
                <span className="text-slate-700">{lead.contact_email}</span>
              ) : (
                <span className="text-slate-400 italic">Ingen kontakt — beriges ved kvalificering</span>
              )}
              {lead.contact_phone && <span className="text-slate-600">{lead.contact_phone}</span>}
            </div>
          )}
        </div>

        {/* Line 5: Follow-up + note preview */}
        <div className="flex items-center gap-4 flex-wrap ml-[60px]">
          <FollowupIndicator date={lead.next_followup_at} />
          {lead.notes.length > 0 && (
            <span className="text-[10px] text-slate-400 truncate max-w-[200px]" title={lead.notes[lead.notes.length - 1].text}>
              Note: {lead.notes[lead.notes.length - 1].text}
            </span>
          )}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-100 p-4 bg-slate-50/50 space-y-4">
          {/* Details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-500 font-medium block">CVR</span>
              <span className="font-mono text-slate-800">{lead.cvr || <span className="text-slate-400 font-sans">Ikke fundet</span>}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Adresse</span>
              <span className="text-slate-800">{lead.address || "—"}</span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Website</span>
              {lead.website ? (
                <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener" className="text-indigo-600 underline truncate block">{lead.domain || lead.website}</a>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
            <div>
              <span className="text-slate-500 font-medium block">OOH Grund</span>
              <span className="text-slate-800 text-[11px]">{lead.ooh_reason || "—"}</span>
            </div>
          </div>

          {/* Follow-up section */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-500 font-medium">Follow-up:</span>
            <FollowupIndicator date={lead.next_followup_at} />
            <div className="flex items-center gap-1">
              {[3, 7, 14].map(d => (
                <button key={d} type="button" onClick={(e) => { e.stopPropagation(); onSnooze(d); }} disabled={actionLoading}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded-lg bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-50 transition"
                >
                  +{d}d
                </button>
              ))}
            </div>
            {lead.last_contacted_at && (
              <span className="text-[10px] text-slate-400 ml-auto">Sidst kontaktet: {new Date(lead.last_contacted_at).toLocaleDateString("da-DK")}</span>
            )}
          </div>

          {/* Notes */}
          {lead.notes.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Noter ({lead.notes.length})</span>
              {lead.notes.slice(-3).map((n, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 px-3 py-2">
                  <p className="text-xs text-slate-700">{n.text}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{new Date(n.created_at).toLocaleDateString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add note */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Tilføj note…"
              value={noteValue}
              onChange={(e) => onNoteChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onAddNote(); }}
              className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-sm"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddNote(); }}
              disabled={actionLoading || !noteValue.trim()}
              className="px-3 py-2 bg-slate-600 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-50 shrink-0"
            >
              Tilføj
            </button>
          </div>

          {/* Status-based actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
            {tab === "nye" && (
              <>
                <ActionButton label="Kvalificér" color="emerald" loading={actionLoading} onClick={(e) => { e.stopPropagation(); onQualify(); }} />
                <ActionButton label="Slet" color="red" loading={actionLoading} onClick={(e) => { e.stopPropagation(); onDelete(); }} />
              </>
            )}
            {tab === "kvalificerede" && (
              <>
                {lead.contact_email && (
                  <ActionButton label="Forbered email" color="indigo" loading={actionLoading} onClick={(e) => {
                    e.stopPropagation();
                    window.open(`mailto:${lead.contact_email}?subject=OOH samarbejde – ${encodeURIComponent(lead.name)}`, "_blank");
                    onNoteChange("Email forberedt – afventer afsendelse");
                    setTimeout(() => onAddNote(), 100);
                  }} />
                )}
                <ActionButton label="Marker kontaktet" color="blue" loading={actionLoading} onClick={(e) => { e.stopPropagation(); onStatusChange("contacted"); }} />
                <ActionButton label="Tilbage til Nye" color="slate" loading={actionLoading} onClick={(e) => { e.stopPropagation(); onStatusChange("new"); }} />
              </>
            )}
            {tab === "kontaktet" && (
              <>
                {lead.contact_email && (
                  <ActionButton label="Send opfølgning" color="indigo" loading={actionLoading} onClick={(e) => {
                    e.stopPropagation();
                    window.open(`mailto:${lead.contact_email}?subject=Opfølgning – ${encodeURIComponent(lead.name)}`, "_blank");
                    onNoteChange("Opfølgningsmail sendt");
                    setTimeout(() => onAddNote(), 100);
                  }} />
                )}
                <ActionButton label="Marker som kunde" color="emerald" loading={actionLoading} onClick={(e) => { e.stopPropagation(); onStatusChange("customer"); }} />
                <ActionButton label="Mistet" color="red" loading={actionLoading} onClick={(e) => { e.stopPropagation(); onStatusChange("lost"); }} />
              </>
            )}
            {tab === "kunder" && (
              <ActionButton label="Tilbage til kontaktet" color="slate" loading={actionLoading} onClick={(e) => { e.stopPropagation(); onStatusChange("contacted"); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Action Button ─── */
function ActionButton({ label, color, loading, onClick }: {
  label: string;
  color: string;
  loading: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-600 hover:bg-emerald-700 text-white",
    blue: "bg-blue-600 hover:bg-blue-700 text-white",
    indigo: "bg-indigo-600 hover:bg-indigo-700 text-white",
    red: "bg-red-500 hover:bg-red-600 text-white",
    slate: "bg-slate-200 hover:bg-slate-300 text-slate-700",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl disabled:opacity-50 ${colors[color] || colors.slate}`}
    >
      {loading && <span className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />}
      {label}
    </button>
  );
}
