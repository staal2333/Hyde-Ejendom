"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { EnrichedThread } from "@/app/api/mail/unified-inbox/route";

// ── Data helpers ──────────────────────────────────────────────

const ACCOUNT_PALETTE: Record<number, { dot: string; badge: string; label: string }> = {
  0: { dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-700",   label: "Sebastian" },
  1: { dot: "bg-violet-500", badge: "bg-violet-100 text-violet-700", label: "Ma" },
  2: { dot: "bg-emerald-500",badge: "bg-emerald-100 text-emerald-700", label: "Louis" },
  3: { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-700", label: "" },
};

function getAccountPal(email: string, allEmails: string[]) {
  const idx = allEmails.indexOf(email);
  return ACCOUNT_PALETTE[idx] ?? ACCOUNT_PALETTE[0];
}

function getAccountLabel(email: string, accounts: { email: string; name: string }[]) {
  const acc = accounts.find(a => a.email === email);
  if (!acc) return email.split("@")[0];
  const name = acc.name.split("–")[0].split("-")[0].trim();
  return name.split(" ")[0]; // first name only
}

function getInitials(nameOrEmail: string): string {
  const clean = nameOrEmail.split("@")[0].replace(/[._-]/g, " ").replace(/[–—]/g, " ").trim();
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

/** Strip HTML entities and tags from text */
function sanitize(text: string): string {
  if (!text) return "";
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    // Remove email addresses in angle brackets like <name@domain.dk>
    .replace(/<[^@\s]+@[^@\s>]+>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Extract just the display name from "Name <email@..." */
function parseSenderName(from: string): string {
  const clean = sanitize(from);
  // "John Doe <john@example.com>" → "John Doe"
  const nameOnly = clean.replace(/\s*<[^>]*>/g, "").replace(/"/g, "").trim();
  if (nameOnly) return nameOnly;
  // fallback: extract from email
  const emailMatch = clean.match(/[\w.+-]+@[\w.-]+/);
  return emailMatch ? emailMatch[0].split("@")[0] : clean;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
    if (diffDays === 1) return "I går";
    if (diffDays < 7) return d.toLocaleDateString("da-DK", { weekday: "short" });
    return d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
  } catch { return ""; }
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

// ── Email row ─────────────────────────────────────────────────

function EmailRow({
  thread,
  isSelected,
  accounts,
  allAccountEmails,
  onClick,
}: {
  thread: EnrichedThread;
  isSelected: boolean;
  accounts: Stats["accounts"];
  allAccountEmails: string[];
  onClick: () => void;
}) {
  const pal = getAccountPal(thread.account, allAccountEmails);
  const accountLabel = getAccountLabel(thread.account, accounts);
  const senderName = parseSenderName(thread.from);
  const preview = sanitize(thread.snippet);
  const subject = sanitize(thread.subject);
  const isHigh = thread.priority === "high";
  const isMedium = thread.priority === "medium";
  const isUnread = isHigh || isMedium; // treat as unread if needs action

  return (
    <div
      onClick={onClick}
      className={`
        flex items-stretch gap-0 cursor-pointer border-b border-gray-100
        transition-colors duration-100 group
        ${isSelected
          ? "bg-blue-50 border-l-[3px] border-l-blue-500"
          : isHigh
          ? "bg-amber-50/40 border-l-[3px] border-l-amber-400 hover:bg-amber-50/70"
          : "hover:bg-gray-50 border-l-[3px] border-l-transparent"}
      `}
    >
      {/* Unread dot indicator */}
      <div className="flex items-center pl-3 pr-2 flex-shrink-0">
        {isUnread
          ? <div className={`w-2 h-2 rounded-full ${pal.dot}`} />
          : <div className="w-2 h-2 rounded-full bg-transparent" />
        }
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 py-3 pr-4">
        {/* Row 1: Sender + Date */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`text-sm truncate ${isUnread ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
            {senderName}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">
            {formatDate(thread.date)}
          </span>
        </div>

        {/* Row 2: Subject */}
        <div className={`text-sm truncate mb-0.5 ${isUnread ? "font-medium text-gray-800" : "text-gray-600"}`}>
          {subject || "(intet emne)"}
        </div>

        {/* Row 3: Preview */}
        <div className="text-xs text-gray-400 truncate leading-relaxed">
          {preview !== subject ? preview : ""}
        </div>

        {/* Row 4: Badges */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {/* Account badge */}
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${pal.badge}`}>
            {accountLabel}
          </span>
          {isHigh && (
            <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">
              Svar nu
            </span>
          )}
          {thread.contact && (
            <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
              HubSpot
            </span>
          )}
          {thread.propertyAddresses.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded truncate max-w-[120px]">
              {thread.propertyAddresses[0]}
            </span>
          )}
        </div>
      </div>
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
      if (res.ok) setFullThread((await res.json()).thread);
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
      if (d.success) { setSentId(selectedThread.id); setReplyText(""); }
      else alert(d.error || "Kunne ikke sende");
    } catch { alert("Netværksfejl"); }
    finally { setSending(false); }
  }, [selectedThread, replyText]);

  // ── Filter ───────────────────────────────────────────────────
  const filtered = threads.filter(t => {
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (accountFilter !== "all" && t.account !== accountFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!(sanitize(t.subject).toLowerCase().includes(q) ||
            parseSenderName(t.from).toLowerCase().includes(q) ||
            sanitize(t.snippet).toLowerCase().includes(q) ||
            t.contact?.company?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const highCount = threads.filter(t => t.priority === "high").length;
  const mediumCount = threads.filter(t => t.priority === "medium").length;

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[600px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 bg-gray-50/80 border-r border-gray-200 flex flex-col">
        <div className="px-4 pt-5 pb-3">
          <h2 className="text-sm font-semibold text-gray-900">Indbakke</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Alle 3 konti · AI-prioriteret</p>
        </div>

        <nav className="px-2 flex-1 space-y-0.5">
          {/* All */}
          <SidebarItem
            label="Alle emails"
            count={threads.length}
            active={priorityFilter === "all"}
            onClick={() => setPriorityFilter("all")}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            }
          />
          {highCount > 0 && (
            <SidebarItem
              label="Svar nu"
              count={highCount}
              active={priorityFilter === "high"}
              countColor="text-red-600 bg-red-100"
              onClick={() => setPriorityFilter(priorityFilter === "high" ? "all" : "high")}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              }
            />
          )}
          {mediumCount > 0 && (
            <SidebarItem
              label="Svar snart"
              count={mediumCount}
              active={priorityFilter === "medium"}
              countColor="text-amber-700 bg-amber-100"
              onClick={() => setPriorityFilter(priorityFilter === "medium" ? "all" : "medium")}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
          )}

          {/* Divider + Accounts */}
          <div className="pt-4 pb-1 px-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Konti</p>
          </div>

          <SidebarItem
            label="Alle konti"
            count={stats?.total ?? 0}
            active={accountFilter === "all"}
            onClick={() => setAccountFilter("all")}
            icon={<span className="w-4 h-4 flex items-center justify-center text-gray-400 text-xs">•••</span>}
          />
          {(stats?.accounts ?? []).map((acc) => {
            const pal = getAccountPal(acc.email, allAccountEmails);
            const label = getAccountLabel(acc.email, stats?.accounts ?? []);
            return (
              <SidebarItem
                key={acc.email}
                label={label}
                count={acc.count}
                active={accountFilter === acc.email}
                onClick={() => setAccountFilter(accountFilter === acc.email ? "all" : acc.email)}
                icon={<span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${pal.dot}`} />}
              />
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-200">
          <button
            onClick={fetchInbox}
            disabled={loading}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Opdater
          </button>
        </div>
      </div>

      {/* ── EMAIL LIST ───────────────────────────────────────── */}
      <div className={`flex flex-col border-r border-gray-200 ${selectedThread ? "w-[360px] flex-shrink-0" : "flex-1"}`}>
        {/* Search */}
        <div className="px-3 py-2.5 border-b border-gray-100 bg-white">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Søg emails..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white border border-transparent focus:border-gray-200 transition-all"
            />
          </div>
        </div>

        {/* Count bar */}
        <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">{filtered.length} emails</span>
          {filtered.filter(t => t.priority === "high" || t.priority === "medium").length > 0 && (
            <span className="text-[11px] text-amber-600 font-medium">
              {filtered.filter(t => t.priority === "high" || t.priority === "medium").length} kræver svar
            </span>
          )}
        </div>

        {error && (
          <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-gray-400">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Henter emails…</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2 py-16">
                <svg className="w-10 h-10 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">Ingen emails matcher</span>
              </div>
            )}
            {filtered.map((thread) => (
              <EmailRow
                key={thread.id}
                thread={thread}
                isSelected={selectedThread?.id === thread.id}
                accounts={stats?.accounts ?? []}
                allAccountEmails={allAccountEmails}
                onClick={() => openThread(thread)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── THREAD DETAIL ────────────────────────────────────── */}
      {selectedThread ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-gray-900 leading-snug">
                {sanitize(selectedThread.subject) || "(intet emne)"}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {(() => {
                  const pal = getAccountPal(selectedThread.account, allAccountEmails);
                  const label = getAccountLabel(selectedThread.account, stats?.accounts ?? []);
                  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${pal.badge}`}>{label}</span>;
                })()}
                {selectedThread.contact && (
                  <a
                    href={selectedThread.contact.hubspotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] flex items-center gap-1 text-orange-600 hover:underline font-medium"
                  >
                    ↗ {selectedThread.contact.name || selectedThread.fromEmail}
                    {selectedThread.contact.company && ` · ${selectedThread.contact.company}`}
                  </a>
                )}
                {selectedThread.propertyAddresses.length > 0 && (
                  <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    {selectedThread.propertyAddresses[0]}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setSelectedThread(null)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-gray-50/40">
            {loadingThread && (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {!loadingThread && fullThread?.messages.map((msg, i) => {
              const isFromUs = selectedThread.account &&
                msg.from.toLowerCase().includes(selectedThread.account.split("@")[0].toLowerCase());
              const isLast = i === fullThread.messages.length - 1;
              const senderName = parseSenderName(msg.from);

              return (
                <div
                  key={msg.id}
                  className={`rounded-xl border p-4 ${
                    isFromUs
                      ? "bg-blue-50 border-blue-100 ml-6"
                      : "bg-white border-gray-100 shadow-sm"
                  } ${!isLast ? "opacity-75" : ""}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${isFromUs ? "bg-blue-500" : "bg-gray-400"}`}>
                        {getInitials(senderName)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{senderName}</div>
                        <div className="text-[11px] text-gray-400">til {sanitize(msg.to).split(",")[0]}</div>
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400">{formatDate(msg.date)}</span>
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed pl-[42px]">
                    {sanitize(msg.bodyPlain?.trim() || msg.snippet)}
                  </div>
                </div>
              );
            })}

            {!loadingThread && !fullThread && (
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-semibold">
                    {getInitials(parseSenderName(selectedThread.from))}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{parseSenderName(selectedThread.from)}</div>
                    <div className="text-[11px] text-gray-400">{selectedThread.fromEmail}</div>
                  </div>
                </div>
                <p className="text-sm text-gray-600 pl-[42px]">{sanitize(selectedThread.snippet)}</p>
              </div>
            )}
          </div>

          {/* Reply box */}
          <div className="border-t border-gray-100 p-4 bg-white">
            {sentId === selectedThread.id ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Svar sendt fra {getAccountLabel(selectedThread.account, stats?.accounts ?? [])}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
                  <span className="text-[11px] text-gray-500">
                    Til: <strong>{parseSenderName(selectedThread.from)}</strong>
                    {" · "}Fra: <strong>{getAccountLabel(selectedThread.account, stats?.accounts ?? [])}</strong>
                  </span>
                  <button
                    onClick={generateDraft}
                    disabled={generatingDraft}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-60 transition-colors font-medium"
                  >
                    {generatingDraft ? (
                      <><div className="w-3 h-3 border border-white/60 border-t-transparent rounded-full animate-spin" />Genererer…</>
                    ) : (
                      <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>AI Udkast</>
                    )}
                  </button>
                </div>

                <textarea
                  ref={replyRef}
                  rows={5}
                  placeholder="Skriv dit svar… eller klik 'AI Udkast'"
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  className="w-full px-4 py-3 text-sm text-gray-800 resize-none focus:outline-none placeholder-gray-400 bg-white"
                />

                <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50">
                  <span className="text-[11px] text-gray-400">{replyText.length > 0 ? `${replyText.length} tegn` : ""}</span>
                  <button
                    onClick={sendReply}
                    disabled={sending || !replyText.trim()}
                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
                  >
                    {sending
                      ? <><div className="w-3.5 h-3.5 border border-white/60 border-t-transparent rounded-full animate-spin" />Sender…</>
                      : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>Send svar</>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-3 bg-gray-50/30">
          <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm text-gray-400">Vælg en email for at læse den</p>
          <p className="text-xs text-gray-300">Brug AI Udkast for automatisk svar</p>
        </div>
      )}
    </div>
  );
}

// ── Sidebar item ──────────────────────────────────────────────

function SidebarItem({
  label, count, active, onClick, icon, countColor = "text-gray-500 bg-gray-200",
}: {
  label: string; count: number; active: boolean;
  onClick: () => void; icon: React.ReactNode; countColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-white text-gray-900 font-medium shadow-sm" : "text-gray-600 hover:bg-white/60 hover:text-gray-900"
      }`}
    >
      <span className="flex-shrink-0 text-gray-400">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {count > 0 && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${countColor}`}>{count}</span>
      )}
    </button>
  );
}
