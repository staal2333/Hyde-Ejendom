"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { formatAddressLine, formatPropertyTitle } from "@/lib/format-address";
import { useDashboard } from "@/contexts/DashboardContext";

// ─── Types ──────────────────────────────────────────────────

type StagedStage = "new" | "researching" | "researched" | "approved" | "rejected" | "pushed";
type StagedSource = "discovery" | "street_agent" | "manual";

interface StagedContact {
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  source: string;
  confidence: number;
  relevance?: string;
  relevanceReason?: string;
}

interface StagedProperty {
  id: string;
  name: string;
  address: string;
  postalCode?: string;
  city?: string;
  outdoorScore?: number;
  outdoorNotes?: string;
  dailyTraffic?: number;
  trafficSource?: string;
  ownerCompany?: string;
  ownerCvr?: string;
  researchSummary?: string;
  researchReasoning?: string;
  researchLinks?: string;
  dataQuality?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactReasoning?: string;
  contacts?: StagedContact[];
  emailDraftSubject?: string;
  emailDraftBody?: string;
  emailDraftNote?: string;
  source: StagedSource;
  stage: StagedStage;
  hubspotId?: string;
  researchStartedAt?: string;
  researchCompletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  detail?: string;
}

interface ResearchProgress {
  propertyId: string;
  phase: string;
  message: string;
  detail?: string;
  progress: number;
}

// ─── Config ─────────────────────────────────────────────────

const STAGE_CONFIG: Record<StagedStage, { label: string; color: string; bg: string; dot: string; icon: string }> = {
  new:         { label: "Ny",            color: "text-amber-700",   bg: "bg-amber-50 border-amber-200",     dot: "bg-amber-500",                     icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" },
  researching: { label: "Researcher...", color: "text-blue-700",    bg: "bg-blue-50 border-blue-200",       dot: "bg-blue-500 animate-pulse",        icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" },
  researched:  { label: "Researched",    color: "text-indigo-700",  bg: "bg-indigo-50 border-indigo-200",   dot: "bg-indigo-500",                    icon: "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904" },
  approved:    { label: "Godkendt",      color: "text-green-700",   bg: "bg-green-50 border-green-200",     dot: "bg-green-500",                     icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  rejected:    { label: "Afvist",        color: "text-red-700",     bg: "bg-red-50 border-red-200",         dot: "bg-red-500",                       icon: "M6 18L18 6M6 6l12 12" },
  pushed:      { label: "I HubSpot",     color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500",                   icon: "M4.5 12.75l6 6 9-13.5" },
};

const SOURCE_LABELS: Record<StagedSource, { label: string; color: string }> = {
  discovery:    { label: "Discovery",    color: "text-blue-700 bg-blue-50" },
  street_agent: { label: "Gade-Agent",   color: "text-violet-700 bg-violet-50" },
  manual:       { label: "Manuel",       color: "text-slate-600 bg-slate-100" },
};

// ─── SVG Icon ───────────────────────────────────────────────

function Ic({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "lige nu";
  if (mins < 60) return `${mins}m siden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}t siden`;
  const days = Math.floor(hours / 24);
  return `${days}d siden`;
}

// ─── Component ──────────────────────────────────────────────

export default function StagingQueue() {
  const { fetchDashboard, setStagingResearch, setActiveTab: setGlobalTab } = useDashboard();
  const [properties, setProperties] = useState<StagedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StagedStage | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [researchProgress, setResearchProgress] = useState<Record<string, ResearchProgress>>({});
  const [batchResearching, setBatchResearching] = useState(false);
  const [approveSending, setApproveSending] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: "delete" | "reject"; ids: string[]; label: string } | null>(null);
  const [editingContact, setEditingContact] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ contactPerson: string; contactEmail: string; contactPhone: string }>({ contactPerson: "", contactEmail: "", contactPhone: "" });
  const [savingContact, setSavingContact] = useState(false);
  const abortRef = useRef<Record<string, AbortController>>({});
  const [counts, setCounts] = useState<Record<StagedStage, number>>({
    new: 0, researching: 0, researched: 0, approved: 0, rejected: 0, pushed: 0,
  });

  // ── Toast helpers ──
  const addToast = useCallback((message: string, type: Toast["type"], detail?: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type, detail }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // ── Fetch ──
  const fetchProperties = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("stage", filter);
      if (search) params.set("search", search);

      const [propsRes, countsRes] = await Promise.all([
        fetch(`/api/staged-properties?${params}`),
        fetch("/api/staged-properties?counts=true"),
      ]);

      const propsData = await propsRes.json();
      const countsData = await countsRes.json();

      setProperties(propsData.properties || []);
      if (countsData.counts) setCounts(countsData.counts);
    } catch (e) {
      console.error("Failed to fetch staged properties:", e);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  // Stable boolean: is any research in progress? (avoids effect re-runs on every SSE update)
  const hasActiveResearch = Object.keys(researchProgress).length > 0;

  // Sync research progress to global context for cross-tab visibility
  useEffect(() => {
    const active = Object.keys(researchProgress).length;
    if (active > 0) {
      const first = Object.values(researchProgress)[0];
      setStagingResearch({
        active,
        total: batchResearching ? properties.filter(p => p.stage === "new").length + active : active,
        label: first?.message || "Research kører...",
      });
    } else {
      setStagingResearch(null);
    }
  }, [hasActiveResearch, researchProgress, batchResearching, properties, setStagingResearch]);

  // Smart polling: 15s normally, 5s during research, pause when tab is hidden
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) clearInterval(interval);
      const pollMs = hasActiveResearch ? 5000 : 15000;
      interval = setInterval(fetchProperties, pollMs);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchProperties(); // Refresh immediately on return
        startPolling();
      } else if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchProperties, hasActiveResearch]);

  // ── Selection ──
  const toggleSelect = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectableIds = useMemo(
    () => properties.filter(p => !["pushed", "rejected", "researching"].includes(p.stage)).map(p => p.id),
    [properties]
  );

  const toggleSelectAll = useCallback(() => {
    if (selected.size === selectableIds.length && selectableIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  }, [selected.size, selectableIds]);

  // ── Research (single) ──
  const handleResearch = useCallback(async (id: string) => {
    const ctrl = new AbortController();
    abortRef.current[id] = ctrl;
    setResearchProgress(prev => ({ ...prev, [id]: { propertyId: id, phase: "start", message: "Starter research...", progress: 0 } }));

    try {
      const res = await fetch("/api/run-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stagedPropertyId: id }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error("Research request failed");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            setResearchProgress(prev => ({
              ...prev,
              [id]: {
                propertyId: id,
                phase: event.phase || "unknown",
                message: event.message || "",
                detail: event.detail,
                progress: event.progress ?? prev[id]?.progress ?? 0,
              },
            }));
          } catch { /* skip bad JSON */ }
        }
      }

      addToast("Research fuldført", "success");
      await fetchProperties();
      fetchDashboard();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        addToast("Research fejlede", "error", (e as Error).message);
      }
    } finally {
      setResearchProgress(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      delete abortRef.current[id];
    }
  }, [addToast, fetchProperties, fetchDashboard]);

  // ── Research batch (all "new") ──
  const handleBatchResearch = useCallback(async () => {
    const newProps = properties.filter(p => p.stage === "new");
    if (newProps.length === 0) { addToast("Ingen nye ejendomme at researche", "info"); return; }
    setBatchResearching(true);
    for (const p of newProps) {
      await handleResearch(p.id);
    }
    setBatchResearching(false);
    addToast(`Batch research færdig: ${newProps.length} ejendomme`, "success");
    fetchDashboard();
  }, [properties, handleResearch, addToast, fetchDashboard]);

  // ── Generate draft (researched → approved, internal only; no HubSpot) ──
  const handleGenerateDraft = useCallback(async (ids?: string[]) => {
    const toUse = ids || Array.from(selected);
    const propsToUse = properties.filter(p => toUse.includes(p.id));
    const researchedNoDraft = propsToUse.filter(p => p.stage === "researched" || p.stage === "approved");
    if (researchedNoDraft.length === 0) {
      addToast("Ingen researched/godkendte ejendomme valgt", "info");
      return;
    }
    setGeneratingDraft(true);
    try {
      const res = await fetch("/api/staged-properties/generate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: researchedNoDraft.map(p => p.id) }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(prev => new Set([...prev].filter(id => !researchedNoDraft.some(p => p.id === id))));
        addToast(`${data.generated} mail-udkast genereret (stadig internt)`, "success");
        await fetchProperties();
        fetchDashboard();
      } else {
        addToast("Generering af mail-udkast fejlede", "error", data.error);
      }
    } catch (e) {
      addToast("Generering fejlede", "error", (e as Error).message);
    } finally {
      setGeneratingDraft(false);
    }
  }, [selected, properties, addToast, fetchProperties, fetchDashboard]);

  // ── Push to HubSpot (approved/researched with draft only) ──
  const handleApprove = useCallback(async (ids?: string[]) => {
    const toApprove = ids || Array.from(selected);
    const propsToApprove = properties.filter(p => toApprove.includes(p.id));
    const canPush = propsToApprove.filter(p => p.stage === "approved" || (p.stage === "researched" && p.emailDraftSubject));
    if (canPush.length === 0) {
      addToast("Vælg ejendomme med mail-udkast (godkend først & generer mail)", "info");
      return;
    }
    setApproving(true);
    try {
      const res = await fetch("/api/staged-properties/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: canPush.map(p => p.id) }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(new Set());
        addToast(`${data.approved} ejendom${data.approved !== 1 ? "me" : ""} pushed til HubSpot`, "success");
        await fetchProperties();
        fetchDashboard();
      } else {
        addToast("Push til HubSpot fejlede", "error", data.error);
      }
    } catch (e) {
      addToast("Push fejlede", "error", (e as Error).message);
    } finally {
      setApproving(false);
    }
  }, [selected, properties, addToast, fetchProperties, fetchDashboard]);

  // ── Approve & Send (one-click: approve → HubSpot → enqueue email) ──
  const handleApproveSend = useCallback(async (ids?: string[]) => {
    const toSend = ids || Array.from(selected);
    const propsToSend = properties.filter(p => toSend.includes(p.id));
    const canSend = propsToSend.filter(p =>
      (p.stage === "researched" || p.stage === "approved" || p.stage === "new") &&
      p.emailDraftSubject && effectiveEmail(p)
    );
    if (canSend.length === 0) {
      addToast("Vælg ejendomme med email-udkast og kontakt-email", "info");
      return;
    }
    setApproveSending(true);
    try {
      const res = await fetch("/api/staged-properties/approve-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: canSend.map(p => p.id) }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(new Set());
        addToast(
          `${data.approved} pushed til HubSpot, ${data.emailsQueued} emails sat i kø`,
          "success",
        );
        await fetchProperties();
        fetchDashboard();
      } else {
        addToast("Godkend & Send fejlede", "error", data.error);
      }
    } catch (e) {
      addToast("Godkend & Send fejlede", "error", (e as Error).message);
    } finally {
      setApproveSending(false);
    }
  }, [selected, properties, addToast, fetchProperties, fetchDashboard]);

  // ── Edit contact info ──
  const startEditContact = useCallback((prop: StagedProperty) => {
    setEditingContact(prop.id);
    setEditForm({
      contactPerson: effectiveName(prop) || "",
      contactEmail: effectiveEmail(prop) || "",
      contactPhone: effectivePhone(prop) || "",
    });
  }, []);

  const saveContactEdit = useCallback(async (propId: string) => {
    setSavingContact(true);
    const prop = properties.find(p => p.id === propId);
    try {
      // If the property has a contacts array, sync the edits into contacts[0] so the UI stays consistent
      const updatedContacts = prop?.contacts && prop.contacts.length > 0
        ? prop.contacts.map((c, i) => i === 0
            ? { ...c, name: editForm.contactPerson || c.name, email: editForm.contactEmail || c.email, phone: editForm.contactPhone || c.phone }
            : c)
        : undefined;

      const res = await fetch(`/api/staged-properties?id=${propId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactPerson: editForm.contactPerson || undefined,
          contactEmail: editForm.contactEmail || undefined,
          contactPhone: editForm.contactPhone || undefined,
          ...(updatedContacts ? { contacts: updatedContacts } : {}),
        }),
      });
      const data = await res.json();
      if (data.property) {
        addToast("Kontaktinfo opdateret", "success");
        setEditingContact(null);
        await fetchProperties();
      } else {
        addToast("Opdatering fejlede", "error", data.error);
      }
    } catch (e) {
      addToast("Opdatering fejlede", "error", (e as Error).message);
    } finally {
      setSavingContact(false);
    }
  }, [editForm, addToast, fetchProperties]);

  // ── Reject (with confirmation) ──
  const askReject = useCallback((ids?: string[]) => {
    const toReject = ids || Array.from(selected);
    if (toReject.length === 0) return;
    const n = toReject.length;
    setConfirmAction({ type: "reject", ids: toReject, label: `Afvis ${n} ejendom${n !== 1 ? "me" : ""}?` });
  }, [selected]);

  const executeReject = useCallback(async (ids: string[]) => {
    setRejecting(true);
    try {
      const res = await fetch("/api/staged-properties/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.ok) {
        setSelected(new Set());
        addToast(`${data.rejected} ejendom${data.rejected !== 1 ? "me" : ""} afvist`, "info");
        await fetchProperties();
        fetchDashboard();
      }
    } catch (e) {
      addToast("Afvisning fejlede", "error", (e as Error).message);
    } finally {
      setRejecting(false);
    }
  }, [addToast, fetchProperties, fetchDashboard]);

  // ── Delete (with confirmation) ──
  const askDelete = useCallback((ids?: string[] | string) => {
    const toDelete = Array.isArray(ids) ? ids : ids ? [ids] : Array.from(selected);
    if (toDelete.length === 0) return;
    const n = toDelete.length;
    const label = n === 1
      ? `Slet "${properties.find(p => p.id === toDelete[0])?.name || properties.find(p => p.id === toDelete[0])?.address || "ejendom"}" permanent?`
      : `Slet ${n} markerede ejendomme permanent?`;
    setConfirmAction({ type: "delete", ids: toDelete, label });
  }, [properties, selected]);

  const executeDelete = useCallback(async (ids: string[]) => {
    try {
      let deleted = 0;
      for (const id of ids) {
        const res = await fetch(`/api/staged-properties?id=${id}`, { method: "DELETE" });
        if (res.ok) deleted++;
      }
      setSelected(prev => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      addToast(`${deleted} ejendom${deleted !== 1 ? "me" : ""} slettet`, "info");
      await fetchProperties();
      fetchDashboard();
    } catch (e) {
      addToast("Sletning fejlede", "error", (e as Error).message);
    }
  }, [addToast, fetchProperties, fetchDashboard]);

  const executeConfirmAction = useCallback(async () => {
    if (!confirmAction) return;
    setConfirmAction(null);
    if (confirmAction.type === "reject") await executeReject(confirmAction.ids);
    else if (confirmAction.type === "delete") await executeDelete(confirmAction.ids);
  }, [confirmAction, executeReject, executeDelete]);

  const activeCount = counts.new + counts.researching + counts.researched + counts.approved;

  // ─── RENDER ───────────────────────────────────────────────

  return (
    <div className="space-y-5 relative">
      {/* ── Toast overlay ── */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto animate-slide-down rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm max-w-sm ${
              t.type === "success" ? "bg-green-950/90 border-green-500/30 text-green-300"
              : t.type === "error" ? "bg-red-950/90 border-red-500/30 text-red-300"
              : "bg-slate-100 border-slate-200 text-slate-600"
            }`}
          >
            <div className="flex items-center gap-2">
              <Ic d={
                t.type === "success" ? "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                : t.type === "error" ? "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                : "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              } className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">{t.message}</p>
                {t.detail && <p className="text-xs opacity-70 mt-0.5">{t.detail}</p>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Confirmation dialog ── */}
      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-[2px] animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${confirmAction.type === "delete" ? "bg-red-100" : "bg-amber-100"}`}>
                <Ic d={confirmAction.type === "delete"
                  ? "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  : "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"
                } className={`w-5 h-5 ${confirmAction.type === "delete" ? "text-red-600" : "text-amber-600"}`} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Er du sikker?</h3>
                <p className="text-xs text-slate-500 mt-0.5">{confirmAction.label}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              {confirmAction.type === "delete" ? "Denne handling kan ikke fortrydes." : "Afviste ejendomme fjernes fra den aktive liste."}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Annuller
              </button>
              <button
                onClick={executeConfirmAction}
                className={`px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors shadow-sm ${
                  confirmAction.type === "delete" ? "bg-red-600 hover:bg-red-500" : "bg-amber-600 hover:bg-amber-500"
                }`}
              >
                {confirmAction.type === "delete" ? "Slet permanent" : "Ja, afvis"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Flow Steps Guide ── */}
      <div className="bg-slate-50 border border-slate-200/60 rounded-xl px-4 py-3 flex items-center gap-1 overflow-x-auto">
        {[
          { label: "1. Ny", sub: "Tilføjet", dot: "bg-amber-400", active: counts.new > 0, count: counts.new },
          { label: "→ Research", sub: "Find ejer & info", dot: "bg-blue-400", active: counts.researching > 0, count: counts.researching },
          { label: "→ Generer udkast", sub: "AI-mail + godkend", dot: "bg-indigo-500", active: counts.researched > 0, count: counts.researched },
          { label: "→ Push til HubSpot", sub: "Godkendt + HubSpot", dot: "bg-emerald-500", active: counts.approved > 0, count: counts.approved },
          { label: "→ Klar", sub: "Send mail", dot: "bg-emerald-600", active: counts.pushed > 0, count: counts.pushed },
        ].map((step) => (
          <div key={step.label} className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${step.active ? "bg-white border border-slate-200 shadow-sm" : "opacity-40"}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${step.dot}`} />
              <div>
                <p className={`text-[11px] font-bold whitespace-nowrap ${step.active ? "text-slate-800" : "text-slate-500"}`}>
                  {step.label}
                  {step.active && step.count > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold">{step.count}</span>
                  )}
                </p>
                <p className="text-[9px] text-slate-400 whitespace-nowrap">{step.sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {(Object.entries(STAGE_CONFIG) as [StagedStage, typeof STAGE_CONFIG[StagedStage]][]).map(([stage, cfg]) => (
          <button
            key={stage}
            onClick={() => setFilter(filter === stage ? "all" : stage)}
            className={`group relative rounded-xl border p-3 text-left transition-all duration-200 ${
              filter === stage
                ? `${cfg.bg} ring-1 ring-slate-300`
                : "bg-white border-slate-200/60 hover:border-slate-300 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className={`w-2 h-2 rounded-full ${cfg.dot} transition-transform group-hover:scale-125`} />
              <span className={`text-[11px] font-medium tracking-wide ${filter === stage ? cfg.color : "text-slate-500"}`}>
                {cfg.label}
              </span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${filter === stage ? "text-slate-800" : "text-slate-700"}`}>
              {counts[stage]}
            </div>
          </button>
        ))}
      </div>

      {/* ── Action Banner ── */}
      {activeCount > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <div className="flex items-center gap-3 bg-gradient-to-r from-amber-50 via-orange-50/60 to-transparent border-amber-200 px-4 py-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center flex-shrink-0">
              <Ic d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" className="w-4.5 h-4.5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">
                {activeCount} ejendom{activeCount !== 1 ? "me" : ""} afventer handling
              </p>
              <p className="text-[11px] text-amber-600 mt-0.5">
                {counts.new > 0 && `${counts.new} nye`}
                {counts.researching > 0 && ` · ${counts.researching} researcher`}
                {counts.researched > 0 && ` · ${counts.researched} klar til godkendelse & mail-udkast`}
                {counts.approved > 0 && ` · ${counts.approved} klar til push til HubSpot`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {counts.new > 0 && (
                <button
                  onClick={handleBatchResearch}
                  disabled={batchResearching}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 text-xs font-medium hover:bg-blue-200 transition-colors disabled:opacity-50"
                >
                  <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-3.5 h-3.5" />
                  {batchResearching ? "Researcher..." : `Research alle nye (${counts.new})`}
                </button>
              )}
              {counts.researched > 0 && (
                <button
                  onClick={() => setFilter("researched")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-medium hover:bg-indigo-200 transition-colors"
                >
                  <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-3.5 h-3.5" />
                  Trin 2: Generer mail-udkast ({counts.researched})
                </button>
              )}
              {counts.approved > 0 && (
                <button
                  onClick={() => {
                    const approvedIds = properties.filter(p => p.stage === "approved").map(p => p.id);
                    handleApprove(approvedIds);
                  }}
                  disabled={approving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200 transition-colors disabled:opacity-50"
                >
                  <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3.5 h-3.5" />
                  {approving ? "Pusher..." : `Trin 3: Push til HubSpot (${counts.approved})`}
                </button>
              )}
              {(() => {
                const readyToSend = properties.filter(p =>
                  (p.stage === "researched" || p.stage === "approved") && p.emailDraftSubject && effectiveEmail(p)
                ).length;
                return readyToSend > 0 ? (
                  <button
                    onClick={() => {
                      const readyIds = properties
                        .filter(p => (p.stage === "researched" || p.stage === "approved") && p.emailDraftSubject && effectiveEmail(p))
                        .map(p => p.id);
                      handleApproveSend(readyIds);
                    }}
                    disabled={approveSending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    <Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-3.5 h-3.5" />
                    {approveSending ? "Sender..." : `Send alle klar (${readyToSend})`}
                  </button>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Ic d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Søg adresse, ejer, by..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-brand-500/40 focus:ring-1 focus:ring-brand-500/20 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter pills */}
        <div className="flex gap-1">
          {(["all", "new", "researched", "approved", "pushed", "rejected"] as const).map(f => {
            const count = f === "all" ? properties.length : counts[f];
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                  filter === f
                    ? "bg-brand-50 text-brand-700 border border-brand-200 shadow-sm"
                    : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                {f === "all" ? "Alle" : STAGE_CONFIG[f].label}
                {count > 0 && (
                  <span className={`text-[10px] px-1 py-0.5 rounded-full ${
                    filter === f ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (() => {
          const selectedProps = properties.filter(p => selected.has(p.id));
          const researchedNoDraft = selectedProps.filter(p => p.stage === "researched" && !p.emailDraftSubject);
          const canPushHubSpot = selectedProps.filter(p => p.stage === "approved" || (p.stage === "researched" && p.emailDraftSubject));
          return (
            <div className="flex items-center gap-2 ml-auto animate-fade-in">
              <span className="text-xs text-slate-500 tabular-nums">{selected.size} valgt</span>
              {researchedNoDraft.length > 0 && (
                <button
                  onClick={() => handleGenerateDraft()}
                  disabled={generatingDraft}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-3.5 h-3.5" />
                  {generatingDraft ? "Genererer..." : `Godkend & generer mail (${researchedNoDraft.length})`}
                </button>
              )}
              {canPushHubSpot.length > 0 && (
                <button
                  onClick={() => handleApprove()}
                  disabled={approving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-500 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3.5 h-3.5" />
                  {approving ? "Pusher..." : `Push til HubSpot (${canPushHubSpot.length})`}
                </button>
              )}
              {(() => {
                const canSend = selectedProps.filter(p => p.emailDraftSubject && effectiveEmail(p));
                return canSend.length > 0 ? (
                  <button
                    onClick={() => handleApproveSend()}
                    disabled={approveSending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-50 shadow-sm"
                  >
                    <Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-3.5 h-3.5" />
                    {approveSending ? "Sender..." : `Godkend & Send (${canSend.length})`}
                  </button>
                ) : null;
              })()}
              <button
                onClick={() => askReject()}
                disabled={rejecting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/70 text-white text-xs font-semibold hover:bg-red-500 transition-colors disabled:opacity-50 shadow-sm"
              >
                <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
                {rejecting ? "Afviser..." : "Afvis"}
              </button>
              <button
                onClick={() => askDelete(Array.from(selected))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500 transition-colors shadow-sm"
              >
                <Ic d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-3.5 h-3.5" />
                Slet ({selected.size})
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Ryd valg"
              >
                <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="rounded-xl border border-slate-200/60 bg-white overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 h-10 rounded-lg bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-48 rounded bg-slate-100 animate-pulse" />
                  <div className="h-2.5 w-32 rounded bg-slate-100 animate-pulse" />
                </div>
                <div className="h-3 w-16 rounded bg-slate-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : properties.length === 0 ? (
        /* ── Empty State ── */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 flex items-center justify-center mb-5">
            <Ic d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" className="w-9 h-9 text-slate-600" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 mb-2">
            {filter !== "all" ? `Ingen ejendomme med status "${STAGE_CONFIG[filter].label}"` : "Staging er tom"}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
            {filter !== "all"
              ? "Prøv at skifte filter eller brug Discovery til at finde nye ejendomme."
              : "Brug Discovery eller Gade-Agent til at finde ejendomme. De lander her for gennemgang inden de pushes til HubSpot."
            }
          </p>
          {filter !== "all" && (
            <button onClick={() => setFilter("all")} className="mt-4 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors">
              Vis alle
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {/* Select all header */}
          {selectableIds.length > 0 && (
            <div className="flex items-center justify-between px-1 py-1">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all ${
                  selected.size === selectableIds.length && selectableIds.length > 0
                    ? "bg-brand-500 border-brand-500 shadow-sm shadow-brand-500/30"
                    : selected.size > 0
                      ? "bg-brand-500/30 border-brand-500/50"
                      : "border-slate-300 hover:border-slate-400"
                }`}>
                  {selected.size > 0 && <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3 text-white" />}
                </div>
                {selected.size > 0 ? `${selected.size} af ${selectableIds.length} valgt` : `Vælg alle (${selectableIds.length})`}
              </button>
              <span className="text-[10px] text-slate-600">{properties.length} vises</span>
            </div>
          )}

          {/* ── Property Cards ── */}
          {properties.map(prop => {
            const cfg = STAGE_CONFIG[prop.stage];
            const src = SOURCE_LABELS[prop.source];
            const isExpanded = expandedId === prop.id;
            const isSelectable = !["pushed", "rejected", "researching"].includes(prop.stage);
            const completeness = getCompleteness(prop);
            const rp = researchProgress[prop.id];
            const isResearching = !!rp || prop.stage === "researching";

            return (
              <div
                key={prop.id}
                className={`group rounded-xl border transition-all duration-200 ${
                  isResearching
                    ? "bg-blue-50/50 border-blue-200"
                    : selected.has(prop.id)
                      ? "bg-brand-50 border-brand-200"
                      : "bg-white border-slate-200/60 hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                {/* Research progress bar */}
                {rp && (
                  <div className="h-1 bg-blue-500/10 overflow-hidden rounded-t-xl">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500 ease-out"
                      style={{ width: `${rp.progress}%` }}
                    />
                  </div>
                )}

                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Checkbox */}
                  {isSelectable ? (
                    <button onClick={() => toggleSelect(prop.id)} className="flex-shrink-0">
                      <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-all ${
                        selected.has(prop.id)
                          ? "bg-brand-500 border-brand-500 shadow-sm shadow-brand-500/30"
                          : "border-slate-300 hover:border-slate-400"
                      }`}>
                        {selected.has(prop.id) && <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3 text-white" />}
                      </div>
                    </button>
                  ) : (
                    <div className="w-4 flex-shrink-0" />
                  )}

                  {/* Score badge */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm border ${
                    (prop.outdoorScore || 0) >= 8
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : (prop.outdoorScore || 0) >= 6
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                  }`}>
                    {prop.outdoorScore != null ? prop.outdoorScore.toFixed(0) : "–"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800 truncate" title={formatAddressLine(prop.address, prop.postalCode, prop.city)}>
                        {formatPropertyTitle(prop.name, prop.address, prop.postalCode, prop.city)}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${cfg.bg} ${cfg.color} border`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10px] font-medium ${src.color}`}>
                        {src.label}
                      </span>
                      {isOOHCandidate(prop) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          <Ic d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" className="w-3 h-3" />
                          OOH
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                      {(prop.name ? formatAddressLine(prop.address, prop.postalCode, prop.city) : null) && (
                        <span className="truncate">{formatAddressLine(prop.address, prop.postalCode, prop.city)}</span>
                      )}
                      {prop.ownerCompany && (
                        <span className="text-slate-400 truncate max-w-[160px]">· {prop.ownerCompany}</span>
                      )}
                      {prop.contactEmail && (
                        <span className="text-brand-400 truncate max-w-[160px]">· {prop.contactEmail}</span>
                      )}
                      {prop.dataQuality && (
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          prop.dataQuality === "high" ? "bg-emerald-500" :
                          prop.dataQuality === "medium" ? "bg-amber-500" : "bg-red-500"
                        }`} title={`Datakvalitet: ${prop.dataQuality}`} />
                      )}
                    </div>
                    {/* Research progress message */}
                    {rp && (
                      <p className="text-[11px] text-blue-400/80 mt-1 truncate animate-pulse">
                        {rp.message}
                      </p>
                    )}
                  </div>

                  {/* Completeness */}
                  <div className="flex-shrink-0 w-14 hidden sm:block">
                    <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          completeness >= 80 ? "bg-gradient-to-r from-green-500 to-emerald-400"
                          : completeness >= 50 ? "bg-gradient-to-r from-amber-500 to-orange-400"
                          : "bg-slate-600"
                        }`}
                        style={{ width: `${completeness}%` }}
                      />
                    </div>
                    <span className="text-[9px] text-slate-600 mt-0.5 block text-center tabular-nums">{completeness}%</span>
                  </div>

                  {/* Quick actions (visible on hover / always on small) */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={mapsUrl(prop)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-slate-400/60 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all opacity-0 group-hover:opacity-100"
                      title="Vis på Google Maps"
                    >
                      <Ic d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" className="w-4 h-4" />
                    </a>
                    {prop.stage === "new" && !rp && (
                      <button
                        onClick={() => handleResearch(prop.id)}
                        className="p-1.5 rounded-lg text-blue-400/60 hover:text-blue-400 hover:bg-blue-500/10 transition-all opacity-0 group-hover:opacity-100"
                        title="Kør research"
                      >
                        <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-4 h-4" />
                      </button>
                    )}
                    {prop.stage === "researched" && !prop.emailDraftSubject && !rp && (
                      <button
                        onClick={() => handleGenerateDraft([prop.id])}
                        disabled={generatingDraft}
                        className="p-1.5 rounded-lg text-indigo-400/60 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all opacity-0 group-hover:opacity-100"
                        title="Godkend & generer mail-udkast"
                      >
                        <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-4 h-4" />
                      </button>
                    )}
                    {(prop.stage === "approved" || (prop.stage === "researched" && prop.emailDraftSubject)) && !rp && (
                      <button
                        onClick={() => handleApprove([prop.id])}
                        disabled={approving}
                        className="p-1.5 rounded-lg text-green-400/60 hover:text-green-400 hover:bg-green-500/10 transition-all opacity-0 group-hover:opacity-100"
                        title="Push til HubSpot"
                      >
                        <Ic d="M4.5 12.75l6 6 9-13.5" className="w-4 h-4" />
                      </button>
                    )}
                    <span className="text-[10px] text-slate-600 tabular-nums w-14 text-right hidden lg:block">
                      {timeAgo(prop.createdAt)}
                    </span>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : prop.id)}
                      className={`p-1.5 rounded-lg transition-all ${
                        isExpanded ? "text-slate-700 bg-slate-100" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Ic d={isExpanded ? "M4.5 15.75l7.5-7.5 7.5 7.5" : "M19.5 8.25l-7.5 7.5-7.5-7.5"} className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* ── Expanded Detail Panel ── */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-100 animate-fade-in">
                    {/* Google Maps embed */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Ic d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" className="w-3.5 h-3.5 text-slate-400" />
                          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lokation</h4>
                        </div>
                        <a
                          href={mapsUrl(prop)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                          Åbn i Google Maps
                          <Ic d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                        <iframe
                          src={mapsEmbedUrl(prop)}
                          width="100%"
                          height="200"
                          style={{ border: 0 }}
                          allowFullScreen
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          title={`Kort: ${prop.address}`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Left column: Research data */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Ic d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-3.5 h-3.5 text-slate-400" />
                          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Research data</h4>
                        </div>

                        {!prop.ownerCompany && !prop.researchSummary && !prop.contactPerson ? (
                          <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 p-4 text-center">
                            <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                            <p className="text-xs text-slate-500 mb-2">Ingen research data endnu</p>
                            {prop.stage === "new" && (
                              <button
                                onClick={() => handleResearch(prop.id)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors"
                              >
                                <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-3.5 h-3.5" />
                                Kør research nu
                              </button>
                            )}
                          </div>
                        ) : (
                          <>
                            {/* Data quality badge */}
                            {prop.dataQuality && (
                              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                prop.dataQuality === "high" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                prop.dataQuality === "medium" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                "bg-red-50 text-red-700 border border-red-200"
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  prop.dataQuality === "high" ? "bg-emerald-500" :
                                  prop.dataQuality === "medium" ? "bg-amber-500" : "bg-red-500"
                                }`} />
                                Datakvalitet: {prop.dataQuality === "high" ? "Høj" : prop.dataQuality === "medium" ? "Middel" : "Lav"}
                              </div>
                            )}

                            {prop.ownerCompany && (
                              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Ejer / Bygherre</span>
                                <p className="text-sm text-slate-800 mt-0.5 font-medium">{prop.ownerCompany} {prop.ownerCvr && <span className="text-slate-500 text-xs font-normal">(CVR: {prop.ownerCvr})</span>}</p>
                              </div>
                            )}

                            {/* Editable contact section */}
                            {editingContact === prop.id ? (
                              <div className="rounded-lg bg-amber-50/50 border border-amber-200 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] text-amber-700 uppercase font-semibold">Rediger kontakt</span>
                                  <button onClick={() => setEditingContact(null)} className="text-slate-400 hover:text-slate-600 text-xs">Annuller</button>
                                </div>
                                <div className="space-y-1.5">
                                  <input
                                    type="text"
                                    placeholder="Kontaktperson navn"
                                    value={editForm.contactPerson}
                                    onChange={e => setEditForm(f => ({ ...f, contactPerson: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-800 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                  />
                                  <input
                                    type="email"
                                    placeholder="Email"
                                    value={editForm.contactEmail}
                                    onChange={e => setEditForm(f => ({ ...f, contactEmail: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-800 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                  />
                                  <input
                                    type="tel"
                                    placeholder="Telefon"
                                    value={editForm.contactPhone}
                                    onChange={e => setEditForm(f => ({ ...f, contactPhone: e.target.value }))}
                                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs text-slate-800 focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none"
                                  />
                                </div>
                                <button
                                  onClick={() => saveContactEdit(prop.id)}
                                  disabled={savingContact}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-500 transition-colors disabled:opacity-50"
                                >
                                  {savingContact ? "Gemmer..." : "Gem kontakt"}
                                </button>
                              </div>
                            ) : (
                              <>
                                {/* Multi-contact display */}
                                {(prop.contacts && prop.contacts.length > 0) ? (
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] text-slate-500 uppercase font-semibold">
                                        Kontakter ({prop.contacts.length})
                                      </span>
                                      <button
                                        onClick={() => startEditContact(prop)}
                                        className="text-[10px] text-brand-600 hover:text-brand-700 font-medium"
                                      >
                                        Rediger
                                      </button>
                                    </div>
                                    <div className="space-y-2 mt-1.5">
                                      {prop.contacts.map((c, ci) => {
                                        const roleColor = c.role?.match(/direktør|ceo|indehaver|ejer/i) ? "bg-violet-100 text-violet-700 border-violet-200"
                                          : c.role?.match(/bestyrelse|formand/i) ? "bg-blue-100 text-blue-700 border-blue-200"
                                          : c.role?.match(/marketing|cmo|salg/i) ? "bg-amber-100 text-amber-700 border-amber-200"
                                          : "bg-slate-100 text-slate-600 border-slate-200";
                                        const confPct = Math.round((c.confidence || 0) * 100);
                                        const confColor = confPct >= 70 ? "bg-emerald-500" : confPct >= 40 ? "bg-amber-500" : "bg-slate-400";
                                        return (
                                          <div key={ci} className={`rounded-lg border p-2.5 ${ci === 0 ? "bg-brand-50/30 border-brand-200" : "bg-slate-50 border-slate-200"}`}>
                                            <div className="flex items-start gap-2">
                                              <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${ci === 0 ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-600"}`}>
                                                {(c.name || "?")[0]?.toUpperCase()}
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="text-sm font-medium text-slate-800">{c.name}</span>
                                                  {c.role && c.role !== "anden" && (
                                                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold border ${roleColor}`}>
                                                      {c.role}
                                                    </span>
                                                  )}
                                                  {ci === 0 && <span className="text-[9px] text-brand-600 font-semibold">PRIMÆR</span>}
                                                </div>
                                                <div className="flex items-center gap-3 mt-0.5 text-[11px]">
                                                  {c.email ? (
                                                    <a href={`mailto:${c.email}`} className="text-brand-600 hover:underline">{c.email}</a>
                                                  ) : (
                                                    <span className="text-slate-400 italic">Ingen email</span>
                                                  )}
                                                  {c.phone && <span className="text-slate-500">{c.phone}</span>}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                  <div className="flex items-center gap-1">
                                                    <div className="w-12 h-1 rounded-full bg-slate-200 overflow-hidden">
                                                      <div className={`h-full rounded-full ${confColor}`} style={{ width: `${confPct}%` }} />
                                                    </div>
                                                    <span className="text-[9px] text-slate-400 tabular-nums">{confPct}%</span>
                                                  </div>
                                                  <span className="text-[9px] text-slate-400">{c.source}</span>
                                                </div>
                                              </div>
                                            </div>
                                            {c.relevanceReason && ci === 0 && (
                                              <p className="text-[10px] text-slate-500 mt-1.5 pl-9 leading-relaxed">{c.relevanceReason}</p>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ) : prop.contactPerson ? (
                                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] text-slate-500 uppercase font-semibold">Kontaktperson</span>
                                      <button
                                        onClick={() => startEditContact(prop)}
                                        className="text-[10px] text-brand-600 hover:text-brand-700 font-medium"
                                      >
                                        Rediger
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <div className="w-7 h-7 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 text-xs font-bold">
                                        {(prop.contactPerson || "?")[0]?.toUpperCase()}
                                      </div>
                                      <div>
                                        <p className="text-sm text-slate-800">{prop.contactPerson}</p>
                                        <div className="flex gap-2 text-[11px]">
                                          {prop.contactEmail && <span className="text-brand-600">{prop.contactEmail}</span>}
                                          {prop.contactPhone && <span className="text-slate-500">{prop.contactPhone}</span>}
                                        </div>
                                      </div>
                                    </div>
                                    {prop.contactReasoning && (
                                      <div className="mt-2 pt-2 border-t border-slate-200/60">
                                        <span className="text-[9px] text-slate-400 uppercase font-semibold">Hvorfor denne kontakt?</span>
                                        <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{prop.contactReasoning}</p>
                                      </div>
                                    )}
                                  </div>
                                ) : (prop.stage === "researched" || prop.stage === "approved") ? (
                                  <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 p-3 text-center">
                                    <p className="text-xs text-slate-500 mb-1.5">Ingen kontaktperson fundet</p>
                                    <button
                                      onClick={() => startEditContact(prop)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-600 text-xs font-medium hover:bg-brand-100 transition-colors"
                                    >
                                      Tilføj kontakt manuelt
                                    </button>
                                  </div>
                                ) : null}
                              </>
                            )}

                            {prop.researchSummary && (
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase font-semibold">Resume</span>
                                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap mt-0.5">{prop.researchSummary}</p>
                              </div>
                            )}

                            {prop.researchReasoning && (
                              <details className="group">
                                <summary className="flex items-center gap-1.5 cursor-pointer text-[10px] text-indigo-600 font-semibold uppercase tracking-wide hover:text-indigo-700 transition-colors">
                                  <Ic d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m5.231 13.481L15 17.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v16.5c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9zm3.75 11.625a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" className="w-3.5 h-3.5" />
                                  Kildekæde &amp; evidens
                                  <Ic d="M8.25 4.5l7.5 7.5-7.5 7.5" className="w-3 h-3 transition-transform group-open:rotate-90" />
                                </summary>
                                <div className="mt-2 rounded-lg bg-indigo-50/50 border border-indigo-100 p-3">
                                  <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-wrap">{prop.researchReasoning}</p>
                                </div>
                              </details>
                            )}

                            {prop.researchLinks && (
                              <details className="group">
                                <summary className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-500 font-semibold uppercase tracking-wide hover:text-slate-700 transition-colors">
                                  <Ic d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-9.86a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 006.364 6.364l1.757-1.757" className="w-3.5 h-3.5" />
                                  Kilder ({prop.researchLinks.split("\n").filter(Boolean).length})
                                  <Ic d="M8.25 4.5l7.5 7.5-7.5 7.5" className="w-3 h-3 transition-transform group-open:rotate-90" />
                                </summary>
                                <div className="mt-2 space-y-1">
                                  {prop.researchLinks.split("\n").filter(Boolean).map((link, i) => (
                                    <div key={i} className="text-[11px]">
                                      {link.startsWith("http") ? (
                                        <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 hover:underline truncate block">{link}</a>
                                      ) : (
                                        <span className="text-slate-500">{link}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}

                            {prop.dailyTraffic != null && prop.dailyTraffic > 0 && (
                              <div className="flex items-center gap-2 text-xs">
                                <Ic d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" className="w-4 h-4 text-slate-400" />
                                <span className="text-slate-500">Daglig trafik:</span>
                                <span className="text-slate-800 font-medium">~{prop.dailyTraffic.toLocaleString("da-DK")}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Right column: Email draft + actions */}
                      <div className="space-y-3">
                        {prop.emailDraftSubject ? (
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-3.5 h-3.5 text-slate-400" />
                              <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Email-udkast</h4>
                            </div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5">
                              <p className="text-xs font-semibold text-slate-800 mb-1.5">{prop.emailDraftSubject}</p>
                              <p className="text-[11px] text-slate-500 whitespace-pre-wrap leading-relaxed line-clamp-8">{prop.emailDraftBody}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 p-4 text-center">
                            <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                            <p className="text-xs text-slate-500">Intet email-udkast endnu</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {prop.stage === "new" ? "Kør research (trin 1) for at fortsætte" : "Klik 'Trin 2: Generer mail-udkast' herunder"}
                            </p>
                          </div>
                        )}

                        {/* Warning: draft exists but no email → can't send */}
                        {prop.emailDraftSubject && !effectiveEmail(prop) && prop.stage !== "pushed" && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                            <Ic d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            <p className="text-xs text-amber-700">
                              <span className="font-semibold">Mangler kontakt-email</span> — udkastet er klar, men tilføj en email-adresse for at sende.
                            </p>
                            <button onClick={() => startEditContact(prop)} className="shrink-0 text-xs font-semibold text-amber-700 underline hover:no-underline">
                              Tilføj
                            </button>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                          {prop.stage === "new" && !rp && (
                            <button
                              onClick={() => handleResearch(prop.id)}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 transition-colors shadow-sm"
                            >
                              <Ic d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" className="w-3.5 h-3.5" />
                              Kør research
                            </button>
                          )}
                          {prop.stage === "researched" && !rp && (
                            <button
                              onClick={() => handleGenerateDraft([prop.id])}
                              disabled={generatingDraft}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50 shadow-sm"
                            >
                              <Ic d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" className="w-3.5 h-3.5" />
                              {generatingDraft ? "Genererer..." : prop.emailDraftSubject ? "Generer mail igen" : "Trin 2: Generer mail-udkast"}
                            </button>
                          )}
                          {prop.stage === "approved" && !rp && (
                            <button
                              onClick={() => handleGenerateDraft([prop.id])}
                              disabled={generatingDraft}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-100 text-indigo-700 text-xs font-medium hover:bg-indigo-200 transition-colors disabled:opacity-50"
                            >
                              <Ic d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" className="w-3.5 h-3.5" />
                              Generer mail igen
                            </button>
                          )}
                          {(prop.stage === "approved" || (prop.stage === "researched" && prop.emailDraftSubject)) && !rp && (
                            <button
                              onClick={() => handleApprove([prop.id])}
                              disabled={approving}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-50 shadow-sm"
                            >
                              <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3.5 h-3.5" />
                              {approving ? "Pusher..." : "Trin 3: Push til HubSpot"}
                            </button>
                          )}
                          {prop.emailDraftSubject && effectiveEmail(prop) && prop.stage !== "pushed" && !rp && (
                            <button
                              onClick={() => handleApproveSend([prop.id])}
                              disabled={approveSending}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors disabled:opacity-50 shadow-sm"
                            >
                              <Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-3.5 h-3.5" />
                              {approveSending ? "Sender..." : "Godkend & Send"}
                            </button>
                          )}
                          {prop.stage !== "pushed" && prop.stage !== "rejected" && !rp && (
                            <button
                              onClick={() => askReject([prop.id])}
                              disabled={rejecting}
                              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
                              Afvis
                            </button>
                          )}
                          {prop.stage === "pushed" && prop.hubspotId && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium">
                              <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3.5 h-3.5" />
                              I HubSpot · ID: {prop.hubspotId}
                            </span>
                          )}
                          <button
                            onClick={() => askDelete(prop.id)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 text-slate-500 text-xs hover:text-red-600 hover:bg-red-50 transition-colors ml-auto"
                          >
                            <Ic d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-3.5 h-3.5" />
                            Slet
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────

function mapsUrl(prop: StagedProperty): string {
  const parts = [prop.address, prop.postalCode, prop.city, "Danmark"].filter(Boolean);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(", "))}`;
}

function mapsEmbedUrl(prop: StagedProperty): string {
  const parts = [prop.address, prop.postalCode, prop.city, "Danmark"].filter(Boolean);
  return `https://maps.google.com/maps?q=${encodeURIComponent(parts.join(", "))}&t=&z=17&ie=UTF8&iwloc=&output=embed`;
}

function isOOHCandidate(prop: StagedProperty): boolean {
  return (prop.outdoorScore ?? 0) >= 8 &&
    ((prop.outdoorNotes?.toLowerCase().includes("stillads") ?? false) ||
     (prop.outdoorNotes?.toLowerCase().includes("scaffold") ?? false) ||
     (prop.dailyTraffic ?? 0) >= 15000);
}

function effectiveEmail(prop: StagedProperty): string | null {
  return prop.contactEmail || prop.contacts?.[0]?.email || null;
}

function effectiveName(prop: StagedProperty): string | null {
  return prop.contactPerson || prop.contacts?.[0]?.name || null;
}

function effectivePhone(prop: StagedProperty): string | null {
  return prop.contactPhone || prop.contacts?.[0]?.phone || null;
}

function getCompleteness(prop: StagedProperty): number {
  let score = 0;
  const total = 7;
  if (prop.address) score++;
  if (prop.city) score++;
  if (prop.outdoorScore != null) score++;
  if (prop.ownerCompany) score++;
  if (prop.contactPerson) score++;
  if (prop.contactEmail) score++;
  if (prop.emailDraftSubject) score++;
  return Math.round((score / total) * 100);
}
