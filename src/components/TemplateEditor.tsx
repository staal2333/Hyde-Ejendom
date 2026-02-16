"use client";

// ============================================================
// TemplateEditor – Visual editor for defining image slots on
// PDF presentation template pages.
//
// Features:
//   - pdfjs-dist renders each PDF page client-side
//   - Add/move/resize rectangular image slots per page
//   - 8-handle resize (corners + edges)
//   - Numeric inputs for precise coordinates
//   - Object-fit mode per slot (cover/contain/fill)
//   - Frame linking per slot
//   - Editable labels
// ============================================================

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { PresentationPage, ImageSlot, TextSlot, Frame } from "@/lib/ooh/types";
import Ic from "./ui/Icon";

/* ---------- pdfjs-dist (loaded from public/ to bypass webpack) ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsLib: any = null;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  // @ts-expect-error runtime ESM import from public/, no type declarations needed
  const lib = await import(/* webpackIgnore: true */ "/pdf.min.mjs");
  lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  pdfjsLib = lib;
  return lib;
}

/* ---------- Constants ---------- */

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize",
  se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize",
};

/* ---------- Types ---------- */

interface TemplateEditorProps {
  pdfUrl: string;
  pages: PresentationPage[];
  frames: Frame[];
  onPagesChange: (pages: PresentationPage[]) => void;
  onClose?: () => void;
}

interface DragState {
  type: "move" | ResizeHandle;
  slotId: string;
  startX: number;
  startY: number;
  origSlot: ImageSlot;
}

/* ---------- Helpers ---------- */

// Ic imported from ./ui/Icon

/* ---------- Component ---------- */

export default function TemplateEditor({ pdfUrl, pages, frames, onPagesChange, onClose }: TemplateEditorProps) {
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [pageDims, setPageDims] = useState<{ w: number; h: number; pdfW: number; pdfH: number }[]>([]);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [saveFlash, setSaveFlash] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Undo/Redo ─────────────────────────────────────────
  const historyRef = useRef<{ past: PresentationPage[][]; future: PresentationPage[][] }>({ past: [], future: [] });
  const [, forceUpdate] = useState(0);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  const pushHistory = useCallback((prevPages: PresentationPage[]) => {
    historyRef.current.past.push(JSON.parse(JSON.stringify(prevPages)));
    historyRef.current.future = [];
    // Keep max 30 undo steps
    if (historyRef.current.past.length > 30) historyRef.current.past.shift();
    forceUpdate(n => n + 1);
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.past.length === 0) return;
    h.future.push(JSON.parse(JSON.stringify(pages)));
    const prev = h.past.pop()!;
    onPagesChange(prev);
    forceUpdate(n => n + 1);
  }, [pages, onPagesChange]);

  const redo = useCallback(() => {
    const h = historyRef.current;
    if (h.future.length === 0) return;
    h.past.push(JSON.parse(JSON.stringify(pages)));
    const next = h.future.pop()!;
    onPagesChange(next);
    forceUpdate(n => n + 1);
  }, [pages, onPagesChange]);

  // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z redo, Delete to remove selected
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); redo(); }
      if (e.key === "y" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); redo(); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedSlotId && !editingLabel) {
        // Check if it's an image slot or text slot
        const currentPage = pages[activePageIdx];
        if (currentPage?.imageSlots.some(s => s.id === selectedSlotId)) {
          e.preventDefault();
          pushHistory(pages);
          const up = [...pages];
          up[activePageIdx] = { ...up[activePageIdx], imageSlots: up[activePageIdx].imageSlots.filter(s => s.id !== selectedSlotId) };
          onPagesChange(up);
          setSelectedSlotId(null);
        } else if (currentPage?.textSlots?.some(s => s.id === selectedSlotId)) {
          e.preventDefault();
          pushHistory(pages);
          const up = [...pages];
          up[activePageIdx] = { ...up[activePageIdx], textSlots: (up[activePageIdx].textSlots || []).filter(s => s.id !== selectedSlotId) };
          onPagesChange(up);
          setSelectedSlotId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, selectedSlotId, editingLabel, pages, activePageIdx, onPagesChange, pushHistory]);

  // ── Render PDF pages ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function renderPages() {
      setLoading(true);
      setError(null);

      try {
        const pdfjs = await getPdfjs();
        const loadingTask = pdfjs.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;

        const images: string[] = [];
        const dims: { w: number; h: number; pdfW: number; pdfH: number }[] = [];

        for (let i = 0; i < pdf.numPages; i++) {
          const page = await pdf.getPage(i + 1);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport, canvas } as Record<string, unknown>).promise;

          images.push(canvas.toDataURL("image/png"));

          const origViewport = page.getViewport({ scale: 1 });
          dims.push({ w: viewport.width, h: viewport.height, pdfW: origViewport.width, pdfH: origViewport.height });
        }

        if (!cancelled) {
          setPageImages(images);
          setPageDims(dims);

          if (pages.length === 0 && images.length > 0) {
            onPagesChange(images.map((img, idx) => ({ pageIndex: idx, thumbnailUrl: img, imageSlots: [] })));
          } else if (pages.length > 0) {
            onPagesChange(pages.map((p, idx) => ({ ...p, thumbnailUrl: images[idx] || p.thumbnailUrl })));
          }

          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[TemplateEditor] PDF render error:", e);
          setError(e instanceof Error ? e.message : "Could not render PDF");
          setLoading(false);
        }
      }
    }

    renderPages();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl]);

  // ── Derived state ───────────────────────────────────────
  const currentPage = pages[activePageIdx];
  const currentSlots = currentPage?.imageSlots || [];
  const currentTextSlots = currentPage?.textSlots || [];
  const dim = pageDims[activePageIdx];
  const selectedSlot = currentSlots.find(s => s.id === selectedSlotId);

  // ── Slot CRUD ───────────────────────────────────────────
  const addSlot = useCallback(() => {
    if (!dim) return;
    pushHistory(pages);
    const newSlot: ImageSlot = {
      id: `slot_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      label: `Billede ${currentSlots.length + 1}`,
      x: dim.pdfW * 0.1,
      y: dim.pdfH * 0.1,
      width: dim.pdfW * 0.8,
      height: dim.pdfH * 0.35,
      pageWidth: dim.pdfW,
      pageHeight: dim.pdfH,
      objectFit: "cover",
    };
    const up = [...pages];
    up[activePageIdx] = { ...up[activePageIdx], imageSlots: [...currentSlots, newSlot] };
    onPagesChange(up);
    setSelectedSlotId(newSlot.id);
  }, [dim, currentSlots, pages, activePageIdx, onPagesChange, pushHistory]);

  const removeSlot = useCallback((slotId: string) => {
    pushHistory(pages);
    const up = [...pages];
    up[activePageIdx] = { ...up[activePageIdx], imageSlots: currentSlots.filter(s => s.id !== slotId) };
    onPagesChange(up);
    if (selectedSlotId === slotId) setSelectedSlotId(null);
  }, [pages, activePageIdx, currentSlots, onPagesChange, selectedSlotId, pushHistory]);

  const updateSlot = useCallback((slotId: string, updates: Partial<ImageSlot>) => {
    const up = [...pages];
    up[activePageIdx] = { ...up[activePageIdx], imageSlots: currentSlots.map(s => s.id === slotId ? { ...s, ...updates } : s) };
    onPagesChange(up);
  }, [pages, activePageIdx, currentSlots, onPagesChange]);

  // ── Text Slot CRUD ────────────────────────────────────
  const PLACEHOLDER_OPTIONS = [
    { value: "{{CLIENT_NAME}}", label: "Kundenavn" },
    { value: "{{COMPANY}}", label: "Virksomhed" },
    { value: "{{DATE}}", label: "Dato" },
    { value: "{{PRICE}}", label: "Pris" },
    { value: "{{ADDRESS}}", label: "Adresse" },
    { value: "{{CITY}}", label: "By" },
    { value: "{{PERIOD}}", label: "Periode" },
    { value: "{{CUSTOM}}", label: "Brugerdefineret" },
  ];

  const addTextSlot = useCallback(() => {
    if (!dim) return;
    pushHistory(pages);
    const newTs: TextSlot = {
      id: `txt_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      label: `Tekst ${currentTextSlots.length + 1}`,
      x: dim.pdfW * 0.1,
      y: dim.pdfH * 0.85,
      width: dim.pdfW * 0.3,
      height: 24,
      fontSize: 14,
      fontWeight: "normal",
      color: "#000000",
      placeholder: "{{CLIENT_NAME}}",
      align: "left",
    };
    const up = [...pages];
    up[activePageIdx] = { ...up[activePageIdx], textSlots: [...currentTextSlots, newTs] };
    onPagesChange(up);
    setSelectedSlotId(newTs.id);
  }, [dim, currentTextSlots, pages, activePageIdx, onPagesChange, pushHistory]);

  const removeTextSlot = useCallback((slotId: string) => {
    pushHistory(pages);
    const up = [...pages];
    up[activePageIdx] = { ...up[activePageIdx], textSlots: currentTextSlots.filter(s => s.id !== slotId) };
    onPagesChange(up);
    if (selectedSlotId === slotId) setSelectedSlotId(null);
  }, [pages, activePageIdx, currentTextSlots, onPagesChange, selectedSlotId, pushHistory]);

  const updateTextSlot = useCallback((slotId: string, updates: Partial<TextSlot>) => {
    const up = [...pages];
    up[activePageIdx] = { ...up[activePageIdx], textSlots: currentTextSlots.map(s => s.id === slotId ? { ...s, ...updates } : s) };
    onPagesChange(up);
  }, [pages, activePageIdx, currentTextSlots, onPagesChange]);

  // ── Coordinate conversion ───────────────────────────────
  const toScreen = useCallback((val: number, axis: "x" | "y") => {
    if (!dim) return 0;
    return axis === "x" ? (val / dim.pdfW) * dim.w : (val / dim.pdfH) * dim.h;
  }, [dim]);

  const toPdf = useCallback((val: number, axis: "x" | "y") => {
    if (!dim) return 0;
    return axis === "x" ? (val / dim.w) * dim.pdfW : (val / dim.h) * dim.pdfH;
  }, [dim]);

  // ── Drag handling (move + 8-directional resize) ─────────
  const startDrag = useCallback((e: React.MouseEvent, slotId: string, type: DragState["type"]) => {
    e.preventDefault();
    e.stopPropagation();
    const slot = currentSlots.find(s => s.id === slotId);
    if (!slot) return;
    setDragState({ type, slotId, startX: e.clientX, startY: e.clientY, origSlot: { ...slot } });
    setSelectedSlotId(slotId);
  }, [currentSlots]);

  useEffect(() => {
    if (!dragState || !dim) return;

    const sx = dim.pdfW / dim.w;
    const sy = dim.pdfH / dim.h;

    const onMove = (e: MouseEvent) => {
      const dx = (e.clientX - dragState.startX) * sx;
      const dy = (e.clientY - dragState.startY) * sy;
      const o = dragState.origSlot;

      if (dragState.type === "move") {
        updateSlot(dragState.slotId, {
          x: Math.max(0, Math.min(dim.pdfW - o.width, o.x + dx)),
          y: Math.max(0, Math.min(dim.pdfH - o.height, o.y + dy)),
        });
        return;
      }

      // Resize with handle direction
      let nx = o.x, ny = o.y, nw = o.width, nh = o.height;
      const h = dragState.type as ResizeHandle;

      // Horizontal
      if (h.includes("w")) { nx = Math.max(0, o.x + dx); nw = o.width - (nx - o.x); }
      if (h.includes("e")) { nw = o.width + dx; }
      // Vertical
      if (h.includes("n")) { ny = Math.max(0, o.y + dy); nh = o.height - (ny - o.y); }
      if (h.includes("s")) { nh = o.height + dy; }

      // Clamp minimums
      if (nw < 20) { nw = 20; if (h.includes("w")) nx = o.x + o.width - 20; }
      if (nh < 20) { nh = 20; if (h.includes("n")) ny = o.y + o.height - 20; }
      // Clamp to page
      if (nx + nw > dim.pdfW) nw = dim.pdfW - nx;
      if (ny + nh > dim.pdfH) nh = dim.pdfH - ny;

      updateSlot(dragState.slotId, { x: nx, y: ny, width: nw, height: nh });
    };

    const onUp = () => setDragState(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragState, dim, updateSlot]);

  // ── Loading / Error states ──────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-violet-200 border-t-violet-600 mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-600">Renderer PDF-sider...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-red-700 mb-1">Kunne ikke rendere PDF</p>
        <p className="text-xs text-red-500">{error}</p>
      </div>
    );
  }

  // ── 8 resize handles positions ──────────────────────────
  function renderHandles(slotId: string, w: number, h: number, isSelected: boolean) {
    if (!isSelected) return null;
    const sz = 8;
    const half = sz / 2;
    const handles: { handle: ResizeHandle; style: React.CSSProperties }[] = [
      { handle: "nw", style: { top: -half, left: -half } },
      { handle: "n", style: { top: -half, left: w / 2 - half } },
      { handle: "ne", style: { top: -half, left: w - half } },
      { handle: "e", style: { top: h / 2 - half, left: w - half } },
      { handle: "se", style: { top: h - half, left: w - half } },
      { handle: "s", style: { top: h - half, left: w / 2 - half } },
      { handle: "sw", style: { top: h - half, left: -half } },
      { handle: "w", style: { top: h / 2 - half, left: -half } },
    ];
    return handles.map(({ handle, style }) => (
      <div
        key={handle}
        className="absolute z-20 bg-violet-600 border border-white rounded-sm shadow-sm"
        style={{ ...style, width: sz, height: sz, cursor: HANDLE_CURSORS[handle] }}
        onMouseDown={e => startDrag(e, slotId, handle)}
      />
    ));
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ──────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-slate-900">Template Editor</h3>
          <span className="text-[11px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">Side {activePageIdx + 1}/{pageImages.length}</span>
          {currentSlots.length > 0 && (
            <span className="text-[11px] text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md font-semibold">{currentSlots.length} plads{currentSlots.length !== 1 ? "er" : ""}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Undo/Redo */}
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden mr-1">
            <button onClick={undo} disabled={!canUndo} className="px-2 py-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed" title="Fortryd (Ctrl+Z)">
              <Ic d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" className="w-3.5 h-3.5" />
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <button onClick={redo} disabled={!canRedo} className="px-2 py-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed" title="Gentag (Ctrl+Shift+Z)">
              <Ic d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" className="w-3.5 h-3.5" />
            </button>
          </div>

          <button onClick={addSlot} className="px-3 py-1.5 bg-violet-600 text-white text-[11px] font-semibold rounded-lg hover:bg-violet-700 flex items-center gap-1.5" title="Tilføj billedplads">
            <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3 h-3" />Billedplads
          </button>
          <button onClick={addTextSlot} className="px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-semibold rounded-lg hover:bg-emerald-700 flex items-center gap-1.5" title="Tilføj tekstfelt">
            <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3 h-3" />Tekstfelt
          </button>
          {onClose && (
            <button onClick={() => { setSaveFlash(true); setTimeout(() => setSaveFlash(false), 1500); onClose(); }}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all ${saveFlash ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {saveFlash ? (
                <><Ic d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3" />Gemt!</>
              ) : (
                "Gem & luk"
              )}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* ── Page sidebar ─────────────────────────── */}
        <div className="w-[88px] bg-slate-50 border-r border-slate-200 overflow-y-auto py-2 px-1.5 space-y-1.5 shrink-0">
          {pageImages.map((img, idx) => {
            const slotCount = pages[idx]?.imageSlots?.length || 0;
            return (
              <button key={idx} onClick={() => { setActivePageIdx(idx); setSelectedSlotId(null); }}
                className={`w-full rounded-lg overflow-hidden border-2 transition-all ${idx === activePageIdx ? "border-violet-500 shadow-md" : "border-transparent hover:border-slate-300"}`}>
                <img src={img} alt={`Side ${idx + 1}`} className="w-full" draggable={false} />
                <div className="flex items-center justify-center gap-1 py-0.5 bg-white text-center">
                  <span className="text-[9px] font-bold text-slate-500">{idx + 1}</span>
                  {slotCount > 0 && <span className="text-[8px] font-bold bg-violet-100 text-violet-600 px-1 rounded">{slotCount}</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Main canvas area ─────────────────────── */}
        <div className="flex-1 overflow-auto bg-slate-100/80 flex items-start justify-center p-4" ref={containerRef}>
          {pageImages[activePageIdx] && dim && (
            <div
              className="relative shadow-2xl rounded-lg overflow-visible bg-white"
              style={{ width: dim.w, height: dim.h }}
              onClick={() => setSelectedSlotId(null)}
            >
              <img src={pageImages[activePageIdx]} alt="" className="w-full h-full pointer-events-none select-none rounded-lg" draggable={false} />

              {/* Text slot overlays */}
              {currentTextSlots.map(ts => {
                const isSel = selectedSlotId === ts.id;
                const left = toScreen(ts.x, "x");
                const top = toScreen(ts.y, "y");
                const w = toScreen(ts.width, "x");
                const h = toScreen(ts.height, "y");
                return (
                  <div key={ts.id}
                    className="absolute transition-all duration-75"
                    style={{ left, top, width: w, height: h }}
                    onClick={e => { e.stopPropagation(); setSelectedSlotId(ts.id); }}
                  >
                    <div
                      className={`absolute inset-0 border-2 border-dashed rounded-sm cursor-move flex items-center px-1 ${
                        isSel ? "border-emerald-500 bg-emerald-500/10" : "border-emerald-400/60 bg-emerald-400/8 hover:bg-emerald-400/15"
                      }`}
                      onMouseDown={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedSlotId(ts.id);
                        // Simple move drag for text slots
                        const startX = e.clientX;
                        const startY = e.clientY;
                        const origX = ts.x;
                        const origY = ts.y;
                        const sx = dim!.pdfW / dim!.w;
                        const sy = dim!.pdfH / dim!.h;
                        const onMove = (ev: MouseEvent) => {
                          const dx = (ev.clientX - startX) * sx;
                          const dy = (ev.clientY - startY) * sy;
                          updateTextSlot(ts.id, {
                            x: Math.max(0, Math.min(dim!.pdfW - ts.width, origX + dx)),
                            y: Math.max(0, Math.min(dim!.pdfH - ts.height, origY + dy)),
                          });
                        };
                        const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                        window.addEventListener("mousemove", onMove);
                        window.addEventListener("mouseup", onUp);
                      }}
                    >
                      <div className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${isSel ? "bg-emerald-600 text-white" : "bg-emerald-500/80 text-white"}`}>
                        T {ts.label}
                      </div>
                      <span className="text-[10px] font-medium text-emerald-700 truncate pointer-events-none">{ts.placeholder}</span>
                    </div>
                  </div>
                );
              })}

              {/* Image slot overlays */}
              {currentSlots.map(slot => {
                const isSel = selectedSlotId === slot.id;
                const left = toScreen(slot.x, "x");
                const top = toScreen(slot.y, "y");
                const w = toScreen(slot.width, "x");
                const h = toScreen(slot.height, "y");
                const linkedFrame = frames.find(f => f.id === slot.linkedFrameId);

                return (
                  <div key={slot.id}
                    className={`absolute ${dragState?.slotId === slot.id ? "" : "transition-all duration-75"}`}
                    style={{ left, top, width: w, height: h }}
                    onClick={e => { e.stopPropagation(); setSelectedSlotId(slot.id); }}
                  >
                    {/* Rectangle */}
                    <div
                      className={`absolute inset-0 border-2 rounded-sm cursor-move ${
                        isSel ? "border-violet-500 bg-violet-500/10" : "border-blue-400/60 bg-blue-400/8 hover:bg-blue-400/15"
                      }`}
                      onMouseDown={e => startDrag(e, slot.id, "move")}
                    >
                      {/* Label badge */}
                      <div className={`absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-bold whitespace-nowrap ${isSel ? "bg-violet-600 text-white" : "bg-blue-500/80 text-white"}`}>
                        {slot.label}
                        {linkedFrame && <span className="ml-1 opacity-70">→ {linkedFrame.name}</span>}
                      </div>

                      {/* Center hint */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                        <Ic d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V4.5" className="w-6 h-6 text-slate-500" />
                      </div>

                      {/* Fit mode badge */}
                      {slot.objectFit && (
                        <div className={`absolute bottom-1 right-1 px-1 py-0.5 rounded text-[7px] font-bold uppercase ${isSel ? "bg-violet-600/80 text-white" : "bg-slate-600/60 text-white"}`}>
                          {slot.objectFit}
                        </div>
                      )}
                    </div>

                    {/* 8 resize handles */}
                    {renderHandles(slot.id, w, h, isSel)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right panel ──────────────────────────── */}
        <div className="w-72 bg-white border-l border-slate-200 overflow-y-auto shrink-0">
          <div className="p-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Billedpladser · Side {activePageIdx + 1}</h4>

            {currentSlots.length === 0 ? (
              <div className="text-center py-10">
                <Ic d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159" className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-xs text-slate-400 mb-3">Ingen billedpladser endnu</p>
                <button onClick={addSlot} className="px-3 py-1.5 bg-violet-600 text-white text-[11px] font-semibold rounded-lg hover:bg-violet-700">
                  + Tilføj billedplads
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {currentSlots.map(slot => {
                  const isSel = selectedSlotId === slot.id;
                  return (
                    <div key={slot.id}
                      className={`rounded-xl border p-3 cursor-pointer transition-all ${isSel ? "border-violet-300 bg-violet-50/50 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}
                      onClick={() => setSelectedSlotId(slot.id)}
                    >
                      {/* Label */}
                      <div className="flex items-center justify-between mb-2">
                        {editingLabel === slot.id ? (
                          <input type="text" defaultValue={slot.label} autoFocus
                            className="flex-1 text-xs font-semibold border border-violet-300 rounded px-2 py-1 focus:ring-2 focus:ring-violet-200 mr-2"
                            onBlur={e => { updateSlot(slot.id, { label: e.target.value || slot.label }); setEditingLabel(null); }}
                            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          />
                        ) : (
                          <span className="text-xs font-bold text-slate-800 truncate cursor-text" onDoubleClick={() => setEditingLabel(slot.id)} title="Dobbeltklik for at redigere">
                            {slot.label}
                          </span>
                        )}
                        <button onClick={e => { e.stopPropagation(); removeSlot(slot.id); }} className="p-1 text-slate-300 hover:text-red-500 rounded" title="Slet">
                          <Ic d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Frame linking */}
                      <select value={slot.linkedFrameId || ""}
                        onChange={e => updateSlot(slot.id, { linkedFrameId: e.target.value || undefined })}
                        className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 mb-2 bg-white focus:ring-2 focus:ring-violet-200"
                        onClick={e => e.stopPropagation()}>
                        <option value="">Ingen frame linket</option>
                        {frames.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>

                      {/* Object fit mode */}
                      <div className="mb-2">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Billedfyldning</label>
                        <div className="flex gap-1 mt-1">
                          {(["cover", "contain", "fill"] as const).map(fit => (
                            <button key={fit}
                              onClick={e => { e.stopPropagation(); updateSlot(slot.id, { objectFit: fit }); }}
                              className={`flex-1 px-2 py-1 text-[9px] font-bold rounded-md border transition-all ${
                                (slot.objectFit || "cover") === fit
                                  ? "bg-violet-600 text-white border-violet-600"
                                  : "bg-white text-slate-500 border-slate-200 hover:border-violet-300"
                              }`}>
                              {fit === "cover" ? "Crop" : fit === "contain" ? "Fit" : "Stretch"}
                            </button>
                          ))}
                        </div>
                        <p className="text-[8px] text-slate-400 mt-1">
                          {(slot.objectFit || "cover") === "cover" ? "Fylder hele pladsen, cropper kanter" : (slot.objectFit || "cover") === "contain" ? "Viser hele billedet, evt. med kanter" : "Strækker til at passe"}
                        </p>
                      </div>

                      {/* Numeric position/size inputs */}
                      {isSel && (
                        <div className="grid grid-cols-2 gap-1.5 mt-2 pt-2 border-t border-slate-100">
                          {([
                            { key: "x", label: "X" },
                            { key: "y", label: "Y" },
                            { key: "width", label: "B" },
                            { key: "height", label: "H" },
                          ] as const).map(({ key, label }) => (
                            <div key={key}>
                              <label className="text-[8px] font-bold text-slate-400 uppercase">{label}</label>
                              <input type="number" value={Math.round(slot[key])}
                                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateSlot(slot.id, { [key]: Math.max(0, v) }); }}
                                className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-1 tabular-nums focus:ring-2 focus:ring-violet-200"
                                onClick={e => e.stopPropagation()}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {/* ── Text Slots Section ── */}
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 mt-5 pt-4 border-t border-slate-100">Tekstfelter · Side {activePageIdx + 1}</h4>

            {currentTextSlots.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-[10px] text-slate-400 mb-2">Ingen tekstfelter</p>
                <button onClick={addTextSlot} className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-semibold rounded-lg hover:bg-emerald-700">
                  + Tilføj tekstfelt
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {currentTextSlots.map(ts => {
                  const isSel = selectedSlotId === ts.id;
                  return (
                    <div key={ts.id}
                      className={`rounded-xl border p-3 cursor-pointer transition-all ${isSel ? "border-emerald-300 bg-emerald-50/50 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}
                      onClick={() => setSelectedSlotId(ts.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800 truncate">{ts.label}</span>
                        <button onClick={e => { e.stopPropagation(); removeTextSlot(ts.id); }} className="p-1 text-slate-300 hover:text-red-500 rounded" title="Slet">
                          <Ic d="M6 18L18 6M6 6l12 12" className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Placeholder selector */}
                      <select value={ts.placeholder}
                        onChange={e => updateTextSlot(ts.id, { placeholder: e.target.value })}
                        className="w-full text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 mb-2 bg-white focus:ring-2 focus:ring-emerald-200"
                        onClick={e => e.stopPropagation()}>
                        {PLACEHOLDER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
                      </select>

                      {isSel && (
                        <>
                          {/* Font size + weight */}
                          <div className="grid grid-cols-2 gap-1.5 mb-2">
                            <div>
                              <label className="text-[8px] font-bold text-slate-400 uppercase">Størrelse</label>
                              <input type="number" value={ts.fontSize}
                                onChange={e => updateTextSlot(ts.id, { fontSize: Math.max(6, parseInt(e.target.value) || 14) })}
                                className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-1 focus:ring-2 focus:ring-emerald-200"
                                onClick={e => e.stopPropagation()} />
                            </div>
                            <div>
                              <label className="text-[8px] font-bold text-slate-400 uppercase">Vægt</label>
                              <select value={ts.fontWeight}
                                onChange={e => updateTextSlot(ts.id, { fontWeight: e.target.value as "normal" | "bold" })}
                                className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-1 focus:ring-2 focus:ring-emerald-200"
                                onClick={e => e.stopPropagation()}>
                                <option value="normal">Normal</option>
                                <option value="bold">Fed</option>
                              </select>
                            </div>
                          </div>

                          {/* Color + align */}
                          <div className="grid grid-cols-2 gap-1.5 mb-2">
                            <div>
                              <label className="text-[8px] font-bold text-slate-400 uppercase">Farve</label>
                              <input type="color" value={ts.color}
                                onChange={e => updateTextSlot(ts.id, { color: e.target.value })}
                                className="w-full h-7 border border-slate-200 rounded cursor-pointer"
                                onClick={e => e.stopPropagation()} />
                            </div>
                            <div>
                              <label className="text-[8px] font-bold text-slate-400 uppercase">Justering</label>
                              <div className="flex gap-1 mt-0.5">
                                {(["left", "center", "right"] as const).map(a => (
                                  <button key={a} onClick={e => { e.stopPropagation(); updateTextSlot(ts.id, { align: a }); }}
                                    className={`flex-1 px-1.5 py-1 text-[8px] font-bold rounded border ${(ts.align || "left") === a ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-200"}`}>
                                    {a === "left" ? "V" : a === "center" ? "C" : "H"}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Position */}
                          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100">
                            {([
                              { key: "x" as const, label: "X" },
                              { key: "y" as const, label: "Y" },
                              { key: "width" as const, label: "B" },
                              { key: "height" as const, label: "H" },
                            ]).map(({ key, label }) => (
                              <div key={key}>
                                <label className="text-[8px] font-bold text-slate-400 uppercase">{label}</label>
                                <input type="number" value={Math.round(ts[key])}
                                  onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateTextSlot(ts.id, { [key]: Math.max(0, v) }); }}
                                  className="w-full text-[10px] border border-slate-200 rounded px-1.5 py-1 tabular-nums focus:ring-2 focus:ring-emerald-200"
                                  onClick={e => e.stopPropagation()} />
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
