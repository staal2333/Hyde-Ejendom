"use client";

import { useState, useEffect, useCallback } from "react";
import type { EnrichedThread } from "@/app/api/mail/unified-inbox/route";

const ACCOUNT_COLORS: Record<string, string> = {
  "sebastian.staal@hydemedia.dk": "bg-blue-100 text-blue-700",
  "ma@hydemedia.dk": "bg-purple-100 text-purple-700",
  "louis.lerche@hydemedia.dk": "bg-emerald-100 text-emerald-700",
};

const ACCOUNT_INITIALS: Record<string, string> = {
  "sebastian.staal@hydemedia.dk": "SS",
  "ma@hydemedia.dk": "MA",
  "louis.lerche@hydemedia.dk": "LL",
};

function priorityBadge(p: "high" | "medium" | "low") {
  if (p === "high") return "bg-red-100 text-red-700 border border-red-200";
  if (p === "medium") return "bg-amber-100 text-amber-700 border border-amber-200";
  return "bg-gray-100 text-gray-500 border border-gray-200";
}

function priorityLabel(p: "high" | "medium" | "low") {
  if (p === "high") return "Svar nu";
  if (p === "medium") return "Svar snart";
  return "Lav prioritet";
}

interface Stats {
  total: number;
  high: number;
  medium: number;
  low: number;
  knownContacts: number;
  accounts: { email: string; name: string; count: number }[];
}

type PriorityFilter = "all" | "high" | "medium" | "low";
type AccountFilter = "all" | string;

export function IndbakkeTab() {
  const [threads, setThreads] = useState<EnrichedThread[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [replySuccess, setReplySuccess] = useState<string | null>(null);

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/unified-inbox?limit=60");
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Fejl ved hentning af indbakke");
      }
      const data = await res.json();
      setThreads(data.threads || []);
      setStats(data.stats || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ukendt fejl");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const filtered = threads.filter((t) => {
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (accountFilter !== "all" && t.account !== accountFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches =
        t.subject?.toLowerCase().includes(q) ||
        t.from?.toLowerCase().includes(q) ||
        t.snippet?.toLowerCase().includes(q) ||
        t.contact?.company?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    return true;
  });

  const sendReply = async (thread: EnrichedThread) => {
    if (!replyText.trim()) return;
    setReplying(true);
    try {
      const res = await fetch("/api/mail/send-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: thread.id,
          to: thread.fromEmail,
          subject: `Re: ${thread.subject}`,
          body: replyText,
          propertyId: thread.propertyAddresses[0] || "inbox",
          fromAccount: thread.account,
        }),
      });
      const d = await res.json();
      if (d.success) {
        setReplySuccess(thread.id);
        setReplyText("");
        setTimeout(() => setReplySuccess(null), 3000);
      } else {
        alert(d.error || "Kunne ikke sende svar");
      }
    } catch {
      alert("Netværksfejl – prøv igen");
    } finally {
      setReplying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Samlet Indbakke</h1>
          <p className="text-sm text-gray-500 mt-0.5">Alle 3 mailkonti · AI-prioriteret</p>
        </div>
        <button
          onClick={fetchInbox}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Opdater
        </button>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500 mt-0.5">Emails i alt</div>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-4">
            <div className="text-2xl font-bold text-red-600">{stats.high}</div>
            <div className="text-xs text-red-500 mt-0.5">Svar nu</div>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <div className="text-2xl font-bold text-amber-600">{stats.medium}</div>
            <div className="text-xs text-amber-500 mt-0.5">Svar snart</div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.knownContacts}</div>
            <div className="text-xs text-blue-500 mt-0.5">Kendte kontakter</div>
          </div>
        </div>
      )}

      {/* Account breakdown */}
      {stats && (
        <div className="flex gap-2 flex-wrap">
          {stats.accounts.map((acc) => (
            <div key={acc.email} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-sm">
              <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${ACCOUNT_COLORS[acc.email] || "bg-gray-100 text-gray-600"}`}>
                {ACCOUNT_INITIALS[acc.email] || acc.email[0].toUpperCase()}
              </span>
              <span className="text-gray-600">{acc.name || acc.email}</span>
              <span className="font-semibold text-gray-900">{acc.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Søg i emne, afsender, firma..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* Priority filter */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(["all", "high", "medium", "low"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setPriorityFilter(f)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                priorityFilter === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f === "all" ? "Alle" : f === "high" ? "Svar nu" : f === "medium" ? "Snart" : "Lav"}
            </button>
          ))}
        </div>

        {/* Account filter */}
        <select
          value={accountFilter}
          onChange={e => setAccountFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">Alle konti</option>
          <option value="sebastian.staal@hydemedia.dk">Sebastian</option>
          <option value="ma@hydemedia.dk">Ma</option>
          <option value="louis.lerche@hydemedia.dk">Louis</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          <strong>Fejl:</strong> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Henter alle indbakker…</p>
        </div>
      )}

      {/* Thread list */}
      {!loading && !error && (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">
              Ingen emails matcher dine filtre
            </div>
          )}
          {filtered.map((thread) => {
            const isExpanded = expandedId === thread.id;
            const accentColor = ACCOUNT_COLORS[thread.account] || "bg-gray-100 text-gray-600";
            const initials = ACCOUNT_INITIALS[thread.account] || "?";

            return (
              <div
                key={thread.id}
                className={`bg-white border rounded-xl overflow-hidden transition-all ${
                  thread.priority === "high"
                    ? "border-red-200 shadow-sm shadow-red-50"
                    : "border-gray-100"
                }`}
              >
                {/* Thread row */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : thread.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Account avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5 ${accentColor}`}>
                      {initials}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm text-gray-900 truncate">{thread.from}</span>
                        {thread.contact && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            HubSpot
                          </span>
                        )}
                        {thread.contact?.company && (
                          <span className="text-xs text-gray-500">{thread.contact.company}</span>
                        )}
                        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${priorityBadge(thread.priority)}`}>
                          {priorityLabel(thread.priority)}
                        </span>
                      </div>

                      <div className="text-sm font-medium text-gray-800 mt-0.5 truncate">{thread.subject}</div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">{thread.snippet}</div>

                      {/* Meta */}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-xs text-gray-400">{thread.account}</span>
                        <span className="text-xs text-gray-400 italic">{thread.priorityReason}</span>
                        {thread.propertyAddresses.length > 0 && (
                          <span className="text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {thread.propertyAddresses[0]}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expand arrow */}
                    <svg
                      className={`w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded: reply box + HubSpot link */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                    {/* Contact info */}
                    {thread.contact && (
                      <div className="flex items-center justify-between bg-white border border-blue-100 rounded-lg px-3 py-2">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{thread.contact.name}</div>
                          {thread.contact.company && (
                            <div className="text-xs text-gray-500">{thread.contact.company}</div>
                          )}
                          <div className="text-xs text-gray-400">{thread.contact.email}</div>
                        </div>
                        {thread.contact.hubspotUrl && (
                          <a
                            href={thread.contact.hubspotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-2 py-1 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                          >
                            Åbn i HubSpot
                          </a>
                        )}
                      </div>
                    )}

                    {/* Properties */}
                    {thread.propertyAddresses.length > 0 && (
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Tilknyttede ejendomme:</span>{" "}
                        {thread.propertyAddresses.join(", ")}
                      </div>
                    )}

                    {/* Reply box */}
                    {replySuccess === thread.id ? (
                      <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Svar sendt fra {thread.account}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          rows={4}
                          placeholder={`Svar fra ${thread.account}…`}
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white resize-none"
                        />
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-400">
                            Sendes fra: <strong>{thread.account}</strong>
                          </span>
                          <button
                            onClick={() => sendReply(thread)}
                            disabled={replying || !replyText.trim()}
                            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {replying ? "Sender…" : "Send svar"}
                          </button>
                        </div>
                      </div>
                    )}
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
