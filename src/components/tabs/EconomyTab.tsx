"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TabBar from "../ui/TabBar";
import Ic from "../ui/Icon";
import type { InvoiceLineType, InvoiceScanResult } from "@/lib/case/invoice-scan";
import {
  CASE_STATUSES,
  CASE_STATUS_COLOR,
  CASE_STATUS_LABEL,
  OPERATING_EXPENSE_LABEL,
  caseDays,
  createDefaultCase,
  createDefaultCaseSale,
  lookupKommuneRate,
  netMedieForSale,
  type Case,
  type CaseSale,
  type CaseStatus,
  type CostSettings,
  type OperatingExpense,
  type OperatingExpenseCategory,
} from "@/lib/case/types";
import {
  applyOperatingExpenses,
  calcCaseEconomics,
  calcLiquidityForecast,
  calcMonthlyForecast,
  calcPortfolioKPIs,
  totalMonthlyOperatingCost,
} from "@/lib/case/calculations";
import type { Tilbud } from "@/lib/tilbud/types";

export interface EconomyTabProps {
  onToast: (message: string, type: "success" | "error" | "info") => void;
}

type SubTab = "cases" | "forecast" | "settings";

const CI = "h-7 w-full rounded-md border border-slate-300 bg-white px-2 text-[11px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-300";
const CIR = `${CI} text-right tabular-nums`;
const LABEL = "text-[10px] font-semibold uppercase tracking-wide text-slate-500";

function fmtDKK(n: number) {
  return `${Math.round(n).toLocaleString("da-DK")} kr`;
}

function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

const SUB_TABS = [
  { id: "cases" as SubTab, label: "Cases", icon: "M3 6.75A2.25 2.25 0 015.25 4.5h13.5A2.25 2.25 0 0121 6.75v10.5A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25V6.75z" },
  { id: "forecast" as SubTab, label: "Likviditet", icon: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" },
  { id: "settings" as SubTab, label: "Indstillinger", icon: "M10.343 3.94c.09-.542.56-.94 1.11-.94h1.094c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.398.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.93l.15-.893z" },
];

// ─── Sub-component: KPI card ────────────────────────────────

function KpiCard({
  label,
  value,
  sublabel,
  tone = "default",
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: "default" | "emerald" | "blue" | "amber" | "rose";
}) {
  const toneClass = {
    default: "bg-white border-slate-200",
    emerald: "bg-emerald-50 border-emerald-200",
    blue: "bg-blue-50 border-blue-200",
    amber: "bg-amber-50 border-amber-200",
    rose: "bg-rose-50 border-rose-200",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900 tabular-nums">{value}</div>
      {sublabel && <div className="text-[10px] text-slate-500 mt-0.5">{sublabel}</div>}
    </div>
  );
}

// ─── Sub-component: Section header ──────────────────────────

function SectionHeader({
  icon,
  title,
  hint,
  action,
}: {
  icon: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-violet-100 text-violet-600 shrink-0">
          <Ic d={icon} className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-slate-900 leading-tight">{title}</div>
          {hint && <div className="text-[10px] text-slate-400 leading-tight">{hint}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ─── Main tab component ─────────────────────────────────────

export function EconomyTab({ onToast }: EconomyTabProps) {
  const [subTab, setSubTab] = useState<SubTab>("cases");

  // Cases state
  const [cases, setCases] = useState<Case[]>([]);
  const [tilbud, setTilbud] = useState<Tilbud[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Case>(() => createDefaultCase(1));
  const [filter, setFilter] = useState<CaseStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [expandedAddresses, setExpandedAddresses] = useState<Set<string>>(new Set());

  const toggleAddress = (addr: string) => {
    setExpandedAddresses((prev) => {
      const next = new Set(prev);
      if (next.has(addr)) next.delete(addr);
      else next.add(addr);
      return next;
    });
  };

  // Settings state
  const [settings, setSettings] = useState<CostSettings | null>(null);
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [newExpenseLabel, setNewExpenseLabel] = useState("");
  const [newKommuneName, setNewKommuneName] = useState("");

  // ─── Fetch ──────────────────────────────────────────────────

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/cases?limit=500");
      const d = (await r.json()) as { items: Case[] };
      setCases(d.items || []);
    } catch {
      onToast("Kunne ikke hente cases", "error");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  const fetchTilbud = useCallback(async () => {
    try {
      const r = await fetch("/api/tilbud?limit=100");
      const d = (await r.json()) as { items: Tilbud[] };
      setTilbud(d.items || []);
    } catch {
      // silent
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const r = await fetch("/api/case-settings");
      const d = (await r.json()) as CostSettings;
      setSettings(d);
    } catch {
      onToast("Kunne ikke hente indstillinger", "error");
    }
  }, [onToast]);

  const fetchExpenses = useCallback(async () => {
    try {
      const r = await fetch("/api/operating-expenses");
      const d = (await r.json()) as { items: OperatingExpense[] };
      setExpenses(d.items || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCases();
    fetchTilbud();
    fetchSettings();
    fetchExpenses();
  }, [fetchCases, fetchTilbud, fetchSettings, fetchExpenses]);

  // ─── Computed ──────────────────────────────────────────────

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.caseNumber.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.bygherreNavn.toLowerCase().includes(q)
      );
    });
  }, [cases, filter, search]);

  const kpis = useMemo(() => calcPortfolioKPIs(cases), [cases]);

  // Group filtered cases by address — one box per building
  const groupedByAddress = useMemo(() => {
    const map = new Map<string, Case[]>();
    for (const c of filteredCases) {
      const key = (c.address || "").trim() || "(Uden adresse)";
      const list = map.get(key);
      if (list) list.push(c);
      else map.set(key, [c]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "da"));
  }, [filteredCases]);

  const monthlyOpEx = useMemo(() => totalMonthlyOperatingCost(expenses), [expenses]);

  const forecast = useMemo(() => {
    const raw = calcMonthlyForecast(cases, 12);
    return monthlyOpEx > 0 ? applyOperatingExpenses(raw, monthlyOpEx) : raw;
  }, [cases, monthlyOpEx]);

  const forecastTotal = useMemo(
    () => forecast.reduce((sum, m) => sum + m.expectedDB, 0),
    [forecast]
  );

  const forecastMax = useMemo(
    () => Math.max(1, ...forecast.map((m) => Math.abs(m.expectedDB))),
    [forecast]
  );

  // Likviditet — runway-projektion
  const liquidity = useMemo(
    () =>
      calcLiquidityForecast(
        cases,
        monthlyOpEx,
        settings?.cashBalance ?? 0,
        settings?.momsPct ?? 25,
        12
      ),
    [cases, monthlyOpEx, settings?.cashBalance, settings?.momsPct]
  );

  const econ = useMemo(() => calcCaseEconomics(form), [form]);

  // ─── Mutations ──────────────────────────────────────────────

  const openCase = useCallback((c: Case) => {
    setForm(c);
    setSelectedId(c.id);
    const addr = (c.address || "").trim() || "(Uden adresse)";
    setExpandedAddresses((prev) => new Set(prev).add(addr));
  }, []);

  const createBlank = useCallback(() => {
    setForm(createDefaultCase(Date.now()));
    setSelectedId(null);
  }, []);

  const createFromTilbud = useCallback(
    async (tilbudId: string) => {
      try {
        const r = await fetch("/api/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromTilbudId: tilbudId }),
        });
        const d = (await r.json()) as { success?: boolean; case?: Case; error?: string };
        if (!r.ok || !d.case) {
          onToast(d.error || "Kunne ikke oprette case", "error");
          return;
        }
        await fetchCases();
        openCase(d.case);
        onToast("Case oprettet fra tilbud", "success");
      } catch {
        onToast("Fejl ved oprettelse", "error");
      }
    },
    [fetchCases, openCase, onToast]
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const body = selectedId ? { ...form, id: selectedId } : { ...form, id: undefined };
      const r = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { success?: boolean; case?: Case; error?: string };
      if (!r.ok || !d.case) {
        onToast(d.error || "Kunne ikke gemme", "error");
        return;
      }
      setForm(d.case);
      setSelectedId(d.case.id);
      await fetchCases();
      onToast("Case gemt", "success");
    } catch {
      onToast("Fejl ved gem", "error");
    } finally {
      setSaving(false);
    }
  }, [form, selectedId, fetchCases, onToast]);

  const deleteSelected = useCallback(async () => {
    if (!selectedId) return;
    if (!confirm("Slet denne case?")) return;
    try {
      const r = await fetch(`/api/cases/${selectedId}`, { method: "DELETE" });
      if (!r.ok) {
        onToast("Kunne ikke slette", "error");
        return;
      }
      setSelectedId(null);
      setForm(createDefaultCase(Date.now()));
      await fetchCases();
      onToast("Case slettet", "info");
    } catch {
      onToast("Fejl ved sletning", "error");
    }
  }, [selectedId, fetchCases, onToast]);

  const updateField = <K extends keyof Case>(k: K, v: Case[K]) => {
    setForm((p) => ({ ...p, [k]: v }));
  };

  const updateCosts = (patch: Partial<Case["costs"]>) => {
    setForm((p) => ({ ...p, costs: { ...p.costs, ...patch } }));
  };

  const addSale = () => {
    setForm((p) => ({
      ...p,
      sales: [...(p.sales || []), createDefaultCaseSale((p.sales?.length || 0) + 1)],
    }));
  };

  const updateSale = (id: string, patch: Partial<CaseSale>) => {
    setForm((p) => ({
      ...p,
      sales: (p.sales || []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const removeSale = (id: string) => {
    setForm((p) => ({ ...p, sales: (p.sales || []).filter((s) => s.id !== id) }));
  };

  // Fastpriser brugt i tilbud (salgspris til bygherre)
  const PRODUKTION_SALG_PER_SQM = 150;
  const MONTERING_SALG_PER_SQM = 125;

  const days = caseDays(form);

  const applyCostDefaults = useCallback(() => {
    if (!settings) return;
    const area = form.areaSqm || 0;
    const months = Math.max(1, form.varighedMaaneder || 1);
    const d = caseDays(form);
    const kommuneRate = lookupKommuneRate(settings.kommunaleRates || [], form.kommune);
    const kommunaleSalg = area * kommuneRate * d;
    setForm((p) => ({
      ...p,
      costs: {
        ...p.costs,
        // Salgspriser (faktureres bygherre)
        produktionSalg: area * PRODUKTION_SALG_PER_SQM,
        monteringSalg: area * MONTERING_SALG_PER_SQM,
        kommunaleSalg: kommuneRate > 0 ? kommunaleSalg : p.costs.kommunaleSalg,
        // Kostpriser (Hyde's faktiske udgift)
        produktionKost: area * settings.produktionKostPerSqm,
        monteringKost: area * settings.monteringKostPerSqm,
        kommunaleKost: kommuneRate > 0 ? kommunaleSalg : p.costs.kommunaleKost, // passthrough
        internalOverhead: months * settings.defaultOverheadPerMonth,
      },
    }));
    const kommuneNote =
      form.kommune && kommuneRate > 0
        ? ` — kommunalt beregnet for ${form.kommune} (${kommuneRate} kr/m²/døgn × ${area} m² × ${d} døgn)`
        : form.kommune && kommuneRate === 0
        ? ` — ingen rate sat for ${form.kommune}`
        : "";
    onToast(`Priser opdateret${kommuneNote}`, "info");
  }, [settings, form, onToast]);

  const setHydeShare = (pct: number) => {
    const clamped = Math.max(0, Math.min(100, pct));
    setForm((p) => ({ ...p, hydeSharePct: clamped, bygherreSharePct: 100 - clamped }));
  };

  // ─── Invoice scan ────────────────────────────────────────

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<InvoiceScanResult | null>(null);
  const [scanLineTypes, setScanLineTypes] = useState<Record<number, InvoiceLineType>>({});
  const [scanLineEnabled, setScanLineEnabled] = useState<Record<number, boolean>>({});

  // Customer invoice scan (creates a whole case)
  const customerInvoiceRef = useRef<HTMLInputElement>(null);
  const [customerScanLoading, setCustomerScanLoading] = useState(false);

  const openCustomerInvoicePicker = () => customerInvoiceRef.current?.click();

  const handleCustomerInvoice = useCallback(
    async (file: File) => {
      setCustomerScanLoading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("previewOnly", "true"); // scan → review før oprettelse
        const r = await fetch("/api/case/customer-invoice", { method: "POST", body: fd });
        const d = (await r.json()) as {
          success?: boolean;
          caseInput?: Partial<Case>;
          error?: string;
        };
        if (!r.ok || !d.caseInput) {
          onToast(d.error || "Kunne ikke læse kunde-faktura", "error");
          return;
        }
        // Indlæs som ugemt kladde — brugeren gennemser i detalje-panelet og klikker "Opret case"
        const draft: Case = {
          ...createDefaultCase(Date.now()),
          ...d.caseInput,
          id: `case-draft-${Date.now()}`,
        };
        setForm(draft);
        setSelectedId(null);
        setSubTab("cases");
        onToast("Faktura scannet — gennemse tallene og klik 'Opret case'", "info");
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Fejl ved upload", "error");
      } finally {
        setCustomerScanLoading(false);
      }
    },
    [onToast]
  );

  const openScanPicker = () => fileInputRef.current?.click();

  const handleInvoiceFile = useCallback(
    async (file: File) => {
      setScanLoading(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch("/api/case/invoice-scan", { method: "POST", body: fd });
        const d = (await r.json()) as { result?: InvoiceScanResult; error?: string };
        if (!r.ok || !d.result) {
          onToast(d.error || "Scan fejlede", "error");
          return;
        }
        setScanResult(d.result);
        const typeMap: Record<number, InvoiceLineType> = {};
        const enabledMap: Record<number, boolean> = {};
        d.result.lines.forEach((l, i) => {
          typeMap[i] = l.type;
          enabledMap[i] = true;
        });
        setScanLineTypes(typeMap);
        setScanLineEnabled(enabledMap);
        onToast(`Faktura scannet — ${d.result.lines.length} linjer fundet`, "success");
      } catch (err) {
        onToast(err instanceof Error ? err.message : "Fejl ved upload", "error");
      } finally {
        setScanLoading(false);
      }
    },
    [onToast]
  );

  const closeScanModal = () => {
    setScanResult(null);
    setScanLineTypes({});
    setScanLineEnabled({});
  };

  const applyScannedInvoice = () => {
    if (!scanResult) return;
    let produktion = 0;
    let montering = 0;
    let kommunale = 0;
    let overhead = 0;
    scanResult.lines.forEach((line, i) => {
      if (!scanLineEnabled[i]) return;
      const t = scanLineTypes[i] || "andet";
      const amt = Math.max(0, line.amount || 0);
      switch (t) {
        case "produktion":
          produktion += amt;
          break;
        case "montering":
          montering += amt;
          break;
        case "kommunale":
          kommunale += amt;
          break;
        case "overhead":
        case "andet":
          overhead += amt;
          break;
      }
    });
    setForm((p) => ({
      ...p,
      costs: {
        ...p.costs,
        produktionKost: (p.costs.produktionKost || 0) + produktion,
        monteringKost: (p.costs.monteringKost || 0) + montering,
        kommunaleKost: (p.costs.kommunaleKost || p.costs.kommunaleGebyr || 0) + kommunale,
        internalOverhead: (p.costs.internalOverhead || 0) + overhead,
      },
    }));
    onToast(
      `Anvendt på case: ${[
        produktion > 0 && `${fmtDKK(produktion)} produktion`,
        montering > 0 && `${fmtDKK(montering)} montering`,
        kommunale > 0 && `${fmtDKK(kommunale)} kommunale`,
        overhead > 0 && `${fmtDKK(overhead)} overhead`,
      ]
        .filter(Boolean)
        .join(", ")}`,
      "success"
    );
    closeScanModal();
  };

  // ─── Settings mutations ──────────────────────────────────

  const saveSettings = useCallback(
    async (patch: Partial<CostSettings>) => {
      try {
        const r = await fetch("/api/case-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const d = (await r.json()) as { success?: boolean; settings?: CostSettings; error?: string };
        if (!r.ok || !d.settings) {
          onToast(d.error || "Kunne ikke gemme", "error");
          return;
        }
        setSettings(d.settings);
        onToast("Indstillinger gemt", "success");
      } catch {
        onToast("Fejl ved gem", "error");
      }
    },
    [onToast]
  );

  const addExpense = useCallback(async () => {
    if (!newExpenseLabel.trim()) {
      onToast("Indtast navn", "error");
      return;
    }
    try {
      const r = await fetch("/api/operating-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newExpenseLabel.trim(), category: "andet", amountPerMonth: 0, enabled: true }),
      });
      if (!r.ok) {
        onToast("Kunne ikke oprette", "error");
        return;
      }
      setNewExpenseLabel("");
      await fetchExpenses();
    } catch {
      onToast("Fejl", "error");
    }
  }, [newExpenseLabel, fetchExpenses, onToast]);

  const updateExpense = useCallback(
    async (id: string, patch: Partial<OperatingExpense>) => {
      try {
        const r = await fetch(`/api/operating-expenses/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...patch, id }),
        });
        if (!r.ok) {
          onToast("Kunne ikke gemme", "error");
          return;
        }
        await fetchExpenses();
      } catch {
        onToast("Fejl", "error");
      }
    },
    [fetchExpenses, onToast]
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      if (!confirm("Slet denne driftsudgift?")) return;
      try {
        const r = await fetch(`/api/operating-expenses/${id}`, { method: "DELETE" });
        if (!r.ok) {
          onToast("Kunne ikke slette", "error");
          return;
        }
        await fetchExpenses();
      } catch {
        onToast("Fejl", "error");
      }
    },
    [fetchExpenses, onToast]
  );

  // ─── Render ────────────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-3">
      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <KpiCard
          label="Pipeline DB"
          value={fmtDKK(kpis.pipelineDB)}
          sublabel={`${(kpis.byStatus["tilbud_sendt"] || 0) + (kpis.byStatus["godkendt"] || 0)} cases`}
          tone="blue"
        />
        <KpiCard
          label="Drift DB"
          value={fmtDKK(kpis.driftDB)}
          sublabel={`${(kpis.byStatus["opsat"] || 0) + (kpis.byStatus["i_drift"] || 0) + (kpis.byStatus["nedtaget"] || 0)} cases`}
          tone="emerald"
        />
        <KpiCard
          label="Realiseret DB"
          value={fmtDKK(kpis.realiseretDB)}
          sublabel={`${kpis.byStatus["afsluttet"] || 0} afsluttede`}
        />
        <KpiCard
          label="Gns. DB%"
          value={fmtPct(kpis.avgDBPct)}
          sublabel={`${kpis.activeCases} aktive`}
          tone={kpis.avgDBPct >= 30 ? "emerald" : kpis.avgDBPct >= 15 ? "amber" : "rose"}
        />
        <KpiCard
          label="Total omsætning"
          value={fmtDKK(kpis.totalOmsætning)}
          sublabel={`${kpis.totalCases} cases total`}
        />
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex items-center justify-between">
        <TabBar tabs={SUB_TABS} active={subTab} onChange={setSubTab} size="small" />
        {subTab === "cases" && (
          <div className="flex items-center gap-2">
            <select
              className="h-7 rounded-md border border-slate-300 bg-white px-2 text-[11px]"
              value={filter}
              onChange={(e) => setFilter(e.target.value as CaseStatus | "all")}
            >
              <option value="all">Alle status</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CASE_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <input
              type="text"
              className="h-7 w-44 rounded-md border border-slate-300 bg-white px-2 text-[11px]"
              placeholder="Søg case..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="h-7 rounded-md border border-emerald-300 bg-emerald-50 px-2 text-[11px] font-semibold text-emerald-800"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  createFromTilbud(e.target.value);
                  e.target.value = "";
                }
              }}
            >
              <option value="" disabled>
                + Fra tilbud...
              </option>
              {tilbud.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.offerNumber} — {t.clientName || "Uden kunde"}
                </option>
              ))}
            </select>
            <button
              onClick={openCustomerInvoicePicker}
              disabled={customerScanLoading}
              className="flex items-center gap-1.5 h-7 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 px-3 text-[11px] font-semibold text-white hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 shadow-sm"
              title="Upload en kunde-faktura (PDF) — AI opretter hele case'en automatisk"
            >
              {customerScanLoading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Læser faktura...
                </>
              ) : (
                <>
                  <Ic
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    className="w-3.5 h-3.5"
                  />
                  Scan kunde-faktura
                </>
              )}
            </button>
            <input
              ref={customerInvoiceRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCustomerInvoice(f);
                e.target.value = "";
              }}
            />
            <button
              onClick={createBlank}
              className="h-7 rounded-md border border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
            >
              + Ny tom case
            </button>
          </div>
        )}
      </div>

      {/* ═══ CASES SUB-TAB ═══ */}
      {subTab === "cases" && (
        <div className="grid grid-cols-12 gap-3">
          {/* List — grouped by address */}
          <div className="col-span-12 lg:col-span-5 rounded-lg border border-slate-200 bg-white">
            <div className="px-3 py-2 border-b border-slate-100 text-[11px] font-semibold text-slate-600 flex items-center justify-between">
              <span>
                {groupedByAddress.length} {groupedByAddress.length === 1 ? "adresse" : "adresser"}
                <span className="text-slate-400 font-normal"> · {filteredCases.length} cases</span>
              </span>
              {loading && <span className="text-slate-400">indlæser...</span>}
            </div>
            <div className="max-h-[640px] overflow-y-auto p-2 space-y-2">
              {filteredCases.length === 0 && !loading && (
                <div className="px-3 py-8 text-center text-[11px] text-slate-400">
                  Ingen cases. Scan en kunde-faktura eller opret en case.
                </div>
              )}
              {groupedByAddress.map(([address, addrCases]) => {
                const isExpanded = expandedAddresses.has(address);
                const addrDB = addrCases.reduce(
                  (sum, c) => sum + calcCaseEconomics(c).dækningsbidrag,
                  0
                );
                const bygherre = addrCases.find((c) => c.bygherreNavn)?.bygherreNavn || "";
                const hasActiveChild = addrCases.some((c) => c.id === selectedId);
                return (
                  <div
                    key={address}
                    className={`rounded-lg border overflow-hidden ${
                      hasActiveChild ? "border-violet-300" : "border-slate-200"
                    }`}
                  >
                    {/* Address box header */}
                    <button
                      onClick={() => toggleAddress(address)}
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-2 transition-colors ${
                        hasActiveChild ? "bg-violet-50" : "bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <Ic
                        d={isExpanded ? "M19.5 8.25l-7.5 7.5-7.5-7.5" : "M8.25 4.5l7.5 7.5-7.5 7.5"}
                        className="w-3.5 h-3.5 text-slate-400 shrink-0"
                      />
                      <div className="flex items-center justify-center w-7 h-7 rounded-md bg-white border border-slate-200 shrink-0">
                        <Ic
                          d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75"
                          className="w-3.5 h-3.5 text-slate-500"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-bold text-slate-900 truncate">
                          {address}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {bygherre && `${bygherre} · `}
                          {addrCases.length} {addrCases.length === 1 ? "case" : "cases"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`text-[12px] font-bold tabular-nums ${
                            addrDB >= 0 ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {fmtDKK(addrDB)}
                        </div>
                        <div className="text-[9px] text-slate-400">samlet DB</div>
                      </div>
                    </button>

                    {/* Cases under this address */}
                    {isExpanded && (
                      <div className="divide-y divide-slate-100 border-t border-slate-100">
                        {addrCases.map((c) => {
                          const e = calcCaseEconomics(c);
                          const isActive = c.id === selectedId;
                          return (
                            <button
                              key={c.id}
                              onClick={() => openCase(c)}
                              className={`w-full text-left pl-9 pr-3 py-2 transition-colors ${
                                isActive ? "bg-violet-50" : "hover:bg-slate-50"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[11px] font-semibold text-slate-900 truncate">
                                    {c.title || c.caseNumber}
                                  </div>
                                  <div className="text-[9px] text-slate-400 truncate">
                                    {c.caseNumber} · {c.varighedMaaneder} mdr
                                  </div>
                                </div>
                                <span
                                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border shrink-0 ${CASE_STATUS_COLOR[c.status]}`}
                                >
                                  {CASE_STATUS_LABEL[c.status]}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[10px] tabular-nums text-right">
                                <span
                                  className={`font-bold ${
                                    e.dækningsbidrag >= 0 ? "text-emerald-700" : "text-rose-700"
                                  }`}
                                >
                                  {fmtDKK(e.dækningsbidrag)} ({fmtPct(e.dækningsbidragPct)})
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detail */}
          <div className="col-span-12 lg:col-span-7 rounded-lg border border-slate-200 bg-white p-4 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1">
                <input
                  className="w-full text-base font-bold text-slate-900 border-0 border-b border-transparent hover:border-slate-200 focus:border-violet-300 focus:outline-none px-0 bg-transparent"
                  value={form.title}
                  onChange={(e) => updateField("title", e.target.value)}
                  placeholder="Titel"
                />
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <span className="font-mono">{form.caseNumber}</span>
                  <span>•</span>
                  <select
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CASE_STATUS_COLOR[form.status]}`}
                    value={form.status}
                    onChange={(e) => updateField("status", e.target.value as CaseStatus)}
                  >
                    {CASE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {CASE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedId && (
                  <button
                    onClick={deleteSelected}
                    className="h-7 px-2 rounded-md text-[10px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200"
                  >
                    Slet
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving}
                  className="h-7 px-3 rounded-md bg-violet-600 text-[11px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {saving ? "Gemmer..." : selectedId ? "Gem ændringer" : "Opret case"}
                </button>
              </div>
            </div>

            {/* Core fields */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
              <SectionHeader
                icon="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
                title="Case-info"
                hint="Bygherre, beliggenhed og periode"
              />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className={LABEL}>Bygherre</div>
                <input
                  className={CI}
                  value={form.bygherreNavn}
                  onChange={(e) => updateField("bygherreNavn", e.target.value)}
                />
              </div>
              <div>
                <div className={LABEL}>Adresse</div>
                <input
                  className={CI}
                  value={form.address}
                  onChange={(e) => updateField("address", e.target.value)}
                />
              </div>
              <div>
                <div className={LABEL}>
                  Kommune
                  {form.kommune && settings && (
                    <span className="ml-1 font-normal text-slate-400 normal-case">
                      ({lookupKommuneRate(settings.kommunaleRates || [], form.kommune)} kr/m²/døgn)
                    </span>
                  )}
                </div>
                <input
                  className={CI}
                  list="kommune-options"
                  value={form.kommune || ""}
                  onChange={(e) => updateField("kommune", e.target.value)}
                  placeholder="F.eks. København"
                />
                <datalist id="kommune-options">
                  {(settings?.kommunaleRates || []).map((r) => (
                    <option key={r.kommune} value={r.kommune}>
                      {r.perSqmPerDag} kr/m²/døgn
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <div className={LABEL}>Areal (m²)</div>
                <input
                  type="number"
                  className={CIR}
                  value={form.areaSqm || ""}
                  onChange={(e) => updateField("areaSqm", Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <div className={LABEL}>Varighed (mdr)</div>
                <input
                  type="number"
                  min={1}
                  max={12}
                  className={CIR}
                  value={form.varighedMaaneder || ""}
                  onChange={(e) =>
                    updateField("varighedMaaneder", Math.max(1, Math.min(12, Number(e.target.value) || 1)))
                  }
                />
              </div>
              <div>
                <div className={LABEL}>Start dato</div>
                <input
                  type="date"
                  className={CI}
                  value={form.startDate || ""}
                  onChange={(e) => updateField("startDate", e.target.value)}
                />
              </div>
              <div>
                <div className={LABEL}>Slut dato</div>
                <input
                  type="date"
                  className={CI}
                  value={form.endDate || ""}
                  onChange={(e) => updateField("endDate", e.target.value)}
                />
              </div>
              <div>
                <div className={LABEL}>Hyde-andel (%)</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={CIR}
                  value={form.hydeSharePct}
                  onChange={(e) => setHydeShare(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <div className={LABEL}>Bygherre-andel (%)</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className={CIR + " bg-slate-50"}
                  value={form.bygherreSharePct}
                  readOnly
                />
              </div>
            </div>
            </div>

            {/* ─── Medievisning & salg ─── */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
              <SectionHeader
                icon="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m0 0h7.5"
                title="Medievisning & salg"
                hint={`Splittes ${form.hydeSharePct}% Hyde / ${form.bygherreSharePct}% bygherre — produktion/montering deles IKKE`}
              />

            {/* Medie-split visualization (på net medievisning) */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-600">
                <span>
                  Medievisning (efter rabat): <strong>{fmtDKK(econ.netMedieRevenue)}</strong>
                </span>
                <span>
                  Hyde {fmtDKK(econ.hydeMediaShare)} • Bygherre {fmtDKK(econ.bygherreMediaShare)}
                </span>
              </div>
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden flex">
                <div
                  className="bg-violet-500"
                  style={{ width: `${form.hydeSharePct}%` }}
                  title={`Hyde ${form.hydeSharePct}%`}
                />
                <div
                  className="bg-slate-300"
                  style={{ width: `${form.bygherreSharePct}%` }}
                  title={`Bygherre ${form.bygherreSharePct}%`}
                />
              </div>
            </div>

            {/* Sales / Bookings */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Annoncør-bookinger
                </div>
                <button
                  onClick={addSale}
                  className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800"
                >
                  <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3 h-3" />
                  Tilføj salg
                </button>
              </div>
              <div className="rounded-md border border-slate-200 overflow-hidden bg-white">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[10px] text-slate-500">
                      <th className="px-2 py-1.5 font-semibold">Annoncør</th>
                      <th className="px-2 py-1.5 font-semibold">Fra</th>
                      <th className="px-2 py-1.5 font-semibold">Til</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Listepris</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Rabat %</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Net medie</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.sales || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-2 py-3 text-center text-[10px] text-slate-400">
                          Ingen salg endnu — tryk "+ Tilføj salg" for at registrere en booking.
                        </td>
                      </tr>
                    )}
                    {(form.sales || []).map((sale) => {
                      const netMedie = netMedieForSale(sale);
                      return (
                        <tr key={sale.id} className="border-t border-slate-100">
                          <td className="px-2 py-1">
                            <input
                              className={CI}
                              placeholder="Annoncør..."
                              value={sale.annoncør}
                              onChange={(e) => updateSale(sale.id, { annoncør: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="date"
                              className={CI}
                              value={sale.fromDate || ""}
                              onChange={(e) => updateSale(sale.id, { fromDate: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="date"
                              className={CI}
                              value={sale.toDate || ""}
                              onChange={(e) => updateSale(sale.id, { toDate: e.target.value })}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              className={CIR}
                              placeholder="0"
                              value={sale.listpris || sale.salgspris || ""}
                              onChange={(e) =>
                                updateSale(sale.id, {
                                  listpris: Number(e.target.value) || 0,
                                  salgspris: 0,
                                })
                              }
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              className={CIR}
                              placeholder="0"
                              value={sale.rabatPct || ""}
                              onChange={(e) =>
                                updateSale(sale.id, { rabatPct: Number(e.target.value) || 0 })
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900">
                            {fmtDKK(netMedie)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() => removeSale(sale.id)}
                              className="text-rose-500 hover:text-rose-700"
                              title="Slet salg"
                            >
                              <Ic
                                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                className="w-3.5 h-3.5"
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {(form.sales || []).length > 0 && (
                      <tr className="border-t-2 border-slate-200 bg-slate-50">
                        <td className="px-2 py-1.5 font-semibold text-slate-700" colSpan={5}>
                          Net medie i alt ({(form.sales || []).length} salg)
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-bold text-slate-900">
                          {fmtDKK(econ.netMedieRevenue)}
                        </td>
                        <td></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </div>

            {/* ─── Omkostninger ─── */}
            <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
              <SectionHeader
                icon="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
                title="Omkostninger"
                hint="Salgspris til bygherre vs. Hyde's kostpris — marginen er 100% Hyde's"
                action={
                  <div className="flex items-center gap-3">
                  <button
                    onClick={openScanPicker}
                    disabled={scanLoading}
                    className="flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:underline disabled:opacity-50"
                    title="Upload en leverandør-faktura (banner-print, montering, kommune) — IKKE jeres egne udgående fakturaer. AI udtrækker kostpriser."
                  >
                    {scanLoading ? (
                      <>
                        <span className="inline-block w-2.5 h-2.5 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                        Scanner...
                      </>
                    ) : (
                      <>
                        <Ic
                          d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25"
                          className="w-3 h-3"
                        />
                        Scan leverandør-faktura
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleInvoiceFile(f);
                      e.target.value = "";
                    }}
                  />
                  {settings && (
                    <button
                      onClick={applyCostDefaults}
                      className="text-[10px] font-semibold text-violet-600 hover:underline"
                    >
                      Brug standard priser
                    </button>
                  )}
                  </div>
                }
              />
              <div className="rounded-md border border-slate-200 overflow-hidden bg-white">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-[10px] text-slate-500">
                      <th className="px-2 py-1.5 font-semibold">Post</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Salgspris (bygherre)</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Kostpris (Hyde)</th>
                      <th className="px-2 py-1.5 font-semibold text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        Produktion
                        <span className="text-[9px] text-slate-400 ml-1">
                          {`salg ${PRODUKTION_SALG_PER_SQM} / kost ${settings?.produktionKostPerSqm ?? 45} kr/m²`}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className={CIR}
                          value={form.costs.produktionSalg || ""}
                          onChange={(e) =>
                            updateCosts({ produktionSalg: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className={CIR}
                          value={form.costs.produktionKost || ""}
                          onChange={(e) =>
                            updateCosts({ produktionKost: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                          econ.produktionMargin >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {fmtDKK(econ.produktionMargin)}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        Montering
                        <span className="text-[9px] text-slate-400 ml-1">
                          {`salg ${MONTERING_SALG_PER_SQM} / kost ${settings?.monteringKostPerSqm ?? 100} kr/m²`}
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className={CIR}
                          value={form.costs.monteringSalg || ""}
                          onChange={(e) =>
                            updateCosts({ monteringSalg: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className={CIR}
                          value={form.costs.monteringKost || ""}
                          onChange={(e) =>
                            updateCosts({ monteringKost: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                          econ.monteringMargin >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {fmtDKK(econ.monteringMargin)}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        Kommune
                        {form.kommune && settings && (
                          <span className="text-[9px] text-slate-400 ml-1">
                            ({lookupKommuneRate(settings.kommunaleRates || [], form.kommune)} kr/m²/døgn × {form.areaSqm} m² × {days} dage)
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className={CIR}
                          value={form.costs.kommunaleSalg || ""}
                          onChange={(e) =>
                            updateCosts({ kommunaleSalg: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className={CIR}
                          value={form.costs.kommunaleKost || ""}
                          onChange={(e) =>
                            updateCosts({ kommunaleKost: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                          econ.kommunaleMargin >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {fmtDKK(econ.kommunaleMargin)}
                      </td>
                    </tr>
                    <tr className="border-t border-slate-100">
                      <td className="px-2 py-1.5">
                        Intern overhead
                        <span className="text-[9px] text-slate-400 ml-1">
                          (kørsel, løn, etc. for hele perioden)
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right text-slate-400">—</td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          className={CIR}
                          value={form.costs.internalOverhead || ""}
                          onChange={(e) =>
                            updateCosts({ internalOverhead: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-rose-700">
                        {fmtDKK(-econ.internalOverhead)}
                      </td>
                    </tr>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td className="px-2 py-1.5 font-semibold text-slate-700">Totaler</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold text-slate-900">
                        {fmtDKK(econ.produktionSalg + econ.monteringSalg + econ.kommunaleSalg)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold text-rose-700">
                        {fmtDKK(econ.totalKost)}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-bold ${
                          (econ.produktionMargin + econ.monteringMargin + econ.kommunaleMargin - econ.internalOverhead) >= 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {fmtDKK(
                          econ.produktionMargin + econ.monteringMargin + econ.kommunaleMargin - econ.internalOverhead
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ─── Resultat ─── */}
            <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white p-4">
              <SectionHeader
                icon="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
                title="Resultat"
                hint="Hyde's dækningsbidrag på denne case"
              />

              {/* Hero: DB */}
              <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Hyde's dækningsbidrag
                  </div>
                  <div
                    className={`text-3xl font-extrabold tabular-nums leading-tight ${
                      econ.dækningsbidrag >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {fmtDKK(econ.dækningsbidrag)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {fmtDKK(econ.dækningsbidragPerMonth)}/md · DB {fmtPct(econ.dækningsbidragPct)} · ROI{" "}
                    {fmtPct(econ.roi)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Faktura-total til bygherre
                  </div>
                  <div className="text-xl font-bold text-slate-900 tabular-nums">
                    {fmtDKK(econ.fakturaTotal)}
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <KpiCard
                  label={`Medie-gebyr (${form.hydeSharePct}%)`}
                  value={fmtDKK(econ.hydeMediaShare)}
                  sublabel={`af ${fmtDKK(econ.netMedieRevenue)} net medie`}
                  tone="blue"
                />
                <KpiCard
                  label="Service-margin"
                  value={fmtDKK(econ.produktionMargin + econ.monteringMargin + econ.kommunaleMargin)}
                  sublabel="Produktion + montering + kommune"
                  tone="blue"
                />
                <KpiCard
                  label="Bygherre's andel"
                  value={fmtDKK(econ.bygherreMediaShare)}
                  sublabel={`${form.bygherreSharePct}% af net medie`}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <div className={LABEL}>Noter</div>
              <textarea
                className="w-full min-h-[60px] rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px]"
                value={form.notes || ""}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Interne noter..."
              />
            </div>
          </div>
        </div>
      )}

      {/* ═══ LIKVIDITET SUB-TAB ═══ */}
      {subTab === "forecast" && (
        <div className="space-y-3">
          {/* Top: kassebeholdning + runway KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="rounded-lg border border-violet-300 bg-violet-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                Kassebeholdning nu
              </div>
              <input
                type="number"
                className="mt-0.5 w-full bg-transparent text-lg font-bold text-slate-900 tabular-nums border-0 border-b border-violet-200 focus:border-violet-400 focus:outline-none px-0"
                defaultValue={settings?.cashBalance ?? 0}
                key={`cash-${settings?.cashBalanceUpdatedAt ?? ""}`}
                onBlur={(e) => {
                  const v = Number(e.target.value) || 0;
                  if (settings && v !== settings.cashBalance) {
                    saveSettings({ cashBalance: v, cashBalanceUpdatedAt: new Date().toISOString() });
                  }
                }}
              />
              <div className="text-[9px] text-slate-400 mt-0.5">
                {settings?.cashBalanceUpdatedAt
                  ? `Opdateret ${settings.cashBalanceUpdatedAt.slice(0, 10)}`
                  : "Indtast jeres banksaldo"}
              </div>
            </div>
            <KpiCard
              label="Runway"
              value={
                liquidity.runwayMonths != null
                  ? `${liquidity.runwayMonths} mdr`
                  : "12+ mdr"
              }
              sublabel={
                liquidity.runwayEndLabel
                  ? `Kassen i nul: ${liquidity.runwayEndLabel}`
                  : "Positiv hele horisonten"
              }
              tone={
                liquidity.runwayMonths == null
                  ? "emerald"
                  : liquidity.runwayMonths >= 6
                  ? "amber"
                  : "rose"
              }
            />
            <KpiCard
              label="Gns. cashflow / md"
              value={fmtDKK(liquidity.avgMonthlyNet)}
              sublabel={liquidity.avgMonthlyNet >= 0 ? "Kassen vokser" : "Kassen falder"}
              tone={liquidity.avgMonthlyNet >= 0 ? "emerald" : "rose"}
            />
            <KpiCard
              label="Laveste kasse (12 mdr)"
              value={fmtDKK(liquidity.lowestCash)}
              sublabel={`Moms est. ${fmtDKK(liquidity.totalMomsHorizon)}`}
              tone={liquidity.lowestCash >= 0 ? "default" : "rose"}
            />
          </div>

          {/* Cashflow-tabel */}
          <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white p-4">
            <SectionHeader
              icon="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
              title="12 måneders cashflow"
              hint="DB fra cases − faste driftsudgifter − moms-afregning"
            />
            <div className="rounded-md border border-slate-200 overflow-hidden bg-white">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50">
                  <tr className="text-left text-[10px] text-slate-500">
                    <th className="px-2 py-1.5 font-semibold">Måned</th>
                    <th className="px-2 py-1.5 font-semibold text-right">DB ind</th>
                    <th className="px-2 py-1.5 font-semibold text-right">Drift</th>
                    <th className="px-2 py-1.5 font-semibold text-right">Moms</th>
                    <th className="px-2 py-1.5 font-semibold text-right">Netto</th>
                    <th className="px-2 py-1.5 font-semibold text-right">Kasse ultimo</th>
                  </tr>
                </thead>
                <tbody>
                  {liquidity.months.map((m) => (
                    <tr
                      key={m.month}
                      className={`border-t border-slate-100 ${m.negative ? "bg-rose-50" : ""}`}
                    >
                      <td className="px-2 py-1.5 font-medium text-slate-700">{m.monthLabel}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">
                        {m.dbIn !== 0 ? fmtDKK(m.dbIn) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                        {m.opexOut !== 0 ? `−${fmtDKK(m.opexOut)}` : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                        {m.momsOut !== 0 ? `−${fmtDKK(m.momsOut)}` : "—"}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-semibold ${
                          m.net >= 0 ? "text-emerald-700" : "text-rose-700"
                        }`}
                      >
                        {fmtDKK(m.net)}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right tabular-nums font-bold ${
                          m.negative ? "text-rose-700" : "text-slate-900"
                        }`}
                      >
                        {fmtDKK(m.cashEnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-slate-400 mt-2">
              Moms estimeres som {settings?.momsPct ?? 25}% af DB og afregnes ved kalenderkvartal
              (marts/juni/sep/dec). Cases med status "tabt" indgår ikke.
            </div>
          </div>

          {/* Forecast bars — DB pr. måned */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-semibold text-slate-700 mb-2">
              Forventet dækningsbidrag pr. måned{" "}
              {monthlyOpEx > 0 ? "(efter faste driftsudgifter)" : "(brutto)"}
              <span className="text-slate-400 font-normal"> · 12 mdr i alt {fmtDKK(forecastTotal)}</span>
            </div>
            <div className="space-y-1.5">
              {forecast.map((m) => {
                const widthPct = (Math.abs(m.expectedDB) / forecastMax) * 100;
                const isNeg = m.expectedDB < 0;
                return (
                  <div
                    key={m.month}
                    className="grid grid-cols-[80px_1fr_120px] items-center gap-2 text-[11px]"
                  >
                    <div className="text-slate-600 font-medium">{m.monthLabel}</div>
                    <div className="h-5 bg-slate-50 rounded overflow-hidden relative">
                      <div
                        className={`h-full ${isNeg ? "bg-rose-300" : "bg-emerald-400"}`}
                        style={{ width: `${widthPct}%` }}
                      />
                      <div className="absolute inset-0 flex items-center px-2 text-[10px] text-slate-700">
                        {m.caseCount} {m.caseCount === 1 ? "case" : "cases"}
                      </div>
                    </div>
                    <div
                      className={`text-right tabular-nums font-semibold ${
                        isNeg ? "text-rose-700" : "text-emerald-700"
                      }`}
                    >
                      {fmtDKK(m.expectedDB)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SETTINGS SUB-TAB ═══ */}
      {subTab === "settings" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Cost defaults */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div>
              <div className="text-[12px] font-bold text-slate-900">Standard kostpriser</div>
              <div className="text-[10px] text-slate-500">
                Bruges når en case oprettes fra et tilbud, eller når du klikker "Brug standard kostpriser".
              </div>
            </div>
            {settings ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className={LABEL}>Produktion kostpris (DKK/m²)</div>
                  <input
                    type="number"
                    className={CIR}
                    defaultValue={settings.produktionKostPerSqm}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== settings.produktionKostPerSqm) saveSettings({ produktionKostPerSqm: v });
                    }}
                  />
                </div>
                <div>
                  <div className={LABEL}>Montering kostpris (DKK/m²)</div>
                  <input
                    type="number"
                    className={CIR}
                    defaultValue={settings.monteringKostPerSqm}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== settings.monteringKostPerSqm) saveSettings({ monteringKostPerSqm: v });
                    }}
                  />
                </div>
                <div>
                  <div className={LABEL}>Standard Hyde-andel (%)</div>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className={CIR}
                    defaultValue={settings.defaultHydeSharePct}
                    onBlur={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      if (v !== settings.defaultHydeSharePct) saveSettings({ defaultHydeSharePct: v });
                    }}
                  />
                </div>
                <div>
                  <div className={LABEL}>Standard overhead/md (DKK)</div>
                  <input
                    type="number"
                    className={CIR}
                    defaultValue={settings.defaultOverheadPerMonth}
                    onBlur={(e) => {
                      const v = Number(e.target.value) || 0;
                      if (v !== settings.defaultOverheadPerMonth)
                        saveSettings({ defaultOverheadPerMonth: v });
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-400">Indlæser...</div>
            )}
            <div className="text-[10px] text-slate-400">
              Hint: I tilbud bruges <strong>150 DKK/m²</strong> for produktion og <strong>125 DKK/m²</strong> for montering som salgspris.
              Kostprisen er typisk lavere.
            </div>

            {/* Kommunale gebyrer per kommune */}
            {settings && (
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <div>
                  <div className="text-[11px] font-bold text-slate-900">Kommunale gebyrer pr. m² / døgn</div>
                  <div className="text-[10px] text-slate-500">
                    Fx Frederiksberg: 4,5 kr/m²/døgn. Beregnes som rate × m² × antal døgn på case'en.
                  </div>
                </div>

                <div className="space-y-1">
                  {(settings.kommunaleRates || []).length === 0 && (
                    <div className="text-[10px] text-slate-400 italic">Ingen kommuner endnu.</div>
                  )}
                  {(settings.kommunaleRates || []).map((rate, idx) => (
                    <div
                      key={`${rate.kommune}-${idx}`}
                      className="grid grid-cols-[1fr_120px_24px] items-center gap-2 px-2 py-1 rounded border border-slate-100 hover:bg-slate-50"
                    >
                      <input
                        className="text-[11px] font-medium text-slate-900 bg-transparent border-0 focus:outline-none"
                        defaultValue={rate.kommune}
                        onBlur={(ev) => {
                          const v = ev.target.value.trim();
                          if (!v || v === rate.kommune) return;
                          const next = [...(settings.kommunaleRates || [])];
                          next[idx] = { ...rate, kommune: v };
                          saveSettings({ kommunaleRates: next });
                        }}
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step={0.01}
                          className="h-6 w-full rounded border border-slate-200 bg-white px-1 text-[11px] text-right tabular-nums"
                          defaultValue={rate.perSqmPerDag}
                          onBlur={(ev) => {
                            const v = Number(ev.target.value) || 0;
                            if (v === rate.perSqmPerDag) return;
                            const next = [...(settings.kommunaleRates || [])];
                            next[idx] = { ...rate, perSqmPerDag: v };
                            saveSettings({ kommunaleRates: next });
                          }}
                        />
                        <span className="text-[9px] text-slate-400">kr/m²/døgn</span>
                      </div>
                      <button
                        onClick={() => {
                          if (!confirm(`Slet kommune-rate for ${rate.kommune}?`)) return;
                          const next = (settings.kommunaleRates || []).filter((_, i) => i !== idx);
                          saveSettings({ kommunaleRates: next });
                        }}
                        className="text-rose-500 hover:text-rose-700"
                        title="Slet"
                      >
                        <Ic
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                          className="w-3 h-3"
                        />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="h-7 flex-1 rounded-md border border-slate-300 bg-white px-2 text-[11px]"
                    placeholder="Tilføj kommune..."
                    value={newKommuneName}
                    onChange={(e) => setNewKommuneName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const v = newKommuneName.trim();
                      if (!v) return;
                      const exists = (settings.kommunaleRates || []).some(
                        (r) => r.kommune.toLowerCase() === v.toLowerCase()
                      );
                      if (exists) {
                        onToast("Kommunen findes allerede", "error");
                        return;
                      }
                      const next = [...(settings.kommunaleRates || []), { kommune: v, perSqmPerDag: 0 }];
                      saveSettings({ kommunaleRates: next });
                      setNewKommuneName("");
                    }}
                  />
                  <button
                    onClick={() => {
                      const v = newKommuneName.trim();
                      if (!v) {
                        onToast("Indtast kommune-navn", "error");
                        return;
                      }
                      const exists = (settings.kommunaleRates || []).some(
                        (r) => r.kommune.toLowerCase() === v.toLowerCase()
                      );
                      if (exists) {
                        onToast("Kommunen findes allerede", "error");
                        return;
                      }
                      const next = [...(settings.kommunaleRates || []), { kommune: v, perSqmPerDag: 0 }];
                      saveSettings({ kommunaleRates: next });
                      setNewKommuneName("");
                    }}
                    className="h-7 px-3 rounded-md bg-violet-600 text-[11px] font-semibold text-white hover:bg-violet-700"
                  >
                    + Tilføj
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Operating expenses */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div>
              <div className="text-[12px] font-bold text-slate-900">Faste driftsudgifter</div>
              <div className="text-[10px] text-slate-500">
                Trækkes fra forventet dækningsbidrag i forecast-visningen.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                className="h-7 flex-1 rounded-md border border-slate-300 bg-white px-2 text-[11px]"
                placeholder="F.eks. Kontorhusleje"
                value={newExpenseLabel}
                onChange={(e) => setNewExpenseLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addExpense();
                }}
              />
              <button
                onClick={addExpense}
                className="h-7 px-3 rounded-md bg-violet-600 text-[11px] font-semibold text-white hover:bg-violet-700"
              >
                + Tilføj
              </button>
            </div>

            <div className="space-y-1">
              {expenses.length === 0 && (
                <div className="text-center text-[11px] text-slate-400 py-4">
                  Ingen faste driftsudgifter endnu.
                </div>
              )}
              {expenses.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[1fr_110px_110px_24px] items-center gap-2 px-2 py-1.5 rounded border border-slate-100 hover:bg-slate-50"
                >
                  <input
                    className="text-[11px] font-medium text-slate-900 bg-transparent border-0 focus:outline-none"
                    defaultValue={e.label}
                    onBlur={(ev) => {
                      const v = ev.target.value.trim();
                      if (v && v !== e.label) updateExpense(e.id, { label: v });
                    }}
                  />
                  <select
                    className="h-6 rounded border border-slate-200 bg-white px-1 text-[10px]"
                    defaultValue={e.category}
                    onChange={(ev) =>
                      updateExpense(e.id, { category: ev.target.value as OperatingExpenseCategory })
                    }
                  >
                    {(Object.keys(OPERATING_EXPENSE_LABEL) as OperatingExpenseCategory[]).map((c) => (
                      <option key={c} value={c}>
                        {OPERATING_EXPENSE_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      className="h-6 w-full rounded border border-slate-200 bg-white px-1 text-[11px] text-right tabular-nums"
                      defaultValue={e.amountPerMonth}
                      onBlur={(ev) => {
                        const v = Number(ev.target.value) || 0;
                        if (v !== e.amountPerMonth) updateExpense(e.id, { amountPerMonth: v });
                      }}
                    />
                    <span className="text-[9px] text-slate-400">/md</span>
                  </div>
                  <button
                    onClick={() => deleteExpense(e.id)}
                    className="text-rose-500 hover:text-rose-700"
                    title="Slet"
                  >
                    <Ic d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {expenses.length > 0 && (
              <div className="border-t border-slate-100 pt-2 flex items-center justify-between text-[11px] font-semibold">
                <span className="text-slate-600">Total pr. måned</span>
                <span className="tabular-nums text-slate-900">{fmtDKK(monthlyOpEx)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ INVOICE SCAN MODAL ═══ */}
      {scanResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={closeScanModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(ev) => ev.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-3 border-b border-slate-200 flex items-start justify-between">
              <div>
                <div className="text-base font-bold text-slate-900">Leverandør-faktura scannet</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {scanResult.vendor || "Ukendt leverandør"}
                  {scanResult.invoiceNumber && ` • Fakturanr. ${scanResult.invoiceNumber}`}
                  {scanResult.invoiceDate && ` • ${scanResult.invoiceDate}`}
                </div>
                <div className="text-[10px] text-amber-700 mt-1">
                  ⓘ Kun beløb categorized som produktion/montering/kommune/overhead lægges til case'ens <strong>kostpriser</strong>. Medie-linjer ignoreres (medievisning er ikke en omkostning).
                </div>
              </div>
              <button
                onClick={closeScanModal}
                className="text-slate-400 hover:text-slate-600"
              >
                <Ic d="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div className="rounded border border-slate-200 p-2">
                  <div className={LABEL}>Netto</div>
                  <div className="font-bold text-slate-900 tabular-nums">
                    {fmtDKK(scanResult.totalNet)}
                  </div>
                </div>
                <div className="rounded border border-slate-200 p-2">
                  <div className={LABEL}>Moms</div>
                  <div className="font-bold text-slate-900 tabular-nums">
                    {fmtDKK(scanResult.totalVat)}
                  </div>
                </div>
                <div className="rounded border border-slate-200 p-2">
                  <div className={LABEL}>Brutto</div>
                  <div className="font-bold text-slate-900 tabular-nums">
                    {fmtDKK(scanResult.totalGross)}
                  </div>
                </div>
              </div>

              {scanResult.notes && (
                <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  ⚠ {scanResult.notes}
                </div>
              )}

              <div>
                <div className="text-[11px] font-semibold text-slate-700 mb-1">
                  Linjer ({scanResult.lines.length})
                </div>
                <div className="rounded-md border border-slate-200 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-[10px] text-slate-500">
                        <th className="px-2 py-1.5 w-8"></th>
                        <th className="px-2 py-1.5 font-semibold">Beskrivelse</th>
                        <th className="px-2 py-1.5 font-semibold">Kategori</th>
                        <th className="px-2 py-1.5 font-semibold text-right">Beløb</th>
                        <th className="px-2 py-1.5 font-semibold text-right">Konf.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scanResult.lines.map((line, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1">
                            <input
                              type="checkbox"
                              checked={scanLineEnabled[i] ?? true}
                              onChange={(ev) =>
                                setScanLineEnabled((p) => ({ ...p, [i]: ev.target.checked }))
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="text-slate-800">{line.description}</div>
                            {line.quantity != null && line.unitPrice != null && (
                              <div className="text-[9px] text-slate-400">
                                {line.quantity} × {fmtDKK(line.unitPrice)}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            <select
                              className="h-6 w-full rounded border border-slate-200 bg-white px-1 text-[10px]"
                              value={scanLineTypes[i] || "andet"}
                              onChange={(ev) =>
                                setScanLineTypes((p) => ({
                                  ...p,
                                  [i]: ev.target.value as InvoiceLineType,
                                }))
                              }
                              disabled={!(scanLineEnabled[i] ?? true)}
                            >
                              <option value="medie">Medie (ignoreres)</option>
                              <option value="produktion">Produktion</option>
                              <option value="montering">Montering</option>
                              <option value="kommunale">Kommunale</option>
                              <option value="overhead">Overhead</option>
                              <option value="andet">Andet</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                            {fmtDKK(line.amount)}
                          </td>
                          <td
                            className={`px-2 py-1.5 text-right tabular-nums ${
                              line.confidence >= 0.8
                                ? "text-emerald-700"
                                : line.confidence >= 0.5
                                ? "text-amber-700"
                                : "text-rose-700"
                            }`}
                          >
                            {Math.round(line.confidence * 100)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Preview rollup */}
              <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-700 mb-1">
                  Bliver lagt til case'ens kostpriser
                </div>
                {(() => {
                  let produktion = 0;
                  let montering = 0;
                  let kommunale = 0;
                  let overhead = 0;
                  let medieIgnored = 0;
                  scanResult.lines.forEach((line, i) => {
                    if (!scanLineEnabled[i]) return;
                    const t = scanLineTypes[i] || "andet";
                    const amt = Math.max(0, line.amount || 0);
                    if (t === "medie") medieIgnored += amt;
                    else if (t === "produktion") produktion += amt;
                    else if (t === "montering") montering += amt;
                    else if (t === "kommunale") kommunale += amt;
                    else if (t === "overhead" || t === "andet") overhead += amt;
                  });
                  return (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-500">Produktion: </span>
                          <span className="font-semibold tabular-nums">{fmtDKK(produktion)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Montering: </span>
                          <span className="font-semibold tabular-nums">{fmtDKK(montering)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Kommunale: </span>
                          <span className="font-semibold tabular-nums">{fmtDKK(kommunale)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Overhead: </span>
                          <span className="font-semibold tabular-nums">{fmtDKK(overhead)}</span>
                        </div>
                      </div>
                      {medieIgnored > 0 && (
                        <div className="text-[10px] text-slate-400">
                          ⓘ Medie-linjer ({fmtDKK(medieIgnored)}) ignoreres — medievisning er ikke en omkostning. Opret et salg manuelt hvis det skal med.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between">
              <div className="text-[10px] text-slate-500">
                Tip: Beløb lægges <em>oveni</em> de eksisterende kostpriser på case'en.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeScanModal}
                  className="h-8 px-3 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Annullér
                </button>
                <button
                  onClick={applyScannedInvoice}
                  className="h-8 px-3 rounded-md bg-violet-600 text-[11px] font-semibold text-white hover:bg-violet-700"
                >
                  Anvend på case
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
