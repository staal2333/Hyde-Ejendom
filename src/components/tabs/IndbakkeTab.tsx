"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { EnrichedThread } from "@/app/api/mail/unified-inbox/route";

const ACC_COLORS = [
  { border: "#6366f1", bg: "#eef2ff", text: "#4338ca" }, // indigo
  { border: "#0ea5e9", bg: "#e0f2fe", text: "#0369a1" }, // sky
  { border: "#f59e0b", bg: "#fef3c7", text: "#b45309" }, // amber
  { border: "#10b981", bg: "#d1fae5", text: "#047857" }, // emerald
  { border: "#ec4899", bg: "#fce7f3", text: "#be185d" }, // pink
];

// ── Helpers ──────────────────────────────────────────────────
function initials(s: string) {
  const c = s.split("@")[0].replace(/[._-]/g, " ").trim().split(" ").filter(Boolean);
  return c.length >= 2 ? (c[0][0] + c[c.length - 1][0]).toUpperCase() : (c[0] || "?").slice(0, 2).toUpperCase();
}
function sanitize(t: string) {
  if (!t) return "";
  return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/<[^>]+>/g, "").replace(/\s{2,}/g, " ").trim();
}
function senderName(from: string) {
  return sanitize(from).replace(/\s*<[^>]*>/g, "").replace(/"/g, "").trim() || from.split("@")[0];
}
function fmtDate(d: string) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    const dd = Math.floor((Date.now() - dt.getTime()) / 86400000);
    if (dd === 0) return dt.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    if (dd === 1) return "I går";
    if (dd < 7) return dt.toLocaleDateString("da-DK", { weekday: "short" });
    return dt.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  } catch { return ""; }
}
function fmtFull(d: string) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" }) + " kl. " + dt.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
  } catch { return d; }
}
const STAGE: Record<string, string> = {
  subscriber: "Subscriber", lead: "Lead", marketingqualifiedlead: "MQL",
  salesqualifiedlead: "SQL", opportunity: "Mulighed", customer: "Kunde",
};

// ── Types ────────────────────────────────────────────────────
interface Stats {
  total: number; high: number; medium: number; low: number;
  knownContacts: number;
  accounts: { email: string; name: string; count: number }[];
}
interface MsgAttachment { filename: string; mimeType: string; size: number; attachmentId: string; messageId: string; contentId?: string; }
interface FullMsg { id: string; from: string; to: string; subject: string; date: string; bodyPlain: string; bodyHtml: string; snippet: string; attachments?: MsgAttachment[]; }
interface FullThread { id: string; subject: string; messages: FullMsg[]; }

// ── Skeleton ─────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="px-5 py-4 border-b border-gray-100 animate-pulse flex items-center gap-4">
      <div className="w-5 h-5 rounded-full bg-gray-200" />
      <div className="w-10 h-10 rounded-full bg-gray-200" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-48" />
        <div className="h-3 bg-gray-100 rounded w-3/4" />
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────
export function IndbakkeTab() {
  const [threads, setThreads] = useState<EnrichedThread[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
  const [prioFilter, setPrioFilter] = useState<"all" | "high">("all");
  const [accFilter, setAccFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [sentThreads, setSentThreads] = useState<EnrichedThread[]>([]);
  const [sentStats, setSentStats] = useState<Stats | null>(null);
  const [loadingSent, setLoadingSent] = useState(false);
  const [sel, setSel] = useState<EnrichedThread | null>(null);
  const [selIdx, setSelIdx] = useState(-1);
  const [full, setFull] = useState<FullThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [addingToHs, setAddingToHs] = useState(false);
  const [preview, setPreview] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("inbox_dismissed") || "[]")); } catch { return new Set(); }
  });
  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev); next.add(id);
      localStorage.setItem("inbox_dismissed", JSON.stringify([...next]));
      return next;
    });
  }, []);
  const undismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev); next.delete(id);
      localStorage.setItem("inbox_dismissed", JSON.stringify([...next]));
      return next;
    });
  }, []);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Data ──
  const fetchInbox = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch("/api/mail/unified-inbox?limit=300");
      if (!r.ok) throw new Error((await r.json()).error || "Fejl");
      const d = await r.json();
      setThreads(d.threads || []); setStats(d.stats || null);
    } catch (e) { setError(e instanceof Error ? e.message : "Fejl"); }
    finally { setLoading(false); }
  }, []);
  const fetchSent = useCallback(async () => {
    setLoadingSent(true); setError(null);
    try {
      const r = await fetch("/api/mail/unified-inbox?limit=500&folder=SENT");
      if (!r.ok) throw new Error((await r.json()).error || "Fejl");
      const d = await r.json();
      setSentThreads(d.threads || []); setSentStats(d.stats || null);
    } catch (e) { setError(e instanceof Error ? e.message : "Fejl"); }
    finally { setLoadingSent(false); }
  }, []);
  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  const activeThreads = folder === "sent" ? sentThreads : threads;
  const activeLoading = folder === "sent" ? loadingSent : loading;
  const filtered = useMemo(() => activeThreads.filter(t => {
    if (folder === "inbox" && prioFilter === "high" && t.priority !== "high") return false;
    if (accFilter !== "all" && t.account !== accFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [sanitize(t.subject), senderName(t.from), sanitize(t.snippet), t.contact?.company || ""].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [activeThreads, folder, prioFilter, accFilter, search]);

  const effectiveHighCount = useMemo(() => {
    return threads.filter(t => t.priority === "high" && !t.lastIsFromUs && !dismissed.has(t.id)).length;
  }, [threads, dismissed]);

  // ── Selection ──
  const openThread = useCallback(async (t: EnrichedThread, idx: number) => {
    setSel(t); setSelIdx(idx); setFull(null); setReply(""); setSentId(null); setLoadingThread(true);
    try {
      const r = await fetch(`/api/mail/threads/${t.id}?account=${encodeURIComponent(t.account || "")}`);
      if (r.ok) setFull((await r.json()).thread);
    } catch {} finally { setLoadingThread(false); }
  }, []);

  // ── Keyboard ──
  useEffect(() => {
    const el = rootRef.current; if (!el) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(selIdx + 1, filtered.length - 1);
        if (filtered[next]) openThread(filtered[next], next);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(selIdx - 1, 0);
        if (filtered[prev]) openThread(filtered[prev], prev);
      } else if (e.key === "Escape") { setSel(null); setSelIdx(-1); }
      else if (e.key === "r" && sel) { e.preventDefault(); replyRef.current?.focus(); }
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [selIdx, filtered, sel, openThread]);

  // ── AI Draft ──
  const genDraft = useCallback(async () => {
    if (!sel) return; setDrafting(true);
    try {
      const r = await fetch("/api/mail/ai-draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: sel.subject, from: sel.from, snippet: sel.snippet, messages: full?.messages, fromAccount: sel.account }),
      });
      const d = await r.json();
      if (d.draft) { setReply(d.draft); setTimeout(() => replyRef.current?.focus(), 100); }
    } catch {} finally { setDrafting(false); }
  }, [sel, full]);

  // ── Send ──
  const sendReply = useCallback(async () => {
    if (!sel || !reply.trim()) return; setSending(true);
    try {
      const fd = new FormData();
      fd.append("threadId", sel.id);
      fd.append("to", sel.fromEmail);
      fd.append("subject", `Re: ${sel.subject}`);
      fd.append("body", reply);
      fd.append("propertyId", sel.propertyAddresses[0] || "inbox");
      fd.append("fromAccount", sel.account);
      for (const f of attachments) fd.append("attachments", f);
      const r = await fetch("/api/mail/send-reply", {
        method: "POST",
        ...(attachments.length > 0 ? { body: fd } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: sel.id, to: sel.fromEmail, subject: `Re: ${sel.subject}`, body: reply, propertyId: sel.propertyAddresses[0] || "inbox", fromAccount: sel.account }) }),
      });
      const d = await r.json();
      if (d.success) { setSentId(sel.id); setReply(""); setAttachments([]); setPreview(false); } else alert(d.error || "Fejl");
    } catch { alert("Netværksfejl"); } finally { setSending(false); }
  }, [sel, reply, attachments]);

  const addToHubSpot = useCallback(async () => {
    if (!sel) return; setAddingToHs(true);
    try {
      const nameParts = senderName(sel.from).split(" ");
      const r = await fetch("/api/hubspot/create-contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: sel.fromEmail,
          firstname: nameParts[0] || "",
          lastname: nameParts.slice(1).join(" ") || "",
        }),
      });
      const d = await r.json();
      if (d.success || d.exists) {
        setSel({ ...sel, contact: { id: d.contactId, name: senderName(sel.from), email: sel.fromEmail, hubspotUrl: d.hubspotUrl } });
        fetchInbox();
      } else { alert(d.error || "Fejl"); }
    } catch { alert("Netværksfejl"); }
    finally { setAddingToHs(false); }
  }, [sel, fetchInbox]);

  return (
    <div ref={rootRef} tabIndex={-1} className="flex h-full bg-white rounded-xl border border-gray-200 overflow-hidden outline-none">

      {/* ══════ SIDEBAR ══════ */}
      <div className={`flex-shrink-0 bg-gray-50 border-r border-gray-200 flex flex-col transition-all ${foldersOpen ? "w-52" : "w-14"}`}>
        <button onClick={() => setFoldersOpen(p => !p)} className="flex items-center justify-center w-full h-12 border-b border-gray-200 hover:bg-gray-100 text-gray-400">
          <svg className={`w-4 h-4 transition ${foldersOpen ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
        </button>
        {foldersOpen ? (
          <nav className="flex-1 px-3 pt-3 space-y-1">
            <Folder label="Indbakke" count={stats?.total ?? 0} active={folder === "inbox" && prioFilter === "all" && accFilter === "all"} onClick={() => { setFolder("inbox"); setPrioFilter("all"); setAccFilter("all"); setSel(null); }} icon="inbox" />
            {effectiveHighCount > 0 && <Folder label="Svar nu" count={effectiveHighCount} accent active={folder === "inbox" && prioFilter === "high"} onClick={() => { setFolder("inbox"); setPrioFilter(prioFilter === "high" ? "all" : "high"); setSel(null); }} icon="urgent" />}
            <Folder label="Sendt" count={sentStats?.total ?? sentThreads.length} active={folder === "sent"} onClick={() => { if (folder !== "sent") { setFolder("sent"); setPrioFilter("all"); setAccFilter("all"); setSel(null); if (sentThreads.length === 0) fetchSent(); } }} icon="sent" />
            <div className="pt-4 pb-1 px-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Konti</div>
            {(stats?.accounts ?? []).map((a, ai) => (
              <button key={a.email} onClick={() => setAccFilter(accFilter === a.email ? "all" : a.email)} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${accFilter === a.email ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-600 hover:bg-white/50"}`}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ACC_COLORS[ai % ACC_COLORS.length].border }} />
                <span className="flex-1 text-left truncate">{a.name.split(" ")[0]}</span>
                <span className="text-[11px] text-gray-400">{a.count}</span>
              </button>
            ))}
          </nav>
        ) : (
          <nav className="flex-1 flex flex-col items-center pt-3 gap-2">
            <IconBtn active={folder === "inbox" && prioFilter === "all"} onClick={() => { setFolder("inbox"); setPrioFilter("all"); setAccFilter("all"); setSel(null); }} icon="inbox" />
            {effectiveHighCount > 0 && <IconBtn active={folder === "inbox" && prioFilter === "high"} onClick={() => { setFolder("inbox"); setPrioFilter(prioFilter === "high" ? "all" : "high"); setSel(null); }} icon="urgent" accent />}
            <IconBtn active={folder === "sent"} onClick={() => { if (folder !== "sent") { setFolder("sent"); setPrioFilter("all"); setAccFilter("all"); setSel(null); if (sentThreads.length === 0) fetchSent(); } }} icon="sent" />
          </nav>
        )}
        <div className="p-3 border-t border-gray-200">
          <button onClick={folder === "sent" ? fetchSent : fetchInbox} disabled={activeLoading} className="w-full flex items-center justify-center gap-2 py-2 text-xs text-gray-500 hover:bg-gray-100 rounded-lg">
            <svg className={`w-3.5 h-3.5 ${activeLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {foldersOpen && "Opdater"}
          </button>
        </div>
      </div>

      {/* ══════ EMAIL LIST ══════ */}
      <div className={`flex flex-col border-r border-gray-200 bg-white ${sel ? "w-[420px] flex-shrink-0" : "flex-1"}`}>
        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input type="text" placeholder="Søg emails..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 rounded-lg border-0 focus:bg-white focus:ring-2 focus:ring-blue-500/20" />
          </div>
        </div>

        {error && <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

        <div className="flex-1 overflow-y-auto">
          {activeLoading ? (
            <>{Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}</>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              <span className="text-sm">Ingen emails</span>
            </div>
          ) : (
            filtered.map((t, i) => {
              const isSel = sel?.id === t.id;
              const isDismissed = dismissed.has(t.id);
              const needsReply = t.priority === "high" && !t.lastIsFromUs && !isDismissed;
              const isUnread = (t.isUnread || needsReply) && !isDismissed;
              const name = senderName(t.from);
              const subj = sanitize(t.subject);
              const preview = sanitize(t.snippet);
              const acIdx = (stats?.accounts ?? []).findIndex(a => a.email === t.account);
              const acColor = ACC_COLORS[acIdx >= 0 ? acIdx % ACC_COLORS.length : 0];
              const acLabel = (stats?.accounts ?? []).find(a => a.email === t.account)?.name.split(" ")[0] || t.account.split("@")[0];

              return (
                <div key={t.id} onClick={() => openThread(t, i)} className={`border-b border-gray-200 cursor-pointer transition-colors flex ${isSel ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                  <div className="w-1 flex-shrink-0 rounded-r-full" style={{ backgroundColor: acColor.border }} />
                  <div className={`flex-1 flex items-start gap-3 py-3 ${isSel ? "px-3" : "px-4"}`}>
                    {/* Unread dot */}
                    <div className="flex-shrink-0 w-2 pt-2">{isUnread && !isSel && <div className={`w-2 h-2 rounded-full ${needsReply ? "bg-red-500" : "bg-blue-500"}`} />}</div>

                    {/* Avatar */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-600">{initials(name)}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Account badge + Date */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-base truncate ${isUnread ? "font-bold text-gray-900" : "font-medium text-gray-700"}`}>{name}</span>
                          <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: acColor.bg, color: acColor.text }}>{acLabel}</span>
                        </div>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-2">{fmtDate(t.date)}</span>
                      </div>
                      {/* Row 2: Company/email + HubSpot */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-sm text-gray-500 truncate">{t.contact?.company || t.fromEmail}</span>
                        {t.contact ? (
                          <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-semibold">HS</span>
                        ) : (
                          <span className="flex-shrink-0 text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded">Ukendt</span>
                        )}
                      </div>
                      {/* Row 3: Subject + Badge */}
                      <div className="flex items-center gap-2 mt-1">
                        {needsReply && <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">Svar nu</span>}
                        {(t.lastIsFromUs || isDismissed) && <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">{isDismissed ? "Håndteret ✓" : "Svaret ✓"}</span>}
                        <span className={`text-sm truncate ${isUnread ? "text-gray-800 font-medium" : "text-gray-600"}`}>{subj || "(intet emne)"}</span>
                      </div>
                      {/* Row 4: Preview */}
                      <div className="text-xs text-gray-400 truncate mt-1 leading-relaxed">{preview.slice(0, 100)}</div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Keyboard hints */}
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-[11px] text-gray-400 flex gap-3">
          <span><kbd className="px-1.5 py-0.5 bg-gray-200 rounded font-mono">j</kbd> <kbd className="px-1.5 py-0.5 bg-gray-200 rounded font-mono">k</kbd> naviger</span>
          <span><kbd className="px-1.5 py-0.5 bg-gray-200 rounded font-mono">r</kbd> svar</span>
        </div>
      </div>

      {/* ══════ READING PANE ══════ */}
      {sel ? (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white overflow-hidden">
          {/* Header — compact */}
          <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{initials(senderName(sel.from))}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-base font-bold text-gray-900">{senderName(sel.from)}</span>
                    {sel.contact?.company && <span className="text-sm text-gray-500">· {sel.contact.company}</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{sel.fromEmail}</div>
                  {sel.contact?.jobtitle && <div className="text-xs text-gray-500 mt-0.5">{sel.contact.jobtitle}</div>}
                  <div className="flex items-center gap-2 mt-1.5">
                    {sel.contact ? (
                      <span className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-700 rounded-md font-semibold flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        I HubSpot
                      </span>
                    ) : (
                      <button onClick={addToHubSpot} disabled={addingToHs}
                        className="text-[10px] px-2.5 py-1 bg-orange-500 text-white rounded-md font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1 transition-colors">
                        {addingToHs ? "Tilføjer…" : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>Tilføj til HubSpot</>}
                      </button>
                    )}
                    {sel.contact?.lifecyclestage && (
                      <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md font-medium">{STAGE[sel.contact.lifecyclestage] || sel.contact.lifecyclestage}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-400">{fmtFull(sel.date)}</span>
                {sel.contact?.hubspotUrl && (
                  <a href={sel.contact.hubspotUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] px-2.5 py-1 bg-orange-500 text-white rounded-md hover:bg-orange-600 font-medium">HubSpot</a>
                )}
                <button onClick={() => { setSel(null); setSelIdx(-1); }} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mt-3">{sanitize(sel.subject) || "(intet emne)"}</h2>
          </div>

          {/* Content: Messages (left ~75%) + Reply sidebar (right ~25%) */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Messages — scrollable */}
            <div className="flex-1 min-w-0 overflow-y-auto px-6 py-4 space-y-4">
              {loadingThread ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/3" />
                  <div className="h-3 bg-gray-100 rounded w-full" /><div className="h-3 bg-gray-100 rounded w-5/6" /><div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              ) : (
                [...(full?.messages ?? [])].reverse().map((msg, i) => (
                  <MsgBubble key={msg.id} msg={msg} isNewest={i === 0} account={sel.account} />
                ))
              )}
              {!loadingThread && !full && <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-line">{sanitize(sel.snippet)}</div>}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply sidebar — 35% width */}
            <div className="w-[35%] min-w-[320px] max-w-[480px] flex-shrink-0 border-l border-gray-200 bg-gray-50/50 flex flex-col">
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Svar</span>
                {dismissed.has(sel.id) ? (
                  <button onClick={() => undismiss(sel.id)} className="text-[10px] px-2 py-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300 font-medium">Fortryd</button>
                ) : (
                  <button onClick={() => dismiss(sel.id)} className="text-[10px] px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 font-medium flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Håndteret
                  </button>
                )}
              </div>

              {sentId === sel.id ? (
                <div className="flex-1 flex items-center justify-center p-4">
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-4 py-3 rounded-lg text-sm w-full justify-center">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Sendt
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col min-h-0">
                  {/* To */}
                  <div className="px-4 py-2 text-[11px] text-gray-500 border-b border-gray-100 flex-shrink-0 truncate">
                    Til: <strong className="text-gray-700">{senderName(sel.from)}</strong>
                  </div>

                  {/* Editor or Preview — fills all available space */}
                  <div className="flex-1 min-h-0 relative">
                    {preview ? (
                      <div className="absolute inset-0 overflow-y-auto px-4 py-3 bg-white">
                        <div className="prose prose-sm max-w-none text-gray-800 text-sm" dangerouslySetInnerHTML={{ __html: reply.replace(/\n/g, "<br />") }} />
                      </div>
                    ) : (
                      <textarea ref={replyRef} placeholder="Skriv dit svar..." value={reply} onChange={e => setReply(e.target.value)}
                        className="absolute inset-0 w-full h-full px-4 py-3 text-sm resize-none focus:outline-none bg-white" />
                    )}
                  </div>

                  {/* Attachments */}
                  {attachments.length > 0 && (
                    <div className="px-4 py-2 border-t border-gray-100 flex flex-col gap-1 flex-shrink-0 max-h-[80px] overflow-y-auto">
                      {attachments.map((f, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          <span className="truncate">📎 {f.name}</span>
                          <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-1 flex-shrink-0">×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions — pinned at bottom */}
                  <div className="px-3 py-2.5 border-t border-gray-200 bg-gray-50 flex-shrink-0 space-y-2">
                    <div className="flex gap-1.5">
                      <button onClick={genDraft} disabled={drafting} className="flex-1 text-[11px] py-1.5 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 font-medium">
                        {drafting ? "Genererer…" : "AI Udkast"}
                      </button>
                      <button onClick={() => setPreview(p => !p)} className={`text-[11px] px-2.5 py-1.5 rounded-md font-medium ${preview ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                        {preview ? "Rediger" : "Preview"}
                      </button>
                    </div>
                    <div className="flex gap-1.5">
                      <input ref={fileRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files) setAttachments(a => [...a, ...Array.from(e.target.files!)]); e.target.value = ""; }} />
                      <button onClick={() => fileRef.current?.click()} className="text-[11px] px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 font-medium flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        Vedhæft
                      </button>
                      <button onClick={sendReply} disabled={sending || !reply.trim()} className="flex-1 py-1.5 bg-blue-600 text-white text-[11px] rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium">
                        {sending ? "Sender…" : "Send svar"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-300 bg-gray-50/50">
          <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          <p className="text-gray-400 text-sm">Vælg en email</p>
        </div>
      )}
    </div>
  );
}

// strip quoted content from plain text (lines starting with >)
function stripQuoted(text: string): string {
  return text.split("\n").filter(line => !line.trimStart().startsWith(">")).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}

// strip quoted HTML (gmail_quote divs, blockquotes, "On ... wrote:" blocks)
function stripQuotedHtml(html: string): string {
  return html
    .replace(/<div class="gmail_quote"[\s\S]*$/i, "")
    .replace(/<blockquote[\s\S]*$/i, "")
    .replace(/(<br\s*\/?>){2,}\s*<div[^>]*>Den\s.*?skrev\s.*?:[\s\S]*$/i, "")
    .replace(/(<br\s*\/?>){2,}\s*On\s.*?wrote:[\s\S]*$/i, "");
}

function AttachmentList({ attachments, account }: { attachments: MsgAttachment[]; account: string }) {
  if (!attachments?.length) return null;
  const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
  const isImage = (m: string) => m.startsWith("image/");
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Vedhæftninger ({attachments.length})</span>
      <div className="flex flex-wrap gap-2">
        {attachments.map((att, i) => {
          const url = `/api/mail/attachment?messageId=${att.messageId}&attachmentId=${encodeURIComponent(att.attachmentId)}&account=${encodeURIComponent(account)}&mimeType=${encodeURIComponent(att.mimeType)}&filename=${encodeURIComponent(att.filename)}`;
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" download={att.filename}
              className="flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors group">
              {isImage(att.mimeType) ? (
                <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              ) : (
                <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              )}
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-700 truncate max-w-[180px] group-hover:text-blue-600">{att.filename}</div>
                <div className="text-[10px] text-gray-400">{fmtSize(att.size)}</div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

function MsgBubble({ msg, isNewest, account }: { msg: FullMsg; isNewest: boolean; account: string }) {
  const [open, setOpen] = useState(isNewest);
  const [showFull, setShowFull] = useState(false);
  const name = senderName(msg.from);
  const atts = msg.attachments || [];

  const cleanPlain = stripQuoted(msg.bodyPlain || msg.snippet || "");
  const cleanHtml = msg.bodyHtml ? stripQuotedHtml(msg.bodyHtml) : "";
  const hasQuoted = msg.bodyHtml
    ? cleanHtml.length < msg.bodyHtml.length - 20
    : cleanPlain.length < (msg.bodyPlain || "").length - 20;

  if (isNewest) {
    return (
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50/30 shadow-sm">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-blue-100">
          <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials(name)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-gray-900">{name}</span>
              <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">Nyeste</span>
            </div>
            <span className="text-xs text-gray-500">til {sanitize(msg.to).split(",")[0].split("<")[0].trim()}</span>
          </div>
          <span className="text-xs text-gray-500 flex-shrink-0">{fmtFull(msg.date)}</span>
        </div>
        <div className="px-5 py-4">
          <div className="pl-12">
            {cleanHtml ? (
              <div className="prose prose-sm max-w-none text-gray-900 leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded" dangerouslySetInnerHTML={{ __html: showFull ? msg.bodyHtml! : cleanHtml }} />
            ) : (
              <div className="text-sm text-gray-900 whitespace-pre-line leading-relaxed">{showFull ? sanitize(msg.bodyPlain || "") : cleanPlain}</div>
            )}
            {hasQuoted && !showFull && (
              <button onClick={() => setShowFull(true)} className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                Vis citeret indhold
              </button>
            )}
            {hasQuoted && showFull && (
              <button onClick={() => setShowFull(false)} className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                Skjul citeret indhold
              </button>
            )}
            <AttachmentList attachments={atts} account={account} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer hover:bg-gray-50 rounded-lg">
        <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-[10px] font-bold flex-shrink-0">{initials(name)}</div>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm text-gray-700">{name}</span>
          {!open && <span className="text-xs text-gray-400 ml-2 truncate">{cleanPlain.slice(0, 60)}…</span>}
          {!open && atts.length > 0 && <span className="ml-1 text-[10px] text-gray-400">📎 {atts.length}</span>}
        </div>
        <span className="text-[11px] text-gray-400 flex-shrink-0">{fmtFull(msg.date)}</span>
        <svg className={`w-4 h-4 text-gray-400 transition flex-shrink-0 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-50">
          <div className="pl-10">
            {msg.bodyHtml ? (
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded" dangerouslySetInnerHTML={{ __html: msg.bodyHtml }} />
            ) : (
              <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{sanitize(msg.bodyPlain || msg.snippet)}</div>
            )}
            <AttachmentList attachments={atts} account={account} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────
const FOLDER_ICONS: Record<string, React.ReactNode> = {
  inbox: <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" />,
  urgent: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
  sent: <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />,
};
function Folder({ label, count, active, accent, onClick, icon = "inbox" }: { label: string; count: number; active: boolean; accent?: boolean; onClick: () => void; icon?: string }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors ${active ? "bg-white shadow-sm font-medium text-gray-900" : "text-gray-600 hover:bg-white/50"}`}>
      <svg className={`w-4 h-4 ${accent ? "text-red-500" : "text-gray-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        {FOLDER_ICONS[icon] || FOLDER_ICONS.inbox}
      </svg>
      <span className="flex-1 text-left">{label}</span>
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${accent ? "bg-red-100 text-red-600" : "bg-gray-200 text-gray-600"}`}>{count}</span>
    </button>
  );
}
function IconBtn({ active, accent, onClick, icon }: { active: boolean; accent?: boolean; onClick: () => void; icon: string }) {
  return (
    <button onClick={onClick} className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${active ? "bg-white shadow-sm" : "hover:bg-gray-100"}`}>
      <svg className={`w-4 h-4 ${accent ? "text-red-500" : "text-gray-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        {FOLDER_ICONS[icon] || FOLDER_ICONS.inbox}
      </svg>
    </button>
  );
}
