"use client";

import { useDashboard } from "@/contexts/DashboardContext";

export function SettingsTab() {
  const { systemHealth, addToast } = useDashboard();

  return (
    <div className="animate-fade-in space-y-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Indstillinger</h1>
        <p className="text-xs text-slate-500 mt-0.5">Konfigurer autonomi, regler og system-status</p>
      </div>

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
            <div key={opt.level}
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${opt.color} ${opt.level === 0 ? "ring-2 ring-brand-300 ring-offset-2" : "hover:shadow-md opacity-70"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase">{opt.label}</span>
                <span className="text-lg font-bold">{opt.level}</span>
              </div>
              <p className="text-[10px] leading-snug">{opt.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-3">Autonomi-niveau er sat til 0 (Kun forslag). Du kan skrue op efterhaanden som du stoler mere paa systemet.</p>
      </div>

      {/* Auto-Research Rules */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Auto-Research Regler</h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">Definer regler for automatisk research af nye ejendomme. Reglerne koeres som cron-job.</p>
        <div className="space-y-3">
          {[
            { id: "new-high-score", label: "Nye ejendomme med score >= 7 og trafik >= 15K", active: false, detail: "Koerer automatisk research paa nye ejendomme der scorer hoejt" },
            { id: "retry-contact-pending", label: "Genforsog research for ejendomme uden kontakt (max 72t)", active: false, detail: "Proever igen for ejendomme hvor kontakt mangler" },
            { id: "retry-errors", label: "Genforsog fejlede research-jobs", active: false, detail: "Automatisk retry paa ejendomme med fejl-status" },
          ].map((rule) => (
            <div key={rule.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700">{rule.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{rule.detail}</div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${rule.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                  {rule.active ? "Aktiv" : "Inaktiv"}
                </span>
                <div className={`w-8 h-4.5 rounded-full relative cursor-pointer transition-colors ${rule.active ? "bg-emerald-500" : "bg-slate-300"}`}
                  onClick={() => addToast("Auto-research regler kan aktiveres naar autonomi-niveau >= 1", "info")}>
                  <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${rule.active ? "left-4" : "left-0.5"}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200/60 rounded-xl">
          <p className="text-[10px] text-amber-700">
            <strong>Cron-endpoint:</strong> <code className="bg-amber-100 px-1 rounded text-[9px]">GET /api/auto-research?secret=DIN_CRON_SECRET</code><br />
            Kald dette endpoint fra en scheduler (f.eks. cron-job.org) for at aktivere reglerne. Saet CRON_SECRET i env vars.
          </p>
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
