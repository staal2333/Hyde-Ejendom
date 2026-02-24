"use client";

import { useState, useEffect, useCallback } from "react";
import { useDashboard } from "@/contexts/DashboardContext";

interface DiscoveryConfig {
  id: string;
  type: "scaffolding" | "street";
  city: string;
  street: string | null;
  minScore: number;
  minTraffic: number;
  isActive: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const AUTONOMY_KEY = "ejendom_ai_autonomy";
const RULES_KEY = "ejendom_ai_auto_rules";

const RULE_IDS = ["new-high-score", "retry-contact-pending", "retry-errors"] as const;
type RuleId = (typeof RULE_IDS)[number];

function loadAutonomy(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = localStorage.getItem(AUTONOMY_KEY);
    if (v === null) return 0;
    const n = parseInt(v, 10);
    return n >= 0 && n <= 3 ? n : 0;
  } catch {
    return 0;
  }
}

function loadRules(): Record<RuleId, boolean> {
  if (typeof window === "undefined") return { "new-high-score": false, "retry-contact-pending": false, "retry-errors": false };
  try {
    const raw = localStorage.getItem(RULES_KEY);
    if (!raw) return { "new-high-score": false, "retry-contact-pending": false, "retry-errors": false };
    const o = JSON.parse(raw) as Record<string, boolean>;
    return {
      "new-high-score": !!o["new-high-score"],
      "retry-contact-pending": !!o["retry-contact-pending"],
      "retry-errors": !!o["retry-errors"],
    };
  } catch {
    return { "new-high-score": false, "retry-contact-pending": false, "retry-errors": false };
  }
}

export function SettingsTab() {
  const { systemHealth, addToast } = useDashboard();
  const [autonomyLevel, setAutonomyLevel] = useState(0);
  const [rules, setRules] = useState<Record<RuleId, boolean>>(loadRules);

  const [discoveryConfigs, setDiscoveryConfigs] = useState<DiscoveryConfig[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [addingConfig, setAddingConfig] = useState(false);
  const [newConfigType, setNewConfigType] = useState<"scaffolding" | "street">("street");
  const [newConfigCity, setNewConfigCity] = useState("København");
  const [newConfigStreet, setNewConfigStreet] = useState("");
  const [newConfigMinScore, setNewConfigMinScore] = useState(6);
  const [newConfigMinTraffic, setNewConfigMinTraffic] = useState(10000);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    setAutonomyLevel(loadAutonomy());
    setRules(loadRules());
  }, []);

  const fetchDiscoveryConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/discovery-config");
      const data = await res.json();
      setDiscoveryConfigs(Array.isArray(data) ? data : []);
    } catch {
      setDiscoveryConfigs([]);
    } finally {
      setDiscoveryLoading(false);
    }
  }, []);

  useEffect(() => { fetchDiscoveryConfigs(); }, [fetchDiscoveryConfigs]);

  const handleAddConfig = useCallback(async () => {
    if (newConfigType === "street" && !newConfigStreet.trim()) {
      addToast("Angiv en gade for street-scanning", "error");
      return;
    }
    setSavingConfig(true);
    try {
      const res = await fetch("/api/discovery-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newConfigType,
          city: newConfigCity,
          street: newConfigType === "street" ? newConfigStreet.trim() : null,
          minScore: newConfigMinScore,
          minTraffic: newConfigMinTraffic,
          isActive: true,
        }),
      });
      if (res.ok) {
        addToast("Discovery config tilfojet", "success");
        setAddingConfig(false);
        setNewConfigStreet("");
        await fetchDiscoveryConfigs();
      } else {
        const data = await res.json();
        addToast(data.error || "Fejl ved oprettelse", "error");
      }
    } catch (e) {
      addToast("Fejl ved oprettelse", "error");
    } finally {
      setSavingConfig(false);
    }
  }, [newConfigType, newConfigCity, newConfigStreet, newConfigMinScore, newConfigMinTraffic, addToast, fetchDiscoveryConfigs]);

  const handleToggleConfig = useCallback(async (cfg: DiscoveryConfig) => {
    try {
      const res = await fetch("/api/discovery-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cfg, isActive: !cfg.isActive }),
      });
      if (res.ok) {
        addToast(cfg.isActive ? "Config deaktiveret" : "Config aktiveret", "info");
        await fetchDiscoveryConfigs();
      }
    } catch {
      addToast("Fejl ved toggle", "error");
    }
  }, [addToast, fetchDiscoveryConfigs]);

  const handleDeleteConfig = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/discovery-config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        addToast("Config slettet", "info");
        await fetchDiscoveryConfigs();
      }
    } catch {
      addToast("Fejl ved sletning", "error");
    }
  }, [addToast, fetchDiscoveryConfigs]);

  const setAutonomy = useCallback((level: number) => {
    setAutonomyLevel(level);
    try {
      localStorage.setItem(AUTONOMY_KEY, String(level));
    } catch {}
    addToast(`Autonomi sat til niveau ${level}`, "success");
  }, [addToast]);

  const toggleRule = useCallback((id: RuleId) => {
    setRules((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(RULES_KEY, JSON.stringify(next));
      } catch {}
      addToast(next[id] ? `Regel "${id}" aktiveret` : `Regel "${id}" deaktiveret`, "info");
      return next;
    });
  }, [addToast]);

  return (
    <div className="animate-fade-in space-y-6">
      <p className="text-xs text-slate-500 mb-4">Autonomi, regler og API-status.</p>

      {/* Autonomy Level */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Autonomi-niveau</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Bestem hvor meget systemet maa goere automatisk. Hoejere niveau = mere automation.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { level: 0, label: "Kun forslag", desc: "Ingen automatik. Alt skal godkendes manuelt.", color: "border-slate-200 bg-slate-50 text-slate-700" },
            { level: 1, label: "Auto-research", desc: "Research koeres automatisk naar regler matcher. Du godkender emails.", color: "border-blue-200 bg-blue-50 text-blue-700" },
            { level: 2, label: "Auto + foerste mail", desc: "Research + foerste mail sendes automatisk. Du godkender opfoelgning.", color: "border-violet-200 bg-violet-50 text-violet-700" },
            { level: 3, label: "Fuld automat", desc: "Alt inkl. opfoelgning koeres automatisk. Kun manuelt close/reopen.", color: "border-emerald-200 bg-emerald-50 text-emerald-700" },
          ] as const).map((opt) => (
            <button
              key={opt.level}
              type="button"
              onClick={() => setAutonomy(opt.level)}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all text-left ${opt.color} ${autonomyLevel === opt.level ? "ring-2 ring-brand-300 ring-offset-2" : "hover:shadow-md opacity-80 hover:opacity-100"}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase">{opt.label}</span>
                <span className="text-lg font-bold">{opt.level}</span>
              </div>
              <p className="text-[10px] leading-snug">{opt.desc}</p>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-3">Valgt niveau: {autonomyLevel}. Ændringen er gemt lokalt.</p>
      </div>

      {/* Auto-Discovery Config */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-cyan-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Auto-Discovery</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Konfigurer gader og byer der automatisk scannes af cron-jobbet <code className="bg-slate-100 px-1 rounded text-[9px]">/api/cron/auto-discover</code> dagligt kl. 06:00.
        </p>

        {discoveryLoading ? (
          <div className="text-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300/30 border-t-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">Henter konfigurationer...</p>
          </div>
        ) : (
          <>
            {discoveryConfigs.length === 0 && !addingConfig && (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center mb-4">
                <p className="text-xs text-slate-500 mb-2">Ingen discovery configs endnu. Tilfoj gader eller byer for automatisk scanning.</p>
              </div>
            )}

            {discoveryConfigs.length > 0 && (
              <div className="space-y-2 mb-4">
                {discoveryConfigs.map(cfg => (
                  <div
                    key={cfg.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${cfg.isActive ? "border-cyan-200 bg-cyan-50/30" : "border-slate-200 bg-slate-50/50 opacity-60"}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${cfg.type === "scaffolding" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                        {cfg.type === "scaffolding" ? "Stillads" : "Gade"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {cfg.type === "street" ? `${cfg.street}, ${cfg.city}` : cfg.city}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Min score: {cfg.minScore} · Min trafik: {cfg.minTraffic.toLocaleString("da-DK")}
                          {cfg.lastRunAt && ` · Seneste: ${new Date(cfg.lastRunAt).toLocaleDateString("da-DK")}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        type="button"
                        onClick={() => handleToggleConfig(cfg)}
                        title={cfg.isActive ? "Deaktiver" : "Aktiver"}
                        className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors flex-shrink-0 ${cfg.isActive ? "bg-cyan-500" : "bg-slate-300"}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg.isActive ? "left-5" : "left-0.5"}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteConfig(cfg.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Slet"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {addingConfig ? (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/30 p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 uppercase">Type</label>
                    <select
                      value={newConfigType}
                      onChange={e => setNewConfigType(e.target.value as "scaffolding" | "street")}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800"
                    >
                      <option value="street">Gade-scanning</option>
                      <option value="scaffolding">Stillads-scanning</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 uppercase">By</label>
                    <select
                      value={newConfigCity}
                      onChange={e => setNewConfigCity(e.target.value)}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800"
                    >
                      <option>København</option>
                      <option>Aarhus</option>
                      <option>Odense</option>
                      <option>Aalborg</option>
                      <option>Frederiksberg</option>
                    </select>
                  </div>
                </div>
                {newConfigType === "street" && (
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 uppercase">Gade</label>
                    <input
                      type="text"
                      value={newConfigStreet}
                      onChange={e => setNewConfigStreet(e.target.value)}
                      placeholder="F.eks. Vesterbrogade"
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 placeholder-slate-400"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 uppercase">Min score</label>
                    <input
                      type="number"
                      value={newConfigMinScore}
                      onChange={e => setNewConfigMinScore(Number(e.target.value))}
                      min={1} max={10} step={1}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 uppercase">Min trafik/dag</label>
                    <input
                      type="number"
                      value={newConfigMinTraffic}
                      onChange={e => setNewConfigMinTraffic(Number(e.target.value))}
                      min={0} step={1000}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-800"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddConfig}
                    disabled={savingConfig}
                    className="flex-1 px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold hover:bg-cyan-500 transition-colors disabled:opacity-50"
                  >
                    {savingConfig ? "Gemmer..." : "Gem"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddingConfig(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
                  >
                    Annuller
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingConfig(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-cyan-300 text-cyan-700 text-xs font-semibold hover:bg-cyan-50 hover:border-cyan-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                Tilfoej gade eller by
              </button>
            )}

            <div className="mt-4 p-3 bg-cyan-50 border border-cyan-200/60 rounded-xl">
              <p className="text-[10px] text-cyan-700">
                <strong>Cron-job:</strong> Auto-discovery koerer dagligt kl. 06:00 via <code className="bg-cyan-100 px-1 rounded">/api/cron/auto-discover</code>.
                Nye ejendomme stages, researches og faar email-udkast automatisk. Du godkender og sender i Staging.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Auto-Research Rules */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Auto-Research Regler</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Definer regler for automatisk research af nye ejendomme. Reglerne koeres som cron-job. Valg gemmes lokalt.</p>
        <div className="space-y-3">
          {[
            { id: "new-high-score" as RuleId, label: "Nye ejendomme med score >= 7 og trafik >= 15K", detail: "Koerer automatisk research paa nye ejendomme der scorer hoejt" },
            { id: "retry-contact-pending" as RuleId, label: "Genforsog research for ejendomme uden kontakt (max 72t)", detail: "Proever igen for ejendomme hvor kontakt mangler" },
            { id: "retry-errors" as RuleId, label: "Genforsog fejlede research-jobs", detail: "Automatisk retry paa ejendomme med fejl-status" },
          ].map((rule) => {
            const active = rules[rule.id];
            return (
              <div key={rule.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">{rule.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{rule.detail}</div>
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  <span className={`px-2.5 py-1 text-[11px] font-bold rounded-lg ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                    {active ? "Aktiv" : "Inaktiv"}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleRule(rule.id)}
                    title={active ? "Deaktiver regel" : "Aktiver regel"}
                    aria-label={active ? "Deaktiver regel" : "Aktiver regel"}
                    className={`w-11 h-6 rounded-full relative cursor-pointer transition-colors flex-shrink-0 ${active ? "bg-emerald-500" : "bg-slate-300"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200/60 rounded-xl">
          <p className="text-[10px] text-amber-700 mb-2">
            <strong>Cron-endpoint:</strong> Kald dette fra en scheduler (f.eks. cron-job.org) for at aktivere reglerne. Sæt CRON_SECRET i env vars.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-amber-100 px-2 py-1 rounded text-[10px] font-mono text-amber-900 flex-1 min-w-0 truncate">
              {typeof window !== "undefined" ? `${window.location.origin}/api/auto-research?secret=DIN_CRON_SECRET` : "/api/auto-research?secret=DIN_CRON_SECRET"}
            </code>
            <button
              type="button"
              onClick={() => {
                const url = typeof window !== "undefined"
                  ? `${window.location.origin}/api/auto-research?secret=DIN_CRON_SECRET`
                  : "/api/auto-research?secret=DIN_CRON_SECRET";
                navigator.clipboard.writeText(url).then(() => addToast("Cron-URL kopieret til udklipsholder", "success")).catch(() => addToast("Kunne ikke kopiere", "error"));
              }}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-200/80 hover:bg-amber-300/80 text-amber-900 text-[10px] font-semibold transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" /></svg>
              Kopiér
            </button>
          </div>
        </div>
      </div>

      {/* System Health (detailed) */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Systemstatus</h3>
          </div>
          {systemHealth && (
            <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${
              systemHealth.status === "healthy" ? "bg-emerald-100 text-emerald-700" :
              systemHealth.status === "degraded" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
            }`}>
              {systemHealth.status === "healthy" ? "Alle systemer OK" :
               systemHealth.status === "degraded" ? "Delvist nedsat" : "Problemer"}
            </span>
          )}
        </div>
        {systemHealth ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(systemHealth.pings || {}).map(([key, rawPing]) => {
              const ping = rawPing as { ok: boolean; service?: string; latencyMs?: number; error?: string };
              return (
                <div key={key} className={`p-3 rounded-xl border ${ping.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-700">{ping.service ?? key}</span>
                    <span className={`w-2 h-2 rounded-full ${ping.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                  </div>
                  <div className="flex items-center gap-2">
                    {ping.latencyMs != null && (
                      <span className="text-[10px] text-slate-500 font-mono">{ping.latencyMs}ms</span>
                    )}
                    <span className={`text-[10px] font-semibold ${ping.ok ? "text-emerald-600" : "text-red-600"}`}>
                      {ping.ok ? "Online" : "Offline"}
                    </span>
                  </div>
                  {ping.error && <p className="text-[9px] text-red-500 mt-1 truncate">{ping.error}</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300/30 border-t-slate-600 mx-auto mb-2" />
            <p className="text-xs">Henter systemstatus...</p>
          </div>
        )}
        <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400">
          <span>API Endpoint:</span>
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[9px] font-mono">GET /api/status</code>
          <span className="ml-auto">Opdateres hvert 2. minut</span>
        </div>
      </div>

      {/* Manglende integrationer (setup-guide) */}
      {systemHealth?.environment && (() => {
        const env = systemHealth.environment;
        const missing: { key: string; label: string }[] = [];
        if (!env.hubspot_token) missing.push({ key: "HUBSPOT_ACCESS_TOKEN", label: "HubSpot CRM" });
        if (!env.openai_key) missing.push({ key: "OPENAI_API_KEY", label: "OpenAI / GPT" });
        if (!env.cron_secret) missing.push({ key: "CRON_SECRET", label: "Cron / auto-research" });
        if (!env.gmail_configured) missing.push({ key: "GMAIL_CLIENT_ID + GMAIL_REFRESH_TOKEN", label: "Gmail (email-kø)" });
        if (!env.meta_ad_library) missing.push({ key: "META_AD_LIBRARY_ACCESS_TOKEN", label: "Meta Ad Library (Lead Sourcing)" });
        if (!env.supabase_configured) missing.push({ key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase" });
        if (missing.length === 0) return null;
        return (
          <div className="bg-amber-50 rounded-2xl border border-amber-200/60 shadow-[var(--card-shadow)] p-5">
            <h3 className="text-sm font-bold text-amber-900 uppercase tracking-wide mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              Manglende integrationer
            </h3>
            <p className="text-xs text-amber-800 mb-3">Følgende API-er er ikke konfigureret. Uden dem virker nogle funktioner ikke.</p>
            <ul className="space-y-1.5 mb-3">
              {missing.map((m) => (
                <li key={m.key} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-amber-900">{m.label}</span>
                  <code className="bg-amber-100/80 px-1.5 py-0.5 rounded text-[10px] font-mono text-amber-900">{m.key}</code>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-amber-700">
              Kopier <code className="bg-amber-100/80 px-1 rounded">.env.example</code> til <code className="bg-amber-100/80 px-1 rounded">.env.local</code> i projektroden og udfyld værdierne. På Vercel: Project Settings → Environment Variables.
            </p>
          </div>
        );
      })()}

      {/* API Integrations */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">API Integrationer</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Status for konfigurerede API-forbindelser. Lokalt: <code className="bg-slate-100 px-1 rounded text-[9px]">.env.local</code> — på Vercel: Project Settings → Environment Variables.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { name: "HubSpot CRM", envKey: "HUBSPOT_ACCESS_TOKEN", desc: "Ejendomme, kontakter, pipeline", check: "hubspot" },
            { name: "OpenAI / GPT", envKey: "OPENAI_API_KEY", desc: "AI analyse, email-udkast", check: "openai" },
            { name: "Gmail API", envKey: "GMAIL_CLIENT_ID", desc: "Email-afsendelse", check: "gmail" },
            { name: "Supabase", envKey: "NEXT_PUBLIC_SUPABASE_URL", desc: "Database, staging, OOH data", check: "supabase" },
            { name: "DAWA / Adresse", envKey: null, desc: "Adresseopslag (gratis)", check: "dawa" },
            { name: "CVR API", envKey: "CVR_API_USER", desc: "Virksomhedsopslag", check: "cvr" },
          ].map(api => {
            const ping = systemHealth?.pings?.[api.check] as { ok: boolean; latencyMs?: number; error?: string } | undefined;
            const isOk = ping?.ok ?? null;
            return (
              <div key={api.name} className={`p-3 rounded-xl border ${isOk === true ? "border-emerald-200/60 bg-emerald-50/30" : isOk === false ? "border-red-200/60 bg-red-50/30" : "border-slate-200 bg-slate-50/30"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-800">{api.name}</span>
                  <div className="flex items-center gap-1.5">
                    {ping?.latencyMs != null && <span className="text-[9px] font-mono text-slate-400">{ping.latencyMs}ms</span>}
                    <span className={`w-2.5 h-2.5 rounded-full ${isOk === true ? "bg-emerald-500" : isOk === false ? "bg-red-500" : "bg-slate-300"}`} />
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">{api.desc}</p>
                {api.envKey && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <code className="text-[8px] font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-500">{api.envKey}</code>
                    <span className={`text-[9px] font-semibold ${isOk === true ? "text-emerald-600" : isOk === false ? "text-red-500" : "text-slate-400"}`}>
                      {isOk === true ? "Forbundet" : isOk === false ? "Fejl" : "Ukendt"}
                    </span>
                  </div>
                )}
                {ping?.error && <p className="text-[9px] text-red-500 mt-1 truncate">{ping.error}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* State Machine Overview */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Ejendom State Machine</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Livscyklus for en ejendom i pipeline. Defineret i <code className="bg-slate-100 px-1 rounded text-[9px]">src/lib/state-machine.ts</code></p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {[
            { status: "NY_KRAEVER_RESEARCH", label: "Ny", color: "bg-slate-100 text-slate-700 border-slate-200" },
            { status: "RESEARCH_IGANGSAT", label: "Research", color: "bg-blue-50 text-blue-700 border-blue-200" },
            { status: "RESEARCH_DONE_CONTACT_PENDING", label: "Mangler kontakt", color: "bg-amber-50 text-amber-700 border-amber-200" },
            { status: "KLAR_TIL_UDSENDELSE", label: "Klar til mail", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
            { status: "FOERSTE_MAIL_SENDT", label: "Mail sendt", color: "bg-violet-50 text-violet-700 border-violet-200" },
            { status: "OPFOELGNING_SENDT", label: "Opfoelgning", color: "bg-purple-50 text-purple-700 border-purple-200" },
            { status: "SVAR_MODTAGET", label: "Svar", color: "bg-green-50 text-green-700 border-green-200" },
            { status: "LUKKET_VUNDET", label: "Vundet", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
            { status: "LUKKET_TABT", label: "Tabt", color: "bg-red-50 text-red-700 border-red-200" },
            { status: "FEJL", label: "Fejl", color: "bg-red-100 text-red-800 border-red-300" },
          ].map(s => (
            <div key={s.status} className={`p-2 rounded-lg border text-center ${s.color}`}>
              <div className="text-[10px] font-bold">{s.label}</div>
              <div className="text-[8px] font-mono mt-0.5 opacity-60">{s.status}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-3">
          Hvert status-skifte valideres af state-machine modulet. Automatiske handlinger (start research, generer email) styres af autonomi-niveauet.
        </p>
      </div>
    </div>
  );
}
