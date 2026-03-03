"use client";

import { useState } from "react";

interface LeadScore {
  companyName: string;
  industry?: string;
  estimatedAdSpend?: number;
  adPlatforms: string[];
  geoMatch: boolean;
  score: number;
  tier: "A" | "B" | "C";
  matchedPlacements: { name: string; areaSqm: number; reason: string }[];
  recommendation: string;
}

interface LeadInput {
  companyName: string;
  industry: string;
  city: string;
  estimatedAdSpend: string;
  adPlatforms: string;
}

const TIER_STYLE: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700",
  B: "bg-amber-100 text-amber-700",
  C: "bg-slate-100 text-slate-500",
};

const EMPTY_INPUT: LeadInput = { companyName: "", industry: "", city: "", estimatedAdSpend: "", adPlatforms: "" };

export function LeadIntelPanel({ onToast }: { onToast: (msg: string, type: "success" | "error" | "info") => void }) {
  const [results, setResults] = useState<LeadScore[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState<LeadInput[]>([{ ...EMPTY_INPUT }]);

  const updateInput = (idx: number, field: keyof LeadInput, value: string) => {
    setInputs((prev) => prev.map((inp, i) => i === idx ? { ...inp, [field]: value } : inp));
  };

  const addRow = () => setInputs((prev) => [...prev, { ...EMPTY_INPUT }]);
  const removeRow = (idx: number) => setInputs((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx));

  const analyze = async () => {
    const leads = inputs
      .filter((inp) => inp.companyName.trim())
      .map((inp) => ({
        companyName: inp.companyName,
        industry: inp.industry || undefined,
        city: inp.city || undefined,
        estimatedAdSpend: inp.estimatedAdSpend ? Number(inp.estimatedAdSpend) : undefined,
        adPlatforms: inp.adPlatforms ? inp.adPlatforms.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      }));

    if (leads.length === 0) { onToast("Udfyld mindst ét firmanavn", "error"); return; }

    setLoading(true);
    try {
      const r = await fetch("/api/agent/lead-intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads }),
      });
      const d = (await r.json()) as { leads?: LeadScore[]; summary?: string };
      setResults(d.leads || []);
      setSummary(d.summary || "");
    } catch { onToast("Analyse fejlede", "error"); }
    finally { setLoading(false); }
  };

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Lead Intelligence</h3>
          <p className="text-[10px] text-slate-400">Scorer og matcher leads til jeres placeringer</p>
        </div>
      </div>

      {/* Input rows */}
      <div className="space-y-1.5 mb-3">
        {inputs.map((inp, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-1.5 items-end text-[10px]">
            <div className="col-span-3">
              {idx === 0 && <span className="text-slate-400">Firma</span>}
              <input className="input-field !py-1 !text-[10px]" placeholder="Fx Matas" value={inp.companyName} onChange={(e) => updateInput(idx, "companyName", e.target.value)} />
            </div>
            <div className="col-span-2">
              {idx === 0 && <span className="text-slate-400">Branche</span>}
              <input className="input-field !py-1 !text-[10px]" placeholder="Retail" value={inp.industry} onChange={(e) => updateInput(idx, "industry", e.target.value)} />
            </div>
            <div className="col-span-2">
              {idx === 0 && <span className="text-slate-400">By</span>}
              <input className="input-field !py-1 !text-[10px]" placeholder="København" value={inp.city} onChange={(e) => updateInput(idx, "city", e.target.value)} />
            </div>
            <div className="col-span-2">
              {idx === 0 && <span className="text-slate-400">Ad spend/md</span>}
              <input type="number" className="input-field !py-1 !text-[10px] text-right" placeholder="50000" value={inp.estimatedAdSpend} onChange={(e) => updateInput(idx, "estimatedAdSpend", e.target.value)} />
            </div>
            <div className="col-span-2">
              {idx === 0 && <span className="text-slate-400">Platforme</span>}
              <input className="input-field !py-1 !text-[10px]" placeholder="Meta, TikTok" value={inp.adPlatforms} onChange={(e) => updateInput(idx, "adPlatforms", e.target.value)} />
            </div>
            <div className="col-span-1 flex justify-end">
              <button onClick={() => removeRow(idx)} className="text-slate-300 hover:text-red-500 text-xs">✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={addRow} className="btn-ghost text-[11px]">+ Tilføj lead</button>
        <button onClick={analyze} disabled={loading} className="btn-primary text-[11px]">
          {loading ? "Analyserer..." : "Analyser leads"}
        </button>
      </div>

      {/* Results */}
      {summary && (
        <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3 mb-3">
          <p className="text-[11px] text-indigo-800 whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-auto scroll-slim">
          {results.map((lead, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${TIER_STYLE[lead.tier]}`}>Tier {lead.tier}</span>
                <span className="text-xs font-semibold text-slate-800">{lead.companyName}</span>
                <span className="text-[10px] text-slate-400 ml-auto tabular-nums">{lead.score}/100</span>
              </div>
              <p className="text-[10px] text-slate-500">{lead.recommendation}</p>
              {lead.matchedPlacements.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[9px] font-semibold text-slate-600 uppercase">Matchede placeringer:</p>
                  {lead.matchedPlacements.map((p, j) => (
                    <p key={j} className="text-[10px] text-slate-500">→ {p.name} — {p.reason}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
