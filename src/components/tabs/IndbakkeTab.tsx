"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { EnrichedThread } from "@/app/api/mail/unified-inbox/route";

// ── Helpers ──────────────────────────────────────────────────

const PALETTE = [
  { bg: "bg-blue-500", light: "bg-blue-100 text-blue-700", ring: "ring-blue-300" },
  { bg: "bg-violet-500", light: "bg-violet-100 text-violet-700", ring: "ring-violet-300" },
  { bg: "bg-emerald-500", light: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-300" },
  { bg: "bg-orange-500", light: "bg-orange-100 text-orange-700", ring: "ring-orange-300" },
];

function getAccountPalette(email: string, allEmails: string[]) {
  const idx = allEmails.indexOf(email);
  return PALETTE[idx % PALETTE.length] || PALETTE[0];
}

function getInitials(nameOrEmail: string): string {
  const clean = nameOrEmail.split("@")[0].replace(/[._-]/g, " ").replace(/[–—]/g, " ").trim();
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

function getShortName(nameOrEmail: string): string {
  const base = nameOrEmail.split("@")[0].replace(/[._-]/g, " ").trim();
  return base.split(" ")[0];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "I går";
    if (diffDays < 7) return d.toLocaleDateString("da-DK", { weekday: "short" });
    return d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

// ── Types ─────────────────────────────────────────────────────

interface Stats {
  total: number;
  high: number;
  medium: number;
  low: number;
  knownContacts: number;
  accounts: { email: string; name: string; count: number }[];
}

interface FullMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyPlain: string;
  snippet: string;
  messageId?: string;
}

interface FullThread {
  id: string;
  subject: string;
  messages: FullMessage[];
}

type PriorityFilter = "all" | "high" | "medium" | "low";

// ── Avatar ────────────────────────────────────────────────────

function Avatar({ name, colorClass }: { name: string; colorClass: string }) {
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0 ${colorClass}`}>
      {getInitials(name)}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export function IndbakkeTab() {
  const [threads, setThreads] = useState<EnrichedThread[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedThread, setSelectedThread] = useState<EnrichedThread | null>(null);
  const [fullThread, setFullThread] = useState<FullThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const allAccountEmails = stats?.accounts.map(a => a.email) ?? [];

  // ── Fetch inbox ──────────────────────────────────────────────
  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/unified-inbox?limit=60");
      if (!res.ok) throw new Error((await res.json()).error || "Fejl");
      const data = await res.json();
      setThreads(data.threads || []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // ── Open thread ──────────────────────────────────────────────
  const openThread = useCallback(async (thread: EnrichedThread) => {
    setSelectedThread(thread);
    setFullThread(null);
    setReplyText("");
    setSentId(null);
    setLoadingThread(true);
    try {
      const res = await fetch(`/api/mail/threads/${thread.id}`);
      if (res.ok) {
        const data = await res.json();
        setFullThread(data.thread);
      }
    } catch { /* show snippet fallback */ }
    finally { setLoadingThread(false); }
  }, []);

  // ── AI draft ─────────────────────────────────────────────────
  const generateDraft = useCallback(async () => {
    if (!selectedThread) return;
    setGeneratingDraft(true);
    try {
      const res = await fetch("/api/mail/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: selectedThread.subject,
          from: selectedThread.from,
          snippet: selectedThread.snippet,
          messages: fullThread?.messages,
          fromAccount: selectedThread.account,
          fromName: stats?.accounts.find(a => a.email === selectedThread.account)?.name,
        }),
      });
      const data = await res.json();
      if (data.draft) {
        setReplyText(data.draft);
        setTimeout(() => replyRef.current?.focus(), 100);
      }
    } catch { /* ignore */ }
    finally { setGeneratingDraft(false); }
  }, [selectedThread, fullThread, stats]);

  // ── Send reply ───────────────────────────────────────────────
  const sendReply = useCallback(async () => {
    if (!selectedThread || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/mail/send-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: selectedThread.id,
          to: selectedThread.fromEmail,
          subject: `Re: ${selectedThread.subject}`,
          body: replyText,
          propertyId: selectedThread.propertyAddresses[0] || "inbox",
          fromAccount: selectedThread.account,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setSentId(selectedThread.id);
        setReplyText("");
      } else {
        alert(d.error || "Kunne ikke sende");
      }
    } catch { alert("Netværksfejl"); }
    finally { setSending(false); }
  }, [selectedThread, replyText]);

  // ── Filter ───────────────────────────────────────────────────
  const filtered = threads.filter(t => {
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (accountFilter !== "all" && t.account !== accountFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(t.subject?.toLowerCase().includes(q) || t.from?.toLowerCase().includes(q) ||
            t.snippet?.toLowerCase().includes(q) || t.contact?.company?.toLowerCase().includes(q)))
        return false;
    }
    return true;
  });

  const priorityCounts = {
    high: threads.filter(t => t.priority === "high").length,
    medium: threads.filter(t => t.priority === "medium").length,
  };

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[600px] bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

      {/* ── LEFT SIDEBAR ────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 bg-gray-50 border-r border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Indbakke</h2>
          <p className="text-xs text-gray-400 mt-0.5">Alle 3 konti</p>
        </div>

        {/* Priority filters */}
        <nav className="p-2 flex-1">
          <button
            onClick={() => setPriorityFilter("all")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-0.5 ${priorityFilter === "all" ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Alle emails
            </span>
            <span className="text-xs text-gray-400">{threads.length}</span>
          </button>

          {priorityCounts.high > 0 && (
            <button
              onClick={() => setPriorityFilter(priorityFilter === "high" ? "all" : "high")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-0.5 ${priorityFilter === "high" ? "bg-red-50 text-red-700 font-medium" : "text-gray-600 hover:bg-gray-100"}`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Svar nu
              </span>
              <span className="text-xs font-semibold text-red-500 bg-red-100 rounded-full px-1.5">{priorityCounts.high}</span>
            </button>
          )}

          {priorityCounts.medium > 0 && (
            <button
              onClick={() => setPriorityFilter(priorityFilter === "medium" ? "all" : "medium")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-0.5 ${priorityFilter === "medium" ? "bg-amber-50 text-amber-700 font-medium" : "text-gray-600 hover:bg-gray-100"}`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Svar snart
              </span>
              <span className="text-xs font-semibold text-amber-600 bg-amber-100 rounded-full px-1.5">{priorityCounts.medium}</span>
            </button>
          )}

          {/* Separator */}
          <div className="my-3 border-t border-gray-100" />
          <p className="px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Konti</p>

          {/* Account filters */}
          <button
            onClick={() => setAccountFilter("all")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm mb-0.5 ${accountFilter === "all" ? "bg-gray-200 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <span>Alle konti</span>
            <span className="text-xs text-gray-400">{stats?.total ?? 0}</span>
          </button>
          {(stats?.accounts ?? []).map((acc) => {
            const pal = getAccountPalette(acc.email, allAccountEmails);
            return (
              <button
                key={acc.email}
                onClick={() => setAccountFilter(accountFilter === acc.email ? "all" : acc.email)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-0.5 ${accountFilter === acc.email ? "bg-gray-200 text-gray-900 font-medium" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pal.bg}`} />
                <span className="flex-1 text-left truncate">{getShortName(acc.name || acc.email)}</span>
                <span className="text-xs text-gray-400">{acc.count}</span>
              </button>
            );
          })}
        </nav>

        {/* Refresh button */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={fetchInbox}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Opdater indbakke
          </button>
        </div>
      </div>

      {/* ── EMAIL LIST ───────────────────────────────────────── */}
      <div className={`flex flex-col border-r border-gray-100 transition-all ${selectedThread ? "w-80 flex-shrink-0" : "flex-1"}`}>
        {/* Search bar */}
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Søg emails..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500/20 border border-transparent focus:border-gray-200 transition-all"
            />
          </div>
        </div>

        {/* Count */}
        <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-50">
          {filtered.length} emails
        </div>

        {/* Error */}
        {error && (
          <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-gray-400">Henter emails…</span>
            </div>
          </div>
        )}

        {/* Thread list */}
        {!loading && (
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && !error && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <svg className="w-10 h-10 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">Ingen emails</span>
              </div>
            )}
            {filtered.map((thread) => {
              const pal = getAccountPalette(thread.account, allAccountEmails);
              const isSelected = selectedThread?.id === thread.id;
              const isHigh = thread.priority === "high";

              return (
                <div
                  key={thread.id}
                  onClick={() => openThread(thread)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 group transition-colors ${
                    isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-gray-50 border-l-2 border-l-transparent"
                  }`}
                >
                  {/* Colored dot for account */}
                  <div className="flex-shrink-0 mt-1.5">
                    <div className={`w-2 h-2 rounded-full ${pal.bg}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-sm truncate ${isHigh ? "font-semibold text-gray-900" : "font-medium text-gray-800"}`}>
                        {thread.from}
                      </span>
                      <span className="text-[11px] text-gray-400 flex-shrink-0">{formatDate(thread.date)}</span>
                    </div>
                    <div className={`text-xs truncate mb-0.5 ${isHigh ? "font-semibold text-gray-800" : "text-gray-700"}`}>
                      {thread.subject}
                    </div>
                    <div className="text-xs text-gray-400 truncate">{thread.snippet}</div>

                    {/* Badges */}
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {isHigh && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">Svar nu</span>
                      )}
                      {thread.contact && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">HubSpot</span>
                      )}
                      {thread.propertyAddresses.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded-full truncate max-w-[100px]">
                          {thread.propertyAddresses[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── THREAD VIEW ─────────────────────────────────────── */}
      {selectedThread ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Thread header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 truncate">{selectedThread.subject}</h2>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {selectedThread.contact && (
                  <a
                    href={selectedThread.contact.hubspotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs flex items-center gap-1 text-orange-600 hover:text-orange-700 font-medium"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M22.677 8.685a3.378 3.378 0 00-3.381-3.381 3.378 3.378 0 00-3.381 3.381A3.378 3.378 0 0019.296 12a3.378 3.378 0 003.381-3.315zm-6.762 0a3.378 3.378 0 00-3.381-3.381 3.378 3.378 0 00-3.381 3.381A3.378 3.378 0 009.534 12a3.378 3.378 0 003.381-3.315zM9.534 8.685A3.378 3.378 0 006.153 5.304a3.378 3.378 0 00-3.38 3.381A3.378 3.378 0 006.153 12a3.378 3.378 0 003.381-3.315z"/></svg>
                    {selectedThread.contact.name || selectedThread.contact.email}
                    {selectedThread.contact.company && ` · ${selectedThread.contact.company}`}
                  </a>
                )}
                {selectedThread.propertyAddresses.length > 0 && (
                  <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    {selectedThread.propertyAddresses[0]}
                  </span>
                )}
                <span className="text-xs text-gray-400">{selectedThread.account}</span>
              </div>
            </div>
            <button
              onClick={() => setSelectedThread(null)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {loadingThread && (
              <div className="flex justify-center py-8">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loadingThread && fullThread?.messages.map((msg, i) => {
              const isLast = i === fullThread.messages.length - 1;
              const isFromUs = selectedThread.account && msg.from.toLowerCase().includes(selectedThread.account.split("@")[0].toLowerCase());
              return (
                <div key={msg.id} className={`rounded-xl border p-4 ${isFromUs ? "bg-blue-50 border-blue-100 ml-8" : "bg-white border-gray-100"} ${isLast ? "shadow-sm" : "opacity-70"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold ${isFromUs ? "bg-blue-500" : "bg-gray-400"}`}>
                        {getInitials(msg.from)}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-800">{msg.from.replace(/<[^>]+>/, "").trim() || msg.from}</div>
                        <div className="text-[10px] text-gray-400">til {msg.to?.split(",")[0]}</div>
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400">{formatDate(msg.date)}</span>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                    {msg.bodyPlain?.trim() || msg.snippet}
                  </div>
                </div>
              );
            })}

            {!loadingThread && !fullThread && (
              <div className="rounded-xl border border-gray-100 p-4 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-semibold">
                    {getInitials(selectedThread.from)}
                  </div>
                  <span className="text-xs font-medium text-gray-700">{selectedThread.from}</span>
                </div>
                <p className="text-sm text-gray-600">{selectedThread.snippet}</p>
              </div>
            )}
          </div>

          {/* Reply box */}
          <div className="border-t border-gray-100 p-4 bg-gray-50">
            {sentId === selectedThread.id ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Svar sendt fra {selectedThread.account}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Reply header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                  <span className="text-xs text-gray-500">
                    Svar til <strong>{selectedThread.from}</strong> fra <strong>{selectedThread.account}</strong>
                  </span>
                  <button
                    onClick={generateDraft}
                    disabled={generatingDraft}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-60 transition-colors font-medium"
                  >
                    {generatingDraft ? (
                      <>
                        <div className="w-3 h-3 border border-white/60 border-t-transparent rounded-full animate-spin" />
                        Genererer…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        AI Udkast
                      </>
                    )}
                  </button>
                </div>

                {/* Textarea */}
                <textarea
                  ref={replyRef}
                  rows={6}
                  placeholder="Skriv dit svar her… eller klik 'AI Udkast' for at generere automatisk"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  className="w-full px-4 py-3 text-sm text-gray-800 resize-none focus:outline-none placeholder-gray-400"
                />

                {/* Send bar */}
                <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                  <span className="text-xs text-gray-400">
                    {replyText.length > 0 ? `${replyText.length} tegn` : ""}
                  </span>
                  <button
                    onClick={sendReply}
                    disabled={sending || !replyText.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                  >
                    {sending ? (
                      <>
                        <div className="w-3.5 h-3.5 border border-white/60 border-t-transparent rounded-full animate-spin" />
                        Sender…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        Send svar
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
          <svg className="w-16 h-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">Vælg en email for at se den</p>
          <p className="text-xs opacity-70">Klik på AI Udkast for automatisk svar</p>
        </div>
      )}
    </div>
  );
}
