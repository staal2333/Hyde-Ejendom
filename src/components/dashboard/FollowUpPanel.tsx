"use client";

import { useCallback, useState } from "react";

interface FollowUpScore {
  email: string;
  name: string;
  score: number;
  warmth: "hot" | "warm" | "cool" | "cold";
  daysSinceContact: number;
  reason: string;
  propertyAddress?: string;
}

interface Suggestion {
  email: string;
  name: string;
  score: FollowUpScore;
  subject: string;
  body: string;
  propertyAddress?: string;
}

const WARMTH: Record<string, { label: string; cls: string }> = {
  hot: { label: "Varm", cls: "bg-red-100 text-red-700" },
  warm: { label: "Lun", cls: "bg-amber-100 text-amber-700" },
  cool: { label: "Kølig", cls: "bg-blue-100 text-blue-700" },
  cold: { label: "Kold", cls: "bg-slate-100 text-slate-500" },
};

export function FollowUpPanel({ onToast }: { onToast: (msg: string, type: "success" | "error" | "info") => void }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const [sending, setSending] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/agent/followup-suggestions");
      const d = (await r.json()) as { suggestions?: Suggestion[] };
      setSuggestions(d.suggestions || []);
      if (!d.suggestions?.length) onToast("Ingen opfølgninger lige nu", "info");
    } catch { onToast("Kunne ikke hente opfølgninger", "error"); }
    finally { setLoading(false); }
  }, [onToast]);

  const sendFollowUp = async (s: Suggestion) => {
    const draft = editDrafts[s.email] || { subject: s.subject, body: s.body };
    setSending(s.email);
    try {
      const r = await fetch("/api/mail/send-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: s.email, subject: draft.subject, body: draft.body }),
      });
      if (r.ok) {
        onToast(`Opfølgning sendt til ${s.name}`, "success");
        setSuggestions((prev) => prev.filter((x) => x.email !== s.email));
      } else {
        onToast("Kunne ikke sende", "error");
      }
    } catch { onToast("Fejl ved afsendelse", "error"); }
    finally { setSending(null); }
  };

  const updateDraft = (email: string, field: "subject" | "body", value: string) => {
    setEditDrafts((prev) => ({
      ...prev,
      [email]: { subject: prev[email]?.subject || "", body: prev[email]?.body || "", [field]: value },
    }));
  };

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Opfølgninger</h3>
          <p className="text-[10px] text-slate-400">AI-genererede opfølgninger baseret på jeres pipeline</p>
        </div>
        <button onClick={fetch_} disabled={loading} className="btn-secondary text-[11px]">
          {loading ? "Analyserer..." : "Hent forslag"}
        </button>
      </div>

      {suggestions.length === 0 && !loading && (
        <p className="text-xs text-slate-400 py-4 text-center">Klik &quot;Hent forslag&quot; for at analysere pipeline.</p>
      )}

      <div className="space-y-2 max-h-[500px] overflow-auto scroll-slim">
        {suggestions.map((s) => {
          const w = WARMTH[s.score.warmth] || WARMTH.cool;
          const isExpanded = expanded === s.email;
          const draft = editDrafts[s.email] || { subject: s.subject, body: s.body };

          return (
            <div key={s.email} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button
                onClick={() => setExpanded(isExpanded ? null : s.email)}
                className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors"
              >
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${w.cls}`}>{w.label}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{s.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {s.propertyAddress || s.email} &middot; {s.score.daysSinceContact}d siden
                  </p>
                </div>
                <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{s.score.score}/100</span>
                <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 border-t border-slate-100 pt-2 space-y-2">
                  <p className="text-[10px] text-slate-500">{s.score.reason}</p>
                  <label className="text-[10px] text-slate-500 block">
                    Emne
                    <input
                      className="input-field mt-0.5 !py-1 !text-xs"
                      value={draft.subject}
                      onChange={(e) => updateDraft(s.email, "subject", e.target.value)}
                    />
                  </label>
                  <label className="text-[10px] text-slate-500 block">
                    Besked
                    <textarea
                      className="input-field mt-0.5 !text-xs min-h-[100px]"
                      value={draft.body}
                      onChange={(e) => updateDraft(s.email, "body", e.target.value)}
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => sendFollowUp(s)}
                      disabled={sending === s.email}
                      className="btn-primary text-[11px]"
                    >
                      {sending === s.email ? "Sender..." : "Send opfølgning"}
                    </button>
                    <button
                      onClick={() => setSuggestions((prev) => prev.filter((x) => x.email !== s.email))}
                      className="btn-ghost text-[11px]"
                    >
                      Spring over
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
