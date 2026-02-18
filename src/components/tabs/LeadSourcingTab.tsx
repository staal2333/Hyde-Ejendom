"use client";

import { useState, useCallback } from "react";
import { useDashboard } from "@/contexts/DashboardContext";

export interface LeadCompany {
  cvr: string;
  name: string;
  address: string;
  industry?: string;
  website?: string;
  domain: string | null;
  egenkapital: number | null;
  resultat: number | null;
  omsaetning: number | null;
  inCrm: boolean;
  source: string;
}

export function LeadSourcingTab() {
  const { addToast } = useDashboard();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverCountry, setDiscoverCountry] = useState("DK");
  const [discoverPlatform, setDiscoverPlatform] = useState<"all" | "instagram">("all");
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [companies, setCompanies] = useState<LeadCompany[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState<Record<string, string>>({});

  const formatNumber = (n: number | null) =>
    n == null ? "—" : new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(n);

  const fetchCompanies = useCallback(async () => {
    const raw = input.trim().replace(/\s+/g, "\n");
    const lines = raw.split("\n").map((l) => l.trim().replace(/\D/g, "")).filter(Boolean);
    const cvrs = [...new Set(lines)];
    if (cvrs.length === 0) {
      addToast("Indtast mindst ét CVR-nummer (én per linje eller kommasepareret)", "info");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/lead-sourcing/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cvrs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke hente virksomheder");
      setCompanies(data.companies || []);
      addToast(`${data.companies?.length ?? 0} virksomheder hentet (Proff: egenkapital/resultat; dedupe fra Contacts)`, "success");
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fejl ved hentning", "error");
    } finally {
      setLoading(false);
    }
  }, [input, addToast]);

  const runDiscover = useCallback(async () => {
    setDiscoverLoading(true);
    try {
      const res = await fetch("/api/lead-sourcing/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "meta",
          query: discoverQuery.trim() || undefined,
          country: discoverCountry.trim() || "DK",
          limit: 40,
          platform: discoverPlatform,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke køre discovery");
      setCompanies(data.companies || []);
      if (data.platformFallback) {
        addToast("Instagram-filter gav API-fejl hos Meta; viste annoncører fra alle platforme i stedet.", "info");
      }
      const sourceLabel = discoverPlatform === "instagram" && !data.platformFallback ? "Instagram" : "Meta (Facebook + Instagram)";
      addToast(
        data.companies?.length
          ? `${data.companies.length} leads fundet via ${sourceLabel} Ad Library (CVR + Proff + dedupe)`
          : "Ingen nye leads fundet. Prøv andre søgeord.",
        data.companies?.length ? "success" : "info"
      );
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fejl ved discovery", "error");
    } finally {
      setDiscoverLoading(false);
    }
  }, [discoverQuery, discoverCountry, discoverPlatform, addToast]);

  const addToHubSpot = useCallback(
    async (company: LeadCompany) => {
      setAddingId(company.cvr);
      try {
        const email = contactEmail[company.cvr]?.trim() || undefined;
        const contacts = email ? [{ email, firstname: "", lastname: "" }] : [];
        const res = await fetch("/api/lead-sourcing/add-to-hubspot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: {
              name: company.name,
              domain: company.domain || company.website,
              address: company.address,
              website: company.website,
              cvr: company.cvr,
            },
            contacts: contacts.map((c) => ({ email: c.email, firstname: c.firstname, lastname: c.lastname })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Kunne ikke oprette i HubSpot");
        addToast(`${company.name} tilføjet til HubSpot (Company + ${contacts.length ? "Contact" : "0 kontakter"})`, "success");
        setCompanies((prev) => prev.filter((c) => c.cvr !== company.cvr));
        setContactEmail((prev) => ({ ...prev, [company.cvr]: "" }));
      } catch (e) {
        addToast(e instanceof Error ? e.message : "Fejl ved tilføjelse", "error");
      } finally {
        setAddingId(null);
      }
    },
    [contactEmail, addToast]
  );

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/[\r\n]+/).map((l) => l.trim());
      const first = lines[0] ?? "";
      const maybeHeader = /^[a-zæøå\s,;]+$/i.test(first);
      const start = maybeHeader && lines.length > 1 ? 1 : 0;
      const cvrs = lines.slice(start).map((l) => l.replace(/^[^0-9]*([0-9]{8})[^0-9]*.*/, "$1").trim()).filter((c) => c.length === 8);
      setInput(cvrs.join("\n"));
      addToast(`${cvrs.length} CVR-numre indlæst fra fil`, "success");
    };
    reader.readAsText(file);
    e.target.value = "";
  }, [addToast]);

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Lead Sourcing</h1>
        <p className="text-xs text-slate-500 mt-0.5">AI finder leads automatisk (Meta Ad Library) eller du indtaster CVR selv; Proff + dedupe mod Contacts</p>
      </div>

      {/* AI Lead Discovery – Meta Ad Library */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 rounded-2xl border border-indigo-200/60 shadow-[var(--card-shadow)] p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-indigo-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </span>
          AI Lead Discovery
        </h2>
        <p className="text-xs text-slate-600 mb-4">Find virksomheder der annoncerer på Meta (Facebook/Instagram). Systemet henter annoncører, matcher til CVR, beriger med Proff og ekskluderer jeres eksisterende kontakter.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Søgeord (valgfri)</label>
            <input
              type="text"
              value={discoverQuery}
              onChange={(e) => setDiscoverQuery(e.target.value)}
              placeholder="fx reklame, marketing, retail"
              className="w-56 px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Kilde</label>
            <select
              value={discoverPlatform}
              onChange={(e) => setDiscoverPlatform(e.target.value as "all" | "instagram")}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
            >
              <option value="all">Meta (Facebook + Instagram)</option>
              <option value="instagram">Kun Instagram</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Land</label>
            <select
              value={discoverCountry}
              onChange={(e) => setDiscoverCountry(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
            >
              <option value="DK">Danmark</option>
              <option value="NO">Norge</option>
              <option value="SE">Sverige</option>
            </select>
          </div>
          <button
            type="button"
            onClick={runDiscover}
            disabled={discoverLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {discoverLoading ? (
              <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            )}
            Kør lead discovery
          </button>
        </div>
        <p className="text-[10px] text-slate-500 mt-3">Kræver <code className="bg-white/80 px-1 rounded">META_AD_LIBRARY_ACCESS_TOKEN</code> i .env (Meta App med Ad Library API).</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3">Eller: Indtast CVR-numre</h2>
        <p className="text-xs text-slate-500 mb-3">Én per linje eller kommasepareret. Du kan også uploade en CSV (første kolonne eller linje med 8-cifrede CVR bruges).</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="35236175&#10;12345678&#10;..."
            rows={4}
            className="flex-1 min-w-0 p-3 border border-slate-200 rounded-xl text-sm font-mono placeholder:text-slate-400"
          />
          <div className="flex flex-col gap-2">
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <input type="file" accept=".csv,.txt" className="sr-only" onChange={handleFileUpload} />
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload CSV
            </label>
            <button
              type="button"
              onClick={fetchCompanies}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-sm font-bold rounded-xl shadow-lg disabled:opacity-50"
            >
              {loading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
              )}
              Hent virksomheder
            </button>
          </div>
        </div>
      </div>

      {companies.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Virksomheder ({companies.length})</h2>
            <span className="text-[10px] text-slate-400">Egenkapital/resultat fra Proff · allerede i CRM (Contacts) er markeret</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-4 py-2.5 font-semibold text-slate-700">Virksomhed</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">CVR</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">Egenkapital</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">Resultat</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">Adresse</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">CRM</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">Kontakt (valgfri)</th>
                  <th className="px-4 py-2.5 font-semibold text-slate-700">Handling</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.cvr} className={`border-b border-slate-50 ${c.inCrm ? "bg-amber-50/50" : ""}`}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{c.name}</td>
                    <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{c.cvr}</td>
                    <td className="px-4 py-2.5 text-slate-700 tabular-nums">{formatNumber(c.egenkapital)}</td>
                    <td className="px-4 py-2.5 text-slate-700 tabular-nums">{formatNumber(c.resultat)}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-[180px] truncate">{c.address}</td>
                    <td className="px-4 py-2.5">
                      {c.inCrm ? (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Allerede i CRM</span>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="email"
                        placeholder="email@firma.dk"
                        value={contactEmail[c.cvr] ?? ""}
                        onChange={(e) => setContactEmail((prev) => ({ ...prev, [c.cvr]: e.target.value }))}
                        className="w-40 px-2 py-1 border border-slate-200 rounded text-xs"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => addToHubSpot(c)}
                        disabled={addingId === c.cvr || c.inCrm}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {addingId === c.cvr ? (
                          <span className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" />
                        ) : (
                          "Tilføj til HubSpot"
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {companies.length === 0 && !loading && (
        <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-8 text-center">
          <p className="text-sm text-slate-500">Indtast CVR-numre ovenfor og klik «Hent virksomheder». Virksomheder som allerede findes blandt jeres HubSpot-kontakter vises som «Allerede i CRM».</p>
        </div>
      )}
    </div>
  );
}
