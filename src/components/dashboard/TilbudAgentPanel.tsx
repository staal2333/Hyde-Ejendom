"use client";

import { useState } from "react";

interface PlacementMatch {
  name: string;
  areaSqm: number;
}

interface TilbudSuggestion {
  placement: PlacementMatch;
  discountPct: number;
  summary: string;
}

interface ParsedRequest {
  clientName?: string;
  budget?: number;
  fromWeek?: number;
  toWeek?: number;
  area?: string;
}

export function TilbudAgentPanel({ onToast }: { onToast: (msg: string, type: "success" | "error" | "info") => void }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<TilbudSuggestion[]>([]);
  const [recommendation, setRecommendation] = useState("");
  const [parsed, setParsed] = useState<ParsedRequest | null>(null);

  const submit = async () => {
    if (!text.trim()) { onToast("Skriv en beskrivelse", "error"); return; }
    setLoading(true);
    setSuggestions([]);
    setRecommendation("");
    setParsed(null);
    try {
      const r = await fetch("/api/agent/tilbud-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = (await r.json()) as {
        suggestions?: TilbudSuggestion[];
        aiRecommendation?: string;
        parsedRequest?: ParsedRequest;
      };
      setSuggestions(d.suggestions || []);
      setRecommendation(d.aiRecommendation || "");
      setParsed(d.parsedRequest || null);
      if (!d.suggestions?.length) onToast("Ingen placeringer matchede", "info");
    } catch { onToast("Tilbuds-agent fejlede", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="surface-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-900">Tilbuds-assistent</h3>
        <p className="text-[10px] text-slate-400">Beskriv kundens behov — AI&apos;en finder placeringer og laver tilbud</p>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          className="input-field flex-1 !text-xs"
          placeholder='Fx "SportMaster, budget 80.000, København, uge 15-20"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <button onClick={submit} disabled={loading} className="btn-primary text-[11px] shrink-0">
          {loading ? "Tænker..." : "Find tilbud"}
        </button>
      </div>

      {parsed && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 mb-3 flex flex-wrap gap-3 text-[10px] text-slate-600">
          {parsed.clientName && <span>Kunde: <strong>{parsed.clientName}</strong></span>}
          {parsed.budget && <span>Budget: <strong>{parsed.budget.toLocaleString("da-DK")} DKK</strong></span>}
          {parsed.fromWeek && <span>Uge: <strong>{parsed.fromWeek}–{parsed.toWeek}</strong></span>}
          {parsed.area && <span>Område: <strong>{parsed.area}</strong></span>}
        </div>
      )}

      {recommendation && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 mb-3">
          <p className="text-[10px] font-semibold text-emerald-700 mb-1">AI-anbefaling</p>
          <p className="text-[11px] text-emerald-800 whitespace-pre-wrap">{recommendation}</p>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800">{s.placement.name}</p>
                <p className="text-[10px] text-slate-500">{s.summary}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-indigo-600 tabular-nums">{s.discountPct.toFixed(1)}%</p>
                <p className="text-[9px] text-slate-400">rabat</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
