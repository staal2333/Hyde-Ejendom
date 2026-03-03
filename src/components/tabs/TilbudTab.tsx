"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  calcLineTotals,
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

interface TilbudListResponse {
  items: Tilbud[];
  total: number;
}

export interface TilbudTabProps {
  onToast: (message: string, type: "success" | "error" | "info") => void;
}

function formatMoney(value: number, currency = "DKK") {
  return `${value.toLocaleString("da-DK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function linePeriod(line: TilbudLine) {
  if (line.fromWeek != null || line.toWeek != null) {
    return `Uge ${line.fromWeek ?? "-"} til uge ${line.toWeek ?? "-"}`;
  }
  if (!line.fromDate && !line.toDate) return "-";
  return `${line.fromDate || "-"} - ${line.toDate || "-"}`;
}

function isMediaLine(line: TilbudLine | null): boolean {
  if (!line) return false;
  return line.name.trim().toLowerCase() === "medievisning";
}

export function TilbudTab({ onToast }: TilbudTabProps) {
  const [items, setItems] = useState<Tilbud[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Tilbud>(() => createDefaultTilbud(1));
  const [activeCalcLineId, setActiveCalcLineId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tilbud?limit=100");
      const data = (await res.json()) as TilbudListResponse;
      setItems(data.items || []);
    } catch {
      onToast("Kunne ikke hente tilbud", "error");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openFromList = useCallback((tilbud: Tilbud) => {
    setForm({
      ...tilbud,
      fixedCosts: normalizeFixedCosts(tilbud.fixedCosts),
    });
    setSelectedId(tilbud.id);
    setActiveCalcLineId(tilbud.lines[0]?.id ?? null);
  }, []);

  const createNew = useCallback(() => {
    const seed = Date.now();
    const next = createDefaultTilbud(seed);
    setForm(next);
    setSelectedId(null);
    setActiveCalcLineId(next.lines[0]?.id ?? null);
  }, []);

  const updateField = <K extends keyof Tilbud>(key: K, value: Tilbud[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateLine = (lineId: string, patch: Partial<TilbudLine>) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    }));
  };

  const addLine = () => {
    const newLine = createDefaultTilbudLine(form.lines.length + 1);
    setForm((prev) => ({
      ...prev,
      lines: [...prev.lines, newLine],
    }));
    setActiveCalcLineId(newLine.id);
  };

  const removeLine = (lineId: string) => {
    setForm((prev) => {
      if (prev.lines.length <= 1) return prev;
      const nextLines = prev.lines.filter((x) => x.id !== lineId);
      if (activeCalcLineId === lineId) {
        setActiveCalcLineId(nextLines[0]?.id ?? null);
      }
      return { ...prev, lines: nextLines };
    });
  };

  const updateLineCalculator = (
    lineId: string,
    patch: Partial<Pick<TilbudLine, "widthMeters" | "heightMeters" | "unitPricePerSqmPerWeek" | "weeks" | "quantity">>
  ) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => {
        if (line.id !== lineId) return line;
        const next = { ...line, ...patch };
        const areaSqm = Math.max(0, (next.widthMeters || 0) * (next.heightMeters || 0));
        const unitListPrice = areaSqm > 0 ? (next.unitPricePerSqmPerWeek || 0) * areaSqm : 0;
        return { ...next, listPrice: Number(unitListPrice.toFixed(2)) };
      }),
    }));
  };

  const updateFixedCost = (costId: string, patch: Partial<FixedCost>) => {
    setForm((prev) => ({
      ...prev,
      fixedCosts: (prev.fixedCosts || []).map((cost) => (cost.id === costId ? { ...cost, ...patch } : cost)),
    }));
  };

  const save = async (status?: "draft" | "final"): Promise<string | null> => {
    setSaving(true);
    try {
      if (!form.clientName.trim()) {
        onToast("Udfyld kundenavn før gem", "error");
        return null;
      }
      if (!form.offerDate) {
        onToast("Udfyld tilbudsdato", "error");
        return null;
      }
      const payload: Tilbud = {
        ...form,
        fixedCosts: normalizeFixedCosts(form.fixedCosts),
        status: status || form.status,
      };
      const res = await fetch("/api/tilbud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { success?: boolean; tilbud?: Tilbud; error?: string };
      if (!res.ok || !data.tilbud) {
        onToast(data.error || "Kunne ikke gemme tilbud", "error");
        return null;
      }
      setForm({
        ...data.tilbud,
        fixedCosts: normalizeFixedCosts(data.tilbud.fixedCosts),
      });
      setSelectedId(data.tilbud.id);
      await fetchItems();
      onToast("Tilbud gemt", "success");
      return data.tilbud.id;
    } catch {
      onToast("Fejl ved gem", "error");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      let offerId = selectedId;
      if (!offerId) {
        offerId = await save(form.status);
        if (!offerId) return;
      }
      const res = await fetch("/api/tilbud/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: offerId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Kunne ikke generere PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.offerNumber || "Tilbud"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onToast("PDF genereret", "success");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Fejl ved PDF", "error");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const totals = useMemo(() => calcTilbudTotals(form), [form]);
  useEffect(() => {
    if (!activeCalcLineId && form.lines.length > 0) {
      setActiveCalcLineId(form.lines[0].id);
    }
  }, [activeCalcLineId, form.lines]);
  const activeLine = useMemo(
    () => form.lines.find((line) => line.id === activeCalcLineId) ?? form.lines[0] ?? null,
    [form.lines, activeCalcLineId]
  );
  const activeLineTotals = useMemo(
    () => (activeLine ? calcLineTotals(activeLine) : null),
    [activeLine]
  );

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Excel-lignende tilbudslayout med faste omkostninger og PDF.</p>
        <div className="flex items-center gap-2">
          <button onClick={createNew} className="btn-secondary">Nyt tilbud</button>
          <button onClick={() => save("draft")} disabled={saving} className="btn-secondary">
            {saving ? "Gemmer..." : "Gem kladde"}
          </button>
          <button onClick={() => save("final")} disabled={saving} className="btn-primary">
            Marker som final
          </button>
          <button onClick={downloadPdf} disabled={downloadingPdf} className="btn-success">
            {downloadingPdf ? "Genererer..." : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <section className="xl:col-span-8 rounded-2xl border border-slate-200 bg-slate-200 p-3">
          <div className="rounded-xl border border-slate-300 bg-white p-4 sm:p-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-xl font-black tracking-tight text-slate-900">TILBUD</h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">{form.title || "Tilbud"}</p>
                  </div>
                  <div className="text-right text-[11px]">
                    <img
                      src="/api/tilbud/logo"
                      alt="Hyde Media logo"
                      className="w-16 h-16 object-contain ml-auto mb-1 rounded bg-black"
                    />
                    <p className="font-semibold text-slate-700">{HYDE_COMPANY_NAME}</p>
                    <p className="text-slate-500">{HYDE_ADDRESS_LINE}</p>
                    <p className="text-slate-500">{HYDE_CITY_LINE}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] mb-3">
                  <label className="text-slate-600">Tilbudsnr.
                    <input className="input-field mt-1 !py-1.5 !text-xs" value={form.offerNumber} onChange={(e) => updateField("offerNumber", e.target.value)} />
                  </label>
                  <label className="text-slate-600">Dato
                    <input type="date" className="input-field mt-1 !py-1.5 !text-xs" value={form.offerDate} onChange={(e) => updateField("offerDate", e.target.value)} />
                  </label>
                  <label className="text-slate-600">Kunde
                    <input className="input-field mt-1 !py-1.5 !text-xs" value={form.clientName} onChange={(e) => updateField("clientName", e.target.value)} />
                  </label>
                  <label className="text-slate-600">Kampagne
                    <input className="input-field mt-1 !py-1.5 !text-xs" value={form.campaignName || ""} onChange={(e) => updateField("campaignName", e.target.value)} />
                  </label>
                  <label className="text-slate-600">Vores reference
                    <input className="input-field mt-1 !py-1.5 !text-xs" value={form.ourReference || ""} onChange={(e) => updateField("ourReference", e.target.value)} />
                  </label>
                  <label className="text-slate-600">Jeres reference
                    <input className="input-field mt-1 !py-1.5 !text-xs" value={form.yourReference || ""} onChange={(e) => updateField("yourReference", e.target.value)} />
                  </label>
                </div>

                <div className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
                  Klik på en linje for at redigere den og bruge enhedsberegneren til højre.
                </div>
                <div className="overflow-y-auto overflow-x-hidden border border-slate-300 rounded-md">
                  <table className="w-full text-[10px] table-fixed">
                    <thead>
                      <tr className="bg-black text-white sticky top-0 z-10">
                        <th className="text-left p-0.5 font-semibold w-[31%]">Navn</th>
                        <th className="text-right p-0.5 font-semibold w-[10%]">Uge fra</th>
                        <th className="text-right p-0.5 font-semibold w-[10%]">Uge til</th>
                        <th className="text-right p-0.5 font-semibold w-[8%]">Antal</th>
                        <th className="text-right p-0.5 font-semibold w-[16%]">Listepris</th>
                        <th className="text-right p-0.5 font-semibold w-[16%]">Nettopris</th>
                        <th className="text-right p-0.5 font-semibold w-[9%]"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.lines.map((line) => {
                        const lineTotals = calcLineTotals(line);
                        return (
                          <tr
                            key={line.id}
                            className={`border-t border-slate-200 cursor-pointer ${
                              activeLine?.id === line.id
                                ? "bg-orange-50 ring-1 ring-inset ring-orange-300"
                                : "bg-white hover:bg-slate-50"
                            }`}
                            onClick={() => setActiveCalcLineId(line.id)}
                          >
                            <td className="p-0.5">
                              <input
                                className="h-6 w-full rounded-sm border border-orange-300 bg-orange-50 px-1 text-[10px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                placeholder="Fx Ny Østergade"
                                value={line.name}
                                onChange={(e) => updateLine(line.id, { name: e.target.value })}
                              />
                            </td>
                            <td className="p-0.5">
                              <input
                                type="number"
                                min={0}
                                className="h-6 w-full rounded-sm border border-orange-300 bg-orange-50 px-1 text-[10px] text-right text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                value={line.fromWeek ?? ""}
                                onChange={(e) => updateLine(line.id, { fromWeek: e.target.value === "" ? undefined : Number(e.target.value) })}
                              />
                            </td>
                            <td className="p-0.5">
                              <input
                                type="number"
                                min={0}
                                className="h-6 w-full rounded-sm border border-orange-300 bg-orange-50 px-1 text-[10px] text-right text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                value={line.toWeek ?? ""}
                                onChange={(e) => updateLine(line.id, { toWeek: e.target.value === "" ? undefined : Number(e.target.value) })}
                              />
                            </td>
                            <td className="p-0.5">
                              <input
                                type="number"
                                min={1}
                                className="h-6 w-full rounded-sm border border-orange-300 bg-orange-50 px-1 text-[10px] text-right text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                value={line.quantity}
                                onChange={(e) => updateLine(line.id, { quantity: Number(e.target.value || 1) })}
                              />
                            </td>
                            <td className="p-0.5">
                              <input
                                type="number"
                                min={0}
                                className="h-6 w-full rounded-sm border border-orange-300 bg-orange-50 px-1 text-[10px] text-right text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                value={line.listPrice}
                                onChange={(e) => updateLine(line.id, { listPrice: Number(e.target.value || 0) })}
                              />
                            </td>
                            <td className="p-0.5">
                              <input
                                type="number"
                                min={0}
                                className="h-6 w-full rounded-sm border border-orange-300 bg-orange-50 px-1 text-[10px] text-right text-slate-900 focus:outline-none focus:ring-1 focus:ring-orange-300"
                                value={line.netPrice ?? lineTotals.lineTotal}
                                onChange={(e) => updateLine(line.id, { netPrice: Number(e.target.value || 0) })}
                              />
                            </td>
                            <td className="p-0.5 text-right">
                              <button onClick={() => removeLine(line.id)} className="btn-ghost !px-1 !py-0 text-[10px]" title="Fjern linje">✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <button onClick={addLine} className="btn-secondary">+ Tilføj linje</button>
                  <span className="text-[10px] text-slate-500">Linjer: {form.lines.length}</span>
                </div>

                <div className="mt-3 border-t border-slate-200 pt-3">
                  <label className="text-[11px] text-slate-600">Kommentarer til tilbuddet
                    <textarea className="input-field mt-1 !text-xs min-h-[80px]" value={form.comments || ""} onChange={(e) => updateField("comments", e.target.value)} />
                  </label>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="border border-slate-300">
                  <div className="bg-black text-white px-2 py-1 text-[11px] font-semibold">LISTEPRISER</div>
                  <div className="p-2 space-y-1.5 text-[11px]">
                    <div className="flex justify-between"><span>Linjer subtotal</span><span className="tabular-nums">{formatMoney(totals.linesSubtotal, form.currency)}</span></div>
                    <div className="flex justify-between"><span>Faste omkostninger</span><span className="tabular-nums">{formatMoney(totals.fixedCostsTotal, form.currency)}</span></div>
                    <div className="flex justify-between font-semibold border-t border-slate-200 pt-1"><span>Total før rabat/tillæg</span><span className="tabular-nums">{formatMoney(totals.subtotal, form.currency)}</span></div>
                  </div>
                </div>

                <div className="border border-slate-300 mt-2">
                  <div className="bg-black text-white px-2 py-1 text-[11px] font-semibold">TILBUDSPRISER</div>
                  <div className="p-2 space-y-2 text-[11px]">
                    <label className="block">Informationsgodtgørelse %
                      <input type="number" min={0} className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right" value={form.infoCompensationPct} onChange={(e) => updateField("infoCompensationPct", Number(e.target.value || 0))} />
                    </label>
                    <label className="block">Sikkerhedsstillelse %
                      <input type="number" min={0} className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right" value={form.securityPct} onChange={(e) => updateField("securityPct", Number(e.target.value || 0))} />
                    </label>
                    <label className="block">Moms %
                      <input type="number" min={0} className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right" value={form.vatPct} onChange={(e) => updateField("vatPct", Number(e.target.value || 0))} />
                    </label>
                    <div className="space-y-1.5 border-t border-slate-200 pt-2">
                      <div className="flex justify-between"><span>Informationsgodtgørelse</span><span className="tabular-nums">{formatMoney(totals.infoCompensationAmount, form.currency)}</span></div>
                      <div className="flex justify-between"><span>Sikkerhedsstillelse</span><span className="tabular-nums">{formatMoney(totals.securityAmount, form.currency)}</span></div>
                      <div className="flex justify-between"><span>Moms</span><span className="tabular-nums">{formatMoney(totals.vatAmount, form.currency)}</span></div>
                      <div className="flex justify-between font-bold text-[12px] border-t border-slate-200 pt-1"><span>TOTAL</span><span className="tabular-nums">{formatMoney(totals.grandTotal, form.currency)}</span></div>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-300 mt-2">
                  <div className="bg-black text-white px-2 py-1 text-[11px] font-semibold">ENHEDSBEREGNER (m²)</div>
                  {activeLine ? (
                    <div className="p-2 space-y-2 text-[11px]">
                      <p className="text-slate-600">
                        Aktiv linje: <span className="font-semibold text-slate-800">{activeLine.name || "Ny linje"}</span>
                      </p>
                      {isMediaLine(activeLine) ? (
                        <>
                          <label className="block">Bredde (m)
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right"
                              value={activeLine.widthMeters || 0}
                              onChange={(e) => updateLineCalculator(activeLine.id, { widthMeters: Number(e.target.value || 0) })}
                            />
                          </label>
                          <label className="block">Højde (m)
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right"
                              value={activeLine.heightMeters || 0}
                              onChange={(e) => updateLineCalculator(activeLine.id, { heightMeters: Number(e.target.value || 0) })}
                            />
                          </label>
                          <label className="block">m² pris pr. uge
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right"
                              value={activeLine.unitPricePerSqmPerWeek || 0}
                              onChange={(e) => updateLineCalculator(activeLine.id, { unitPricePerSqmPerWeek: Number(e.target.value || 0) })}
                            />
                          </label>
                        </>
                      ) : (
                        <p className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px] text-slate-600">
                          Enhedsberegner bruges kun til linjen "Medievisning".
                        </p>
                      )}
                      <label className="block">Antal
                        <input
                          type="number"
                          min={1}
                          className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right"
                          value={activeLine.quantity || 1}
                          onChange={(e) => updateLineCalculator(activeLine.id, { quantity: Number(e.target.value || 1) })}
                        />
                      </label>
                      <label className="block">Uge fra
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right"
                          value={activeLine.fromWeek ?? ""}
                          onChange={(e) => updateLine(activeLine.id, { fromWeek: e.target.value === "" ? undefined : Number(e.target.value) })}
                        />
                      </label>
                      <label className="block">Uge til
                        <input
                          type="number"
                          min={0}
                          className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right"
                          value={activeLine.toWeek ?? ""}
                          onChange={(e) => updateLine(activeLine.id, { toWeek: e.target.value === "" ? undefined : Number(e.target.value) })}
                        />
                      </label>
                      <label className="block">Rabat %
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-right"
                          value={activeLine.discountPct || 0}
                          onChange={(e) => updateLine(activeLine.id, { discountPct: Number(e.target.value || 0) })}
                        />
                      </label>
                      <label className="block">Linje kommentar
                        <textarea
                          className="mt-1 w-full rounded border border-orange-300 bg-orange-100 px-2 py-1 text-left"
                          value={activeLine.notes || ""}
                          onChange={(e) => updateLine(activeLine.id, { notes: e.target.value })}
                          rows={2}
                        />
                      </label>
                      <div className="space-y-1.5 border-t border-slate-200 pt-2">
                        <div className="flex justify-between"><span>m² total</span><span className="tabular-nums">{activeLineTotals?.areaSqm.toFixed(2) || "0.00"} m²</span></div>
                        <div className="flex justify-between"><span>Listepris pr. uge</span><span className="tabular-nums">{formatMoney(activeLineTotals?.unitListPricePerWeek || 0, form.currency)}</span></div>
                        <div className="flex justify-between"><span>Total mediepris</span><span className="tabular-nums">{formatMoney(activeLineTotals?.mediaPrice || 0, form.currency)}</span></div>
                        <div className="flex justify-between font-semibold border-t border-slate-200 pt-1"><span>Nettopris</span><span className="tabular-nums">{formatMoney(activeLineTotals?.lineTotal || 0, form.currency)}</span></div>
                      </div>
                    </div>
                  ) : (
                    <p className="p-2 text-[11px] text-slate-500">Tilføj en linje for at bruge enhedsberegneren.</p>
                  )}
                </div>

                {(form.fixedCosts || []).length > 0 && (
                  <div className="rounded-lg border border-slate-300 p-2 mt-2">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Faste omkostninger</h3>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-auto scroll-slim">
                      {(form.fixedCosts || []).map((cost) => (
                        <div key={cost.id} className="grid grid-cols-12 gap-1 items-center">
                          <span className="col-span-6 text-xs text-slate-700">{cost.label}</span>
                          <input type="number" min={0} className="col-span-4 input-field !py-1 !text-xs text-right" value={cost.amount} onChange={(e) => updateFixedCost(cost.id, { amount: Number(e.target.value || 0) })} />
                          <label className="col-span-2 text-[10px] flex items-center justify-end gap-1.5"><input type="checkbox" checked={cost.enabled} onChange={(e) => updateFixedCost(cost.id, { enabled: e.target.checked })} />På</label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="xl:col-span-4 surface-card p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-2">Gemte tilbud</h3>
          {loading ? (
            <p className="text-xs text-slate-500">Henter tilbud...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-500">Ingen tilbud endnu.</p>
          ) : (
            <div className="space-y-1.5 max-h-[720px] overflow-auto scroll-slim">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openFromList(item)}
                  className={`w-full text-left rounded-lg px-2.5 py-2 border transition-colors ${
                    selectedId === item.id ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 truncate">{item.offerNumber}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${item.status === "final" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{item.status}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">{item.clientName || "-"}</p>
                  <p className="text-[10px] text-slate-400 truncate">{item.lines[0] ? linePeriod(item.lines[0]) : "-"}</p>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
