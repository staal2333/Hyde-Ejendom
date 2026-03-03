"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calcLineTotals,
  calcMediaDiscountPct,
  calcTilbudTotals,
} from "@/lib/tilbud/calculations";
import {
  createDefaultTilbud,
  createDefaultTilbudLine,
  type FixedCost,
  type Tilbud,
  type TilbudLine,
  normalizeFixedCosts,
} from "@/lib/tilbud/types";
import {
  HYDE_ADDRESS_LINE,
  HYDE_CITY_LINE,
  HYDE_COMPANY_NAME,
} from "@/lib/tilbud/branding";
import {
  type Placement,
  placementToLines,
  MONTERING_PER_SQM,
  PRODUKTION_PER_SQM,
} from "@/lib/tilbud/placement-types";

interface TilbudListResponse { items: Tilbud[]; total: number; }
interface PlacementListResponse { items: Placement[]; total: number; }

export interface TilbudTabProps {
  onToast: (message: string, type: "success" | "error" | "info") => void;
}

function fmt(value: number, currency = "DKK") {
  return `${value.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function linePeriod(line: TilbudLine) {
  if (line.fromWeek != null || line.toWeek != null) return `Uge ${line.fromWeek ?? "-"} – ${line.toWeek ?? "-"}`;
  return "-";
}

function isMediaLine(line: TilbudLine | null): boolean {
  return line?.name.trim().toLowerCase() === "medievisning";
}

// ─── Compact input class ───
const CI = "h-6 w-full rounded-sm border border-orange-300 bg-orange-50 px-1 text-[10px] text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-300";
const CIR = `${CI} text-right`;

export function TilbudTab({ onToast }: TilbudTabProps) {
  const [items, setItems] = useState<Tilbud[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Tilbud>(() => createDefaultTilbud(1));
  const [activeCalcLineId, setActiveCalcLineId] = useState<string | null>(null);

  const [placements, setPlacements] = useState<Placement[]>([]);
  const [placementsLoading, setPlacementsLoading] = useState(false);
  const [showPlacementModal, setShowPlacementModal] = useState(false);
  const [editingPlacement, setEditingPlacement] = useState<Placement | null>(null);
  const [pf, setPf] = useState({ name: "", areaSqm: 0, listPricePerSqmPerWeek: 0, kommunaleGebyr: 0, notes: "" });

  const [aftalPris, setAftalPris] = useState("");
  const [globalFromWeek, setGlobalFromWeek] = useState<number | undefined>(undefined);
  const [globalToWeek, setGlobalToWeek] = useState<number | undefined>(undefined);

  const setGlobalWeeks = (from: number | undefined, to: number | undefined) => {
    setGlobalFromWeek(from);
    setGlobalToWeek(to);
    setForm((p) => ({ ...p, lines: p.lines.map((l) => ({ ...l, fromWeek: from, toWeek: to })) }));
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/tilbud?limit=100"); const d = (await r.json()) as TilbudListResponse; setItems(d.items || []); }
    catch { onToast("Kunne ikke hente tilbud", "error"); }
    finally { setLoading(false); }
  }, [onToast]);

  const fetchPlacements = useCallback(async () => {
    setPlacementsLoading(true);
    try { const r = await fetch("/api/tilbud/placements"); const d = (await r.json()) as PlacementListResponse; setPlacements(d.items || []); }
    catch { onToast("Kunne ikke hente placeringer", "error"); }
    finally { setPlacementsLoading(false); }
  }, [onToast]);

  useEffect(() => { fetchItems(); fetchPlacements(); }, [fetchItems, fetchPlacements]);

  const openFromList = useCallback((t: Tilbud) => {
    setForm({ ...t, fixedCosts: normalizeFixedCosts(t.fixedCosts) });
    setSelectedId(t.id);
    setActiveCalcLineId(t.lines[0]?.id ?? null);
    setAftalPris("");
    setGlobalFromWeek(t.lines[0]?.fromWeek);
    setGlobalToWeek(t.lines[0]?.toWeek);
  }, []);

  const createNew = useCallback(() => {
    const n = createDefaultTilbud(Date.now());
    setForm(n); setSelectedId(null); setActiveCalcLineId(n.lines[0]?.id ?? null); setAftalPris("");
  }, []);

  const updateField = <K extends keyof Tilbud>(k: K, v: Tilbud[K]) => setForm((p) => ({ ...p, [k]: v }));
  const updateLine = (id: string, patch: Partial<TilbudLine>) => setForm((p) => ({ ...p, lines: p.lines.map((l) => l.id === id ? { ...l, ...patch } : l) }));
  const addLine = () => { const n = createDefaultTilbudLine(form.lines.length + 1); setForm((p) => ({ ...p, lines: [...p.lines, n] })); setActiveCalcLineId(n.id); };
  const removeLine = (id: string) => setForm((p) => { if (p.lines.length <= 1) return p; const n = p.lines.filter((x) => x.id !== id); if (activeCalcLineId === id) setActiveCalcLineId(n[0]?.id ?? null); return { ...p, lines: n }; });

  const updateLineCalculator = (id: string, patch: Partial<Pick<TilbudLine, "widthMeters" | "heightMeters" | "unitPricePerSqmPerWeek" | "weeks" | "quantity">>) => {
    setForm((p) => ({ ...p, lines: p.lines.map((l) => {
      if (l.id !== id) return l;
      const n = { ...l, ...patch };
      const a = Math.max(0, (n.widthMeters || 0) * (n.heightMeters || 0));
      return { ...n, listPrice: a > 0 ? Number(((n.unitPricePerSqmPerWeek || 0) * a).toFixed(2)) : n.listPrice };
    }) }));
  };

  const updateFixedCost = (id: string, patch: Partial<FixedCost>) => setForm((p) => ({ ...p, fixedCosts: (p.fixedCosts || []).map((c) => c.id === id ? { ...c, ...patch } : c) }));

  // ─── Placement CRUD ───
  const savePlacement = async () => {
    if (!pf.name.trim()) { onToast("Udfyld placeringsnavn", "error"); return; }
    if (pf.areaSqm <= 0) { onToast("Areal skal være > 0", "error"); return; }
    try {
      const payload = editingPlacement ? { ...pf, id: editingPlacement.id } : pf;
      const r = await fetch("/api/tilbud/placements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = (await r.json()) as { success?: boolean; error?: string };
      if (!r.ok || !d.success) { onToast(d.error || "Kunne ikke gemme placering", "error"); return; }
      onToast(editingPlacement ? "Placering opdateret" : "Placering oprettet", "success");
      setShowPlacementModal(false); setEditingPlacement(null); setPf({ name: "", areaSqm: 0, listPricePerSqmPerWeek: 0, kommunaleGebyr: 0, notes: "" });
      await fetchPlacements();
    } catch { onToast("Fejl ved gem af placering", "error"); }
  };

  const deletePlacementById = async (id: string) => {
    try { const r = await fetch(`/api/tilbud/placements/${id}`, { method: "DELETE" }); if (!r.ok) { onToast("Kunne ikke slette", "error"); return; } onToast("Placering slettet", "info"); await fetchPlacements(); }
    catch { onToast("Fejl ved sletning", "error"); }
  };

  const startEditPlacement = (p: Placement) => { setEditingPlacement(p); setPf({ name: p.name, areaSqm: p.areaSqm, listPricePerSqmPerWeek: p.listPricePerSqmPerWeek, kommunaleGebyr: p.kommunaleGebyr, notes: p.notes || "" }); setShowPlacementModal(true); };

  const applyPlacement = (id: string) => {
    const p = placements.find((x) => x.id === id);
    if (!p) return;
    const weeks = form.lines.find((l) => isMediaLine(l))?.weeks || 2;
    const newLines = placementToLines(p, weeks);
    setForm((prev) => ({ ...prev, lines: newLines, title: `Tilbud — ${p.name}` }));
    setActiveCalcLineId(newLines[0]?.id ?? null);
    setAftalPris("");
    onToast(`Placering "${p.name}" indsat`, "info");
  };

  const handleAftalPris = (value: string) => {
    setAftalPris(value);
    const target = Number(value);
    if (!value.trim() || isNaN(target) || target <= 0) { const m = form.lines.find((l) => isMediaLine(l)); if (m && m.discountPct > 0) updateLine(m.id, { discountPct: 0 }); return; }
    const pct = calcMediaDiscountPct(form.lines, target);
    const m = form.lines.find((l) => isMediaLine(l));
    if (m) updateLine(m.id, { discountPct: pct });
  };

  const save = async (status?: "draft" | "final"): Promise<string | null> => {
    setSaving(true);
    try {
      if (!form.clientName.trim()) { onToast("Udfyld kundenavn", "error"); return null; }
      if (!form.offerDate) { onToast("Udfyld dato", "error"); return null; }
      const r = await fetch("/api/tilbud", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, fixedCosts: normalizeFixedCosts(form.fixedCosts), status: status || form.status }) });
      const d = (await r.json()) as { success?: boolean; tilbud?: Tilbud; error?: string };
      if (!r.ok || !d.tilbud) { onToast(d.error || "Kunne ikke gemme", "error"); return null; }
      setForm({ ...d.tilbud, fixedCosts: normalizeFixedCosts(d.tilbud.fixedCosts) }); setSelectedId(d.tilbud.id); await fetchItems(); onToast("Tilbud gemt", "success"); return d.tilbud.id;
    } catch { onToast("Fejl ved gem", "error"); return null; } finally { setSaving(false); }
  };

  const downloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      let id = selectedId; if (!id) { id = await save(form.status); if (!id) return; }
      const r = await fetch("/api/tilbud/generate-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!r.ok) { const d = (await r.json().catch(() => ({}))) as { error?: string }; throw new Error(d.error || "Kunne ikke generere PDF"); }
      const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `${form.offerNumber || "Tilbud"}.pdf`; a.click(); URL.revokeObjectURL(u); onToast("PDF genereret", "success");
    } catch (e) { onToast(e instanceof Error ? e.message : "Fejl ved PDF", "error"); } finally { setDownloadingPdf(false); }
  };

  const totals = useMemo(() => calcTilbudTotals(form), [form]);
  useEffect(() => { if (!activeCalcLineId && form.lines.length > 0) setActiveCalcLineId(form.lines[0].id); }, [activeCalcLineId, form.lines]);
  const activeLine = useMemo(() => form.lines.find((l) => l.id === activeCalcLineId) ?? form.lines[0] ?? null, [form.lines, activeCalcLineId]);
  const activeLineTotals = useMemo(() => activeLine ? calcLineTotals(activeLine) : null, [activeLine]);
  const computedDiscountPct = useMemo(() => { const t = Number(aftalPris); if (!aftalPris.trim() || isNaN(t) || t <= 0) return null; return calcMediaDiscountPct(form.lines, t); }, [aftalPris, form.lines]);

  return (
    <div className="animate-fade-in space-y-3">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {/* Placement dropdown */}
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
            value=""
            onChange={(e) => { if (e.target.value) applyPlacement(e.target.value); }}
          >
            <option value="">Vælg placering...</option>
            {placements.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.areaSqm} m²</option>
            ))}
          </select>
          <button
            onClick={() => { setShowPlacementModal(true); setEditingPlacement(null); setPf({ name: "", areaSqm: 0, listPricePerSqmPerWeek: 0, kommunaleGebyr: 0, notes: "" }); }}
            className="btn-ghost text-[11px]"
          >
            Administrer placeringer
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={createNew} className="btn-secondary">Nyt tilbud</button>
          <button onClick={() => save("draft")} disabled={saving} className="btn-secondary">{saving ? "Gemmer..." : "Gem kladde"}</button>
          <button onClick={() => save("final")} disabled={saving} className="btn-primary">Marker som final</button>
          <button onClick={downloadPdf} disabled={downloadingPdf} className="btn-success">{downloadingPdf ? "Genererer..." : "Download PDF"}</button>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* ── LEFT: Tilbud form ── */}
        <section className="xl:col-span-9 surface-card p-4 sm:p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-900">TILBUD</h2>
              <p className="text-[11px] text-slate-500">{form.title || "Tilbud"}</p>
            </div>
            <div className="text-right text-[10px] shrink-0">
              <img src="/api/tilbud/logo" alt="Logo" className="w-12 h-12 object-contain ml-auto mb-0.5 rounded bg-black" />
              <p className="font-semibold text-slate-700">{HYDE_COMPANY_NAME}</p>
              <p className="text-slate-400">{HYDE_ADDRESS_LINE} &middot; {HYDE_CITY_LINE}</p>
            </div>
          </div>

          {/* Meta fields */}
          <div className="grid grid-cols-4 gap-x-3 gap-y-2 text-[11px] mb-4">
            <label className="text-slate-500">Tilbudsnr. <input className="input-field mt-0.5 !py-1 !text-xs" value={form.offerNumber} onChange={(e) => updateField("offerNumber", e.target.value)} /></label>
            <label className="text-slate-500">Dato <input type="date" className="input-field mt-0.5 !py-1 !text-xs" value={form.offerDate} onChange={(e) => updateField("offerDate", e.target.value)} /></label>
            <label className="text-slate-500">Uge fra <input type="number" min={1} max={53} className="input-field mt-0.5 !py-1 !text-xs text-right" placeholder="—" value={globalFromWeek ?? ""} onChange={(e) => setGlobalWeeks(e.target.value === "" ? undefined : Number(e.target.value), globalToWeek)} /></label>
            <label className="text-slate-500">Uge til <input type="number" min={1} max={53} className="input-field mt-0.5 !py-1 !text-xs text-right" placeholder="—" value={globalToWeek ?? ""} onChange={(e) => setGlobalWeeks(globalFromWeek, e.target.value === "" ? undefined : Number(e.target.value))} /></label>
            <label className="text-slate-500">Kunde <input className="input-field mt-0.5 !py-1 !text-xs" value={form.clientName} onChange={(e) => updateField("clientName", e.target.value)} /></label>
            <label className="text-slate-500">Kampagne <input className="input-field mt-0.5 !py-1 !text-xs" value={form.campaignName || ""} onChange={(e) => updateField("campaignName", e.target.value)} /></label>
            <label className="text-slate-500">Vores ref. <input className="input-field mt-0.5 !py-1 !text-xs" value={form.ourReference || ""} onChange={(e) => updateField("ourReference", e.target.value)} /></label>
            <label className="text-slate-500">Jeres ref. <input className="input-field mt-0.5 !py-1 !text-xs" value={form.yourReference || ""} onChange={(e) => updateField("yourReference", e.target.value)} /></label>
          </div>

          {/* ── Line table ── */}
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-[10px] table-fixed">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="text-left px-1.5 py-1 font-medium w-[38%]">Navn</th>
                  <th className="text-right px-1 py-1 font-medium w-[10%]">Antal</th>
                  <th className="text-right px-1 py-1 font-medium w-[20%]">Listepris</th>
                  <th className="text-right px-1 py-1 font-medium w-[20%]">Nettopris</th>
                  <th className="text-center px-1 py-1 font-medium w-[5%]"></th>
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line) => {
                  const lt = calcLineTotals(line);
                  const active = activeLine?.id === line.id;
                  return (
                    <tr key={line.id} className={`border-t border-slate-100 cursor-pointer transition-colors ${active ? "bg-orange-50" : "bg-white hover:bg-slate-50"}`} onClick={() => setActiveCalcLineId(line.id)}>
                      <td className="px-1 py-0.5"><input className={CI} placeholder="Fx Medievisning" value={line.name} onChange={(e) => updateLine(line.id, { name: e.target.value })} /></td>
                      <td className="px-0.5 py-0.5"><input type="number" min={1} className={CIR} value={line.quantity} onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value || 1) })} /></td>
                      <td className="px-0.5 py-0.5"><input type="number" min={0} className={CIR} value={line.listPrice} onChange={(e) => updateLine(line.id, { listPrice: Number(e.target.value || 0) })} /></td>
                      <td className="px-0.5 py-0.5"><input type="number" min={0} className={CIR} value={line.netPrice ?? lt.lineTotal} onChange={(e) => updateLine(line.id, { netPrice: Number(e.target.value || 0) })} /></td>
                      <td className="px-0.5 py-0.5 text-center"><button onClick={() => removeLine(line.id)} className="text-slate-400 hover:text-red-500 text-[10px]" title="Fjern">✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-1.5 flex items-center justify-between">
            <button onClick={addLine} className="btn-ghost text-[11px]">+ Tilføj linje</button>
            <span className="text-[10px] text-slate-400">{form.lines.length} linjer</span>
          </div>

          {/* ── Bottom row: Aftalt pris + Summering side by side ── */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Aftalt pris + comments */}
            <div className="space-y-3">
              <div className="rounded-md border border-emerald-200 bg-emerald-50/40 px-3 py-2.5">
                <label className="text-[11px] font-semibold text-emerald-700 block">
                  Aftalt nettopris (DKK)
                  <div className="flex items-center gap-2 mt-1">
                    <input type="number" min={0} className="flex-1 rounded border border-emerald-300 bg-white px-2 py-1 text-xs text-right text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-400" placeholder="Fx 100000" value={aftalPris} onChange={(e) => handleAftalPris(e.target.value)} />
                    {computedDiscountPct != null && <span className="text-[11px] text-emerald-700 font-bold whitespace-nowrap">{computedDiscountPct.toFixed(1)}% rabat</span>}
                  </div>
                  <p className="text-[9px] text-slate-500 mt-0.5 font-normal">Rabatten beregnes automatisk på medievisning.</p>
                </label>
              </div>
              <label className="text-[11px] text-slate-500 block">Kommentarer
                <textarea className="input-field mt-0.5 !text-xs min-h-[64px]" value={form.comments || ""} onChange={(e) => updateField("comments", e.target.value)} />
              </label>
            </div>

            {/* Right: Summering */}
            <div className="space-y-2 text-[11px]">
              <div className="rounded-md border border-slate-200 p-2.5 space-y-1">
                <div className="flex justify-between"><span className="text-slate-500">Linjer subtotal</span><span className="tabular-nums font-medium">{fmt(totals.linesSubtotal, form.currency)}</span></div>
                {totals.fixedCostsTotal > 0 && <div className="flex justify-between"><span className="text-slate-500">Faste omkostninger</span><span className="tabular-nums">{fmt(totals.fixedCostsTotal, form.currency)}</span></div>}
                <div className="flex justify-between font-semibold border-t border-slate-200 pt-1"><span>Subtotal</span><span className="tabular-nums">{fmt(totals.subtotal, form.currency)}</span></div>
              </div>
              <div className="rounded-md border border-slate-200 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer"><input type="checkbox" checked={form.infoCompensationPct > 0} onChange={(e) => updateField("infoCompensationPct", e.target.checked ? 15 : 0)} className="accent-indigo-500" /><span>Info.godtg.</span></label>
                  {form.infoCompensationPct > 0 && <input type="number" min={0} className="w-16 input-field !py-0.5 !text-[10px] text-right" value={form.infoCompensationPct} onChange={(e) => updateField("infoCompensationPct", Number(e.target.value || 0))} />}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-slate-600 cursor-pointer"><input type="checkbox" checked={form.securityPct > 0} onChange={(e) => updateField("securityPct", e.target.checked ? 10 : 0)} className="accent-indigo-500" /><span>Sikkerhedsstillelse</span></label>
                  {form.securityPct > 0 && <input type="number" min={0} className="w-16 input-field !py-0.5 !text-[10px] text-right" value={form.securityPct} onChange={(e) => updateField("securityPct", Number(e.target.value || 0))} />}
                </div>
                <label className="text-slate-500 block">Moms %<input type="number" min={0} className="input-field mt-0.5 !py-0.5 !text-[10px] text-right w-1/2" value={form.vatPct} onChange={(e) => updateField("vatPct", Number(e.target.value || 0))} /></label>
                <div className="border-t border-slate-200 pt-1 mt-1 space-y-0.5">
                  {totals.infoCompensationAmount !== 0 && <div className="flex justify-between text-slate-500"><span>Informationsgodtgørelse</span><span className="tabular-nums">{fmt(totals.infoCompensationAmount, form.currency)}</span></div>}
                  {totals.securityAmount !== 0 && <div className="flex justify-between text-slate-500"><span>Sikkerhedsstillelse</span><span className="tabular-nums">{fmt(totals.securityAmount, form.currency)}</span></div>}
                  <div className="flex justify-between text-slate-500"><span>Moms</span><span className="tabular-nums">{fmt(totals.vatAmount, form.currency)}</span></div>
                  <div className="flex justify-between font-bold text-slate-900 text-xs border-t border-slate-200 pt-1"><span>TOTAL</span><span className="tabular-nums">{fmt(totals.grandTotal, form.currency)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── RIGHT: Line editor + saved tilbud ── */}
        <aside className="xl:col-span-3 space-y-3">
          {/* Active line editor */}
          <div className="surface-card p-3">
            <h3 className="text-xs font-bold text-slate-900 mb-2 uppercase tracking-wide">Linje detaljer</h3>
            {activeLine ? (
              <div className="space-y-2 text-[11px]">
                <p className="text-[10px] text-slate-500 truncate">Aktiv: <span className="font-semibold text-slate-800">{activeLine.name || "Ny linje"}</span></p>

                {isMediaLine(activeLine) && (
                  <div className="rounded border border-orange-200 bg-orange-50/50 p-2 space-y-1.5">
                    <p className="text-[10px] font-semibold text-orange-700 uppercase">Enhedsberegner (m²)</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <label className="text-slate-500">Bredde (m)<input type="number" min={0} step="0.01" className="input-field mt-0.5 !py-0.5 !text-[10px] text-right" value={activeLine.widthMeters || 0} onChange={(e) => updateLineCalculator(activeLine.id, { widthMeters: Number(e.target.value || 0) })} /></label>
                      <label className="text-slate-500">Højde (m)<input type="number" min={0} step="0.01" className="input-field mt-0.5 !py-0.5 !text-[10px] text-right" value={activeLine.heightMeters || 0} onChange={(e) => updateLineCalculator(activeLine.id, { heightMeters: Number(e.target.value || 0) })} /></label>
                    </div>
                    <label className="text-slate-500 block">m² pris/uge<input type="number" min={0} step="0.01" className="input-field mt-0.5 !py-0.5 !text-[10px] text-right" value={activeLine.unitPricePerSqmPerWeek || 0} onChange={(e) => updateLineCalculator(activeLine.id, { unitPricePerSqmPerWeek: Number(e.target.value || 0) })} /></label>
                    <div className="text-[10px] text-slate-500 pt-1 border-t border-orange-200 space-y-0.5">
                      <div className="flex justify-between"><span>m² total</span><span className="tabular-nums">{activeLineTotals?.areaSqm.toFixed(2) || "0"} m²</span></div>
                      <div className="flex justify-between"><span>Mediepris</span><span className="tabular-nums">{fmt(activeLineTotals?.mediaPrice || 0, form.currency)}</span></div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-slate-500">Antal<input type="number" min={1} className="input-field mt-0.5 !py-0.5 !text-[10px] text-right" value={activeLine.quantity || 1} onChange={(e) => updateLineCalculator(activeLine.id, { quantity: Number(e.target.value || 1) })} /></label>
                  <label className="text-slate-500">Rabat %<input type="number" min={0} max={100} className="input-field mt-0.5 !py-0.5 !text-[10px] text-right" value={activeLine.discountPct || 0} onChange={(e) => updateLine(activeLine.id, { discountPct: Number(e.target.value || 0) })} /></label>
                </div>
                <label className="text-slate-500 block">Kommentar<textarea className="input-field mt-0.5 !text-[10px]" value={activeLine.notes || ""} onChange={(e) => updateLine(activeLine.id, { notes: e.target.value })} rows={2} /></label>
                <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200 pt-1"><span>Nettopris</span><span className="tabular-nums">{fmt(activeLineTotals?.lineTotal || 0, form.currency)}</span></div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400">Klik på en linje for at redigere.</p>
            )}
          </div>

          {/* Saved tilbud */}
          <div className="surface-card p-3">
            <h3 className="text-xs font-bold text-slate-900 mb-2">Gemte tilbud</h3>
            {loading ? <p className="text-[10px] text-slate-400">Henter...</p> : items.length === 0 ? <p className="text-[10px] text-slate-400">Ingen tilbud endnu.</p> : (
              <div className="space-y-1 max-h-[400px] overflow-auto scroll-slim">
                {items.map((item) => (
                  <button key={item.id} onClick={() => openFromList(item)} className={`w-full text-left rounded px-2 py-1.5 border transition-colors ${selectedId === item.id ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-semibold text-slate-800 truncate">{item.offerNumber}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded ${item.status === "final" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.status}</span>
                    </div>
                    <p className="text-[9px] text-slate-400 truncate">{item.clientName || "-"} &middot; {item.lines[0] ? linePeriod(item.lines[0]) : "-"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── Placement modal ── */}
      {showPlacementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) { setShowPlacementModal(false); setEditingPlacement(null); } }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">Placeringer</h2>
              <button onClick={() => { setShowPlacementModal(false); setEditingPlacement(null); }} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-[10px] text-slate-500">Faste satser: Montering <strong>{MONTERING_PER_SQM} DKK/m²</strong> &middot; Produktion <strong>{PRODUKTION_PER_SQM} DKK/m²</strong></p>

              {/* Form */}
              <div className="rounded-lg border border-slate-200 p-3 space-y-2 text-[11px]">
                <p className="font-semibold text-slate-700">{editingPlacement ? "Rediger placering" : "Ny placering"}</p>
                <label className="block text-slate-500">Navn / adresse<input className="input-field mt-0.5 !py-1 !text-xs" value={pf.name} onChange={(e) => setPf((p) => ({ ...p, name: e.target.value }))} placeholder="Fx Gammel Kongevej 49" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-slate-500">Areal (m²)<input type="number" min={0} className="input-field mt-0.5 !py-1 !text-xs text-right" value={pf.areaSqm || ""} onChange={(e) => setPf((p) => ({ ...p, areaSqm: Number(e.target.value || 0) }))} /></label>
                  <label className="text-slate-500">Listepris (DKK/m²/uge)<input type="number" min={0} className="input-field mt-0.5 !py-1 !text-xs text-right" value={pf.listPricePerSqmPerWeek || ""} onChange={(e) => setPf((p) => ({ ...p, listPricePerSqmPerWeek: Number(e.target.value || 0) }))} /></label>
                </div>
                <label className="block text-slate-500">Kommunale gebyr (DKK)<input type="number" min={0} className="input-field mt-0.5 !py-1 !text-xs text-right" value={pf.kommunaleGebyr || ""} onChange={(e) => setPf((p) => ({ ...p, kommunaleGebyr: Number(e.target.value || 0) }))} /></label>
                <div className="flex gap-2 pt-1">
                  <button onClick={savePlacement} className="btn-primary">{editingPlacement ? "Opdater" : "Opret"}</button>
                  {editingPlacement && <button onClick={() => { setEditingPlacement(null); setPf({ name: "", areaSqm: 0, listPricePerSqmPerWeek: 0, kommunaleGebyr: 0, notes: "" }); }} className="btn-ghost">Annuller</button>}
                </div>
              </div>

              {/* List */}
              {placementsLoading ? <p className="text-xs text-slate-400">Henter...</p> : placements.length === 0 ? <p className="text-xs text-slate-400">Ingen placeringer endnu.</p> : (
                <div className="space-y-1.5">
                  {placements.map((p) => (
                    <div key={p.id} className="rounded border border-slate-200 px-3 py-2 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-500">{p.areaSqm} m² &middot; {p.listPricePerSqmPerWeek} DKK/m²/uge{p.kommunaleGebyr > 0 && ` · Gebyr: ${p.kommunaleGebyr}`}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => startEditPlacement(p)} className="btn-ghost !px-1.5 !py-0.5 text-[10px]">Ret</button>
                        <button onClick={() => deletePlacementById(p.id)} className="btn-ghost !px-1.5 !py-0.5 text-[10px] text-red-500">Slet</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
