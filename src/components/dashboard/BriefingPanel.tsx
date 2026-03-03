"use client";

import { useCallback, useEffect, useState } from "react";
import type { Briefing } from "@/lib/agents/briefing-types";

interface BriefingListResponse {
  items: Briefing[];
  total: number;
}

export function BriefingPanel() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/briefings?limit=1");
      const d = (await r.json()) as BriefingListResponse;
      if (d.items?.length > 0) setBriefing(d.items[0]);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLatest(); }, [fetchLatest]);

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await fetch("/api/briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const d = (await r.json()) as { success?: boolean; briefing?: Briefing };
      if (d.briefing) {
        setBriefing(d.briefing);
        setExpanded(true);
        setDismissed(false);
      }
    } catch { /* ignore */ }
    finally { setGenerating(false); }
  };

  const markRead = async () => {
    if (!briefing) return;
    setDismissed(true);
    try {
      await fetch("/api/briefings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", id: briefing.id }),
      });
    } catch { /* ignore */ }
  };

  if (dismissed) return null;

  const isToday = briefing?.date === new Date().toISOString().slice(0, 10);
  const hasUnread = briefing && !briefing.read;

  return (
    <div className="relative">
      {/* Compact bar */}
      <div className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-colors ${hasUnread ? "bg-indigo-50 border border-indigo-200" : "bg-slate-50 border border-slate-200"}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-base">🤖</span>
          {loading ? (
            <span className="text-slate-400">Henter briefing...</span>
          ) : briefing ? (
            <>
              <button onClick={() => setExpanded(!expanded)} className="text-left truncate hover:underline">
                <span className="font-semibold text-slate-700">Daglig briefing</span>
                <span className="text-slate-400 ml-1.5">{isToday ? "i dag" : briefing.date}</span>
                {hasUnread && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-indigo-500" />}
              </button>
            </>
          ) : (
            <span className="text-slate-400">Ingen briefing endnu</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={generate} disabled={generating} className="btn-ghost text-[10px] !py-0.5">
            {generating ? "Genererer..." : "Ny briefing"}
          </button>
          {briefing && expanded && (
            <button onClick={markRead} className="btn-ghost text-[10px] !py-0.5 text-slate-400">Luk</button>
          )}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && briefing && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Briefing — {briefing.date}</h3>
              <p className="text-[10px] text-slate-400">Genereret {new Date(briefing.createdAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <button onClick={() => setExpanded(false)} className="text-slate-400 hover:text-slate-600">&times;</button>
          </div>

          <div className="prose prose-sm prose-slate max-w-none text-[12px] leading-relaxed whitespace-pre-wrap">
            {briefing.summary}
          </div>

          {/* Quick stats grid */}
          {briefing.data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-100">
              {briefing.data.pipeline && (
                <StatCard label="Pipeline" value={briefing.data.pipeline.total} />
              )}
              {briefing.data.staged && (
                <StatCard label="Klar til godkendelse" value={briefing.data.staged.researched} accent="amber" />
              )}
              {briefing.data.followUps && briefing.data.followUps.due > 0 && (
                <StatCard label="Opfølgninger" value={briefing.data.followUps.due} accent="red" />
              )}
              {briefing.data.tilbud && (
                <StatCard label="Tilbuds-kladder" value={briefing.data.tilbud.drafts} accent="indigo" />
              )}
              {briefing.data.mail && (
                <StatCard label="Indbakke" value={briefing.data.mail.inboxCount} />
              )}
              {briefing.data.ooh && briefing.data.ooh.activeCampaigns > 0 && (
                <StatCard label="Aktive kampagner" value={briefing.data.ooh.activeCampaigns} accent="emerald" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  const colors: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const cls = accent && colors[accent] ? colors[accent] : "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <div className={`rounded-md border px-2.5 py-1.5 ${cls}`}>
      <p className="text-[10px] opacity-70">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
