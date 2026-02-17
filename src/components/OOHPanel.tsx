"use client";

import { useState, useEffect, useCallback, useRef, useMemo, DragEvent, MouseEvent as ReactMouseEvent } from "react";
import dynamic from "next/dynamic";
import ConfirmModal from "./ConfirmModal";
import Ic from "./ui/Icon";
import TabBar from "./ui/TabBar";
import SkeletonGrid from "./ui/SkeletonGrid";
import type { Tab } from "./ui/TabBar";

const TemplateEditor = dynamic(() => import("./TemplateEditor"), { ssr: false });
const OOHOutreach = dynamic(() => import("./OOHOutreach"), { ssr: false });

// ── Types ────────────────────────────────────────────────

interface Point2D { x: number; y: number; }

interface FramePlacement {
  x: number; y: number; width: number; height: number;
  quadPoints?: [Point2D, Point2D, Point2D, Point2D];
  label?: string;
}

interface Frame {
  id: string;
  name: string;
  locationAddress?: string;
  locationCity?: string;
  frameType: string;
  frameImageUrl: string;
  placement: FramePlacement;
  placements: FramePlacement[];
  frameWidth: number;
  frameHeight: number;
  dailyTraffic?: number;
  listPrice?: number;
  placementSaved?: boolean;
}

/** Ensure frame.placements is always populated */
function ensurePlacements(f: Frame): FramePlacement[] {
  if (Array.isArray(f.placements) && f.placements.length > 0) return f.placements;
  return [f.placement];
}

/** Placement colors for multi-placement */
const PLACEMENT_COLORS = [
  { fill: "rgba(139,92,246,0.15)", stroke: "rgba(139,92,246,0.7)", bg: "bg-violet-500", text: "text-violet-600", ring: "ring-violet-200" },
  { fill: "rgba(59,130,246,0.15)", stroke: "rgba(59,130,246,0.7)", bg: "bg-blue-500", text: "text-blue-600", ring: "ring-blue-200" },
  { fill: "rgba(16,185,129,0.15)", stroke: "rgba(16,185,129,0.7)", bg: "bg-emerald-500", text: "text-emerald-600", ring: "ring-emerald-200" },
  { fill: "rgba(245,158,11,0.15)", stroke: "rgba(245,158,11,0.7)", bg: "bg-amber-500", text: "text-amber-600", ring: "ring-amber-200" },
  { fill: "rgba(239,68,68,0.15)", stroke: "rgba(239,68,68,0.7)", bg: "bg-red-500", text: "text-red-600", ring: "ring-red-200" },
];

interface Creative {
  id: string;
  filename: string;
  companyName: string;
  campaignName?: string;
  thumbnailUrl?: string;
  tags: string[];
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
}

interface Proposal {
  id: string;
  frameId: string;
  creativeId: string;
  clientEmail: string;
  clientCompany: string;
  clientContactName?: string;
  status: string;
  mockupUrl?: string;
  mockupPreview?: string;
  mockupBuffer?: string;
  slidesUrl?: string;
  pdfUrl?: string;
  processingDurationMs?: number;
  createdAt: string;
}

interface Network {
  id: string;
  name: string;
  description?: string;
  frameIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface PresentationTemplate {
  id: string;
  name: string;
  pdfFileUrl: string;
  pageCount: number;
  pages: { pageIndex: number; thumbnailUrl?: string; imageSlots: { id: string; label: string; x: number; y: number; width: number; height: number; pageWidth: number; pageHeight: number; linkedFrameId?: string; objectFit?: "cover" | "contain" | "fill" }[]; textSlots?: { id: string; label: string; x: number; y: number; width: number; height: number; fontSize: number; fontWeight: "normal" | "bold"; color: string; placeholder: string; align?: "left" | "center" | "right" }[] }[];
  createdAt: string;
  updatedAt: string;
}

type OOHTab = "builder" | "frames" | "creatives" | "proposals" | "oplaeg" | "outreach";

// ── Props ────────────────────────────────────────────────

export interface OOHPanelProps {
  initialFrame?: { address: string; city: string; traffic: number; imageUrl?: string; type: "scaffolding" | "facade" | "gable" | "other" };
  initialClient?: { company: string; contactName: string; email: string };
  onToast?: (msg: string, type: "success" | "error" | "info") => void;
}

// ── Helpers ──────────────────────────────────────────────

function quadBounds(pts: [Point2D, Point2D, Point2D, Point2D]) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x: Math.round(Math.min(...xs)), y: Math.round(Math.min(...ys)), width: Math.round(Math.max(...xs) - Math.min(...xs)), height: Math.round(Math.max(...ys) - Math.min(...ys)) };
}

function ensureQuad(p: FramePlacement): [Point2D, Point2D, Point2D, Point2D] {
  if (p.quadPoints) return p.quadPoints;
  return [
    { x: p.x, y: p.y }, { x: p.x + p.width, y: p.y },
    { x: p.x + p.width, y: p.y + p.height }, { x: p.x, y: p.y + p.height },
  ];
}

// ── Placement Editor (multi-placement + 4-point perspective + fullscreen) ──
// Photopea-lite: small markers, scroll zoom, opacity slider, dark UI, snappy

function PlacementEditor({ frame, creative, onChangePlacements, onSave, saving }: {
  frame: Frame;
  creative?: { thumbnailUrl?: string } | null;
  onChangePlacements: (placements: FramePlacement[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [activeIdx, setActiveIdx] = useState(0);
  const [opacity, setOpacity] = useState(60);
  const [showGrid, setShowGrid] = useState(false);

  const placements = ensurePlacements(frame);
  const activePlacement = placements[activeIdx] || placements[0];
  const quad = ensureQuad(activePlacement);
  const CORNER_LABELS = ["TL", "TR", "BR", "BL"];
  const CORNER_COLORS_SOLID = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"];

  const updateActivePlacement = (updated: FramePlacement) => {
    const newPlacements = [...placements];
    newPlacements[activeIdx] = { ...updated, label: activePlacement.label };
    onChangePlacements(newPlacements);
  };

  const addPlacement = () => {
    const w = frame.frameWidth, h = frame.frameHeight;
    const newP: FramePlacement = {
      x: Math.round(w * 0.3), y: Math.round(h * 0.3),
      width: Math.round(w * 0.4), height: Math.round(h * 0.4),
      label: `Placering ${placements.length + 1}`,
    };
    const newPlacements = [...placements, newP];
    onChangePlacements(newPlacements);
    setActiveIdx(newPlacements.length - 1);
  };

  const removePlacement = (idx: number) => {
    if (placements.length <= 1) return;
    const newPlacements = placements.filter((_, i) => i !== idx);
    onChangePlacements(newPlacements);
    setActiveIdx(Math.min(activeIdx, newPlacements.length - 1));
  };

  const renameActivePlacement = (label: string) => {
    const newPlacements = [...placements];
    newPlacements[activeIdx] = { ...newPlacements[activeIdx], label };
    onChangePlacements(newPlacements);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!fullscreen) return;
      if (e.key === "Escape") setFullscreen(false);
      if (e.key === "+" || e.key === "=") setZoom(z => Math.min(5, +(z + 0.1).toFixed(1)));
      if (e.key === "-" || e.key === "_") setZoom(z => Math.max(0.1, +(z - 0.1).toFixed(1)));
      if (e.key === "0") { setZoom(1); setPan({ x: 0, y: 0 }); }
      if (e.key === "g") setShowGrid(g => !g);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [fullscreen]);

  // Scroll-wheel zoom (both modes)
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.001;
      setZoom(z => {
        const next = Math.max(0.1, Math.min(5, +(z + delta * z).toFixed(2)));
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Middle-click or space+drag pan
  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: globalThis.MouseEvent) => {
      setPan({
        x: panStart.current.panX + (e.clientX - panStart.current.x),
        y: panStart.current.panY + (e.clientY - panStart.current.y),
      });
    };
    const onUp = () => setIsPanning(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [isPanning]);

  const startPan = (e: ReactMouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    }
  };

  const getMouseImageCoords = useCallback((e: { clientX: number; clientY: number }) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * frame.frameWidth, y: ((e.clientY - rect.top) / rect.height) * frame.frameHeight };
  }, [frame.frameWidth, frame.frameHeight]);

  // Drag corner points - uses requestAnimationFrame for snappiness
  useEffect(() => {
    if (draggingIdx === null) return;
    let rafId = 0;
    const onMove = (e: globalThis.MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const pt = getMouseImageCoords(e);
        const clamped = { x: Math.max(0, Math.min(frame.frameWidth, Math.round(pt.x))), y: Math.max(0, Math.min(frame.frameHeight, Math.round(pt.y))) };
        const nq = [...quad] as [Point2D, Point2D, Point2D, Point2D];
        nq[draggingIdx] = clamped;
        updateActivePlacement({ ...quadBounds(nq), quadPoints: nq });
      });
    };
    const onUp = () => { cancelAnimationFrame(rafId); setDraggingIdx(null); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { cancelAnimationFrame(rafId); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingIdx, frame.frameWidth, frame.frameHeight, activeIdx]);

  const pctX = (v: number) => (v / frame.frameWidth) * 100;
  const pctY = (v: number) => (v / frame.frameHeight) * 100;

  const resetToRect = () => {
    const p = activePlacement;
    const defQ: [Point2D, Point2D, Point2D, Point2D] = [
      { x: p.x, y: p.y }, { x: p.x + p.width, y: p.y },
      { x: p.x + p.width, y: p.y + p.height }, { x: p.x, y: p.y + p.height },
    ];
    updateActivePlacement({ ...p, quadPoints: defQ });
  };

  const zoomTo = (level: number) => { setZoom(level); if (level === 1) setPan({ x: 0, y: 0 }); };

  // ── Placement tabs ──
  const placementTabs = (
    <div className="flex items-center gap-1 px-3 py-1.5 bg-[#1e1e2e] border-b border-white/[0.06] flex-wrap">
      {placements.map((p, i) => {
        const color = PLACEMENT_COLORS[i % PLACEMENT_COLORS.length];
        const isActive = i === activeIdx;
        return (
          <button key={i} onClick={() => setActiveIdx(i)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${isActive
              ? "bg-white/[0.12] text-white ring-1 ring-white/[0.15]"
              : "text-white/40 hover:text-white/70 hover:bg-white/[0.05]"}`}>
            <span className={`w-2 h-2 rounded-full ${color.bg} shrink-0`} />
            {p.label || `P${i + 1}`}
            {isActive && placements.length > 1 && (
              <span onClick={(e) => { e.stopPropagation(); removePlacement(i); }}
                className="ml-0.5 w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-red-500/30 text-white/30 hover:text-red-300 transition-colors">
                <Ic d="M6 18L18 6M6 6l12 12" className="w-2 h-2" />
              </span>
            )}
          </button>
        );
      })}
      <button onClick={addPlacement}
        className="flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-semibold text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all">
        <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-2.5 h-2.5" />
      </button>
    </div>
  );

  // ── Canvas ──
  const editorCanvas = (isFs: boolean) => (
    <div ref={canvasWrapRef} className="relative select-none overflow-hidden"
      onMouseDown={startPan}
      style={{ cursor: isPanning ? "grabbing" : draggingIdx !== null ? "grabbing" : "crosshair" }}>
      <div ref={containerRef} className="relative"
        style={{
          transform: isFs ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : undefined,
          transformOrigin: "center center",
          transition: isPanning || draggingIdx !== null ? "none" : "transform 0.12s cubic-bezier(0.16,1,0.3,1)",
          willChange: "transform",
        }}>
        {frame.frameImageUrl ? (
          <img src={frame.frameImageUrl} alt={frame.name}
            className={`${isFs ? "max-h-[calc(100vh-160px)] w-auto mx-auto" : "w-full h-auto"} block`}
            draggable={false}
            style={{ imageRendering: zoom > 2 ? "pixelated" : "auto" }} />
        ) : (
          <div className="aspect-[4/3] bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
            <p className="text-xs text-white/30">Intet billede</p>
          </div>
        )}

        {/* SVG overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <mask id={isFs ? "qm-fs" : "qm"}>
              <rect x="0" y="0" width="100" height="100" fill="white" />
              <polygon points={quad.map(p => `${pctX(p.x)},${pctY(p.y)}`).join(" ")} fill="black" />
            </mask>
          </defs>
          {/* Dim overlay */}
          <rect x="0" y="0" width="100" height="100" fill="rgba(0,0,0,0.4)" mask={`url(#${isFs ? "qm-fs" : "qm"})`} />
          {/* Inactive placements */}
          {placements.map((p, i) => {
            if (i === activeIdx) return null;
            const q = ensureQuad(p);
            const c = PLACEMENT_COLORS[i % PLACEMENT_COLORS.length];
            return <polygon key={i} points={q.map(pt => `${pctX(pt.x)},${pctY(pt.y)}`).join(" ")} fill={c.fill} stroke={c.stroke} strokeWidth="0.15" strokeDasharray="0.8,0.5" opacity="0.5" />;
          })}
          {/* Active placement outline - thin, crisp */}
          {(() => {
            const c = PLACEMENT_COLORS[activeIdx % PLACEMENT_COLORS.length];
            return (
              <>
                <polygon points={quad.map(p => `${pctX(p.x)},${pctY(p.y)}`).join(" ")} fill="none" stroke={c.stroke} strokeWidth="0.2" />
                {/* Edge midpoint markers */}
                {quad.map((pt, i) => {
                  const next = quad[(i + 1) % 4];
                  const mx = (pctX(pt.x) + pctX(next.x)) / 2;
                  const my = (pctY(pt.y) + pctY(next.y)) / 2;
                  return <circle key={`mid-${i}`} cx={mx} cy={my} r="0.3" fill="white" opacity="0.3" />;
                })}
              </>
            );
          })()}
          {/* Grid overlay */}
          {showGrid && [10, 20, 30, 40, 50, 60, 70, 80, 90].map(v => (
            <g key={`grid-${v}`}>
              <line x1="0" y1={`${v}`} x2="100" y2={`${v}`} stroke="rgba(255,255,255,0.06)" strokeWidth="0.06" />
              <line x1={`${v}`} y1="0" x2={`${v}`} y2="100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.06" />
            </g>
          ))}
        </svg>

        {/* Creative preview with adjustable opacity */}
        {creative?.thumbnailUrl && (
          <div className="absolute inset-0 pointer-events-none"
            style={{ clipPath: `polygon(${quad.map(p => `${pctX(p.x)}% ${pctY(p.y)}%`).join(", ")})`, opacity: opacity / 100 }}>
            <img src={creative.thumbnailUrl} alt="" className="w-full h-full object-cover" draggable={false} />
          </div>
        )}

        {/* Corner handles - SMALL, precise */}
        {quad.map((pt, i) => {
          const isDragging = draggingIdx === i;
          const markerSize = isFs ? 7 : 6;
          return (
            <div key={i}
              onMouseDown={(e: ReactMouseEvent) => { e.preventDefault(); e.stopPropagation(); setDraggingIdx(i); }}
              className="absolute z-20"
              style={{
                left: `${pctX(pt.x)}%`, top: `${pctY(pt.y)}%`,
                transform: "translate(-50%, -50%)",
                cursor: "grab",
                padding: isFs ? "8px" : "6px",
              }}>
              {/* Crosshair lines */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="absolute" style={{ width: markerSize * 3, height: 1, backgroundColor: CORNER_COLORS_SOLID[i], opacity: isDragging ? 0.8 : 0.4 }} />
                <div className="absolute" style={{ width: 1, height: markerSize * 3, backgroundColor: CORNER_COLORS_SOLID[i], opacity: isDragging ? 0.8 : 0.4 }} />
              </div>
              {/* Center dot */}
              <div className="flex items-center justify-center" style={{ width: markerSize * 2, height: markerSize * 2 }}>
                <div style={{
                  width: isDragging ? markerSize + 2 : markerSize,
                  height: isDragging ? markerSize + 2 : markerSize,
                  borderRadius: "50%",
                  backgroundColor: CORNER_COLORS_SOLID[i],
                  border: "1.5px solid white",
                  boxShadow: isDragging ? `0 0 0 2px ${CORNER_COLORS_SOLID[i]}40, 0 1px 4px rgba(0,0,0,0.5)` : "0 1px 3px rgba(0,0,0,0.4)",
                  transition: "width 0.1s, height 0.1s, box-shadow 0.1s",
                }} />
              </div>
              {/* Label - only show on hover/drag or in fullscreen */}
              {(isFs || isDragging) && (
                <div className="absolute left-1/2 -translate-x-1/2 -top-4 text-[7px] font-bold text-white/80 bg-black/70 px-1 py-px rounded leading-none whitespace-nowrap" style={{ pointerEvents: "none" }}>
                  {CORNER_LABELS[i]}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Toolbar (Photopea-style) ──
  const toolbar = (isFs: boolean) => (
    <div className={`flex items-center gap-2 px-3 py-1.5 ${isFs ? "bg-[#1e1e2e] border-b border-white/[0.06]" : "bg-slate-900 border-b border-slate-700/50"}`}>
      {/* Zoom controls */}
      <div className="flex items-center gap-0.5 bg-white/[0.06] rounded-md px-1 py-0.5">
        <button onClick={() => zoomTo(Math.max(0.1, +(zoom - 0.1).toFixed(1)))} className="w-5 h-5 flex items-center justify-center text-white/50 hover:text-white rounded hover:bg-white/[0.08]">
          <Ic d="M19.5 12h-15" className="w-3 h-3" />
        </button>
        <button onClick={() => zoomTo(1)} className="px-1.5 py-0.5 text-[9px] font-mono text-white/60 hover:text-white hover:bg-white/[0.08] rounded min-w-[36px] text-center">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => zoomTo(Math.min(5, +(zoom + 0.1).toFixed(1)))} className="w-5 h-5 flex items-center justify-center text-white/50 hover:text-white rounded hover:bg-white/[0.08]">
          <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3 h-3" />
        </button>
      </div>
      <div className="w-px h-4 bg-white/[0.08]" />
      {/* Quick zoom presets */}
      {[0.5, 1, 1.5, 2].map(z => (
        <button key={z} onClick={() => zoomTo(z)}
          className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-all ${Math.abs(zoom - z) < 0.05 ? "bg-white/[0.12] text-white" : "text-white/35 hover:text-white/70 hover:bg-white/[0.05]"}`}>
          {z * 100}%
        </button>
      ))}
      <div className="w-px h-4 bg-white/[0.08]" />
      {/* Opacity slider */}
      {creative?.thumbnailUrl && (
        <div className="flex items-center gap-1.5">
          <Ic d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" className="w-3 h-3 text-white/40" />
          <input type="range" min="0" max="100" value={opacity}
            onChange={(e) => setOpacity(parseInt(e.target.value))}
            className="w-16 h-1 appearance-none bg-white/[0.12] rounded-full cursor-pointer accent-violet-500"
            style={{ accentColor: "#8b5cf6" }} />
          <span className="text-[9px] font-mono text-white/40 w-6">{opacity}%</span>
        </div>
      )}
      <div className="w-px h-4 bg-white/[0.08]" />
      {/* Grid toggle */}
      <button onClick={() => setShowGrid(!showGrid)}
        className={`w-5 h-5 flex items-center justify-center rounded transition-all ${showGrid ? "bg-white/[0.12] text-white" : "text-white/35 hover:text-white/60"}`}
        title="Grid (G)">
        <Ic d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" className="w-3 h-3" />
      </button>
      {/* Reset */}
      <button onClick={resetToRect} className="text-[9px] font-medium text-white/35 hover:text-white/70 px-1.5 py-0.5 rounded hover:bg-white/[0.05]">Reset</button>
      {/* Spacer */}
      <div className="flex-1" />
      {/* Dimensions */}
      <span className="text-[9px] font-mono text-white/25">{frame.frameWidth}x{frame.frameHeight}</span>
    </div>
  );

  // ── Coord bar (compact) ──
  const coordBar = (isFs: boolean) => (
    <div className={`px-3 py-2 ${isFs ? "bg-[#1e1e2e] border-t border-white/[0.06]" : "bg-slate-900 border-t border-slate-700/50"}`}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${PLACEMENT_COLORS[activeIdx % PLACEMENT_COLORS.length].bg}`} />
          <input type="text" value={activePlacement.label || `Placering ${activeIdx + 1}`}
            onChange={(e) => renameActivePlacement(e.target.value)}
            className="text-[9px] font-bold uppercase tracking-wide border-none bg-transparent p-0 focus:ring-0 text-white/50 focus:text-white w-20" />
        </div>
        <div className="flex items-center gap-2 flex-1">
          {quad.map((pt, i) => (
            <div key={i} className="flex items-center gap-1">
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: CORNER_COLORS_SOLID[i], flexShrink: 0 }} />
              <input type="number" value={Math.round(pt.x)} onChange={(e) => { const nq = [...quad] as [Point2D, Point2D, Point2D, Point2D]; nq[i] = { ...nq[i], x: parseInt(e.target.value) || 0 }; updateActivePlacement({ ...quadBounds(nq), quadPoints: nq }); }}
                className="w-10 px-1 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded text-[9px] font-mono text-white/70" />
              <input type="number" value={Math.round(pt.y)} onChange={(e) => { const nq = [...quad] as [Point2D, Point2D, Point2D, Point2D]; nq[i] = { ...nq[i], y: parseInt(e.target.value) || 0 }; updateActivePlacement({ ...quadBounds(nq), quadPoints: nq }); }}
                className="w-10 px-1 py-0.5 bg-white/[0.06] border border-white/[0.08] rounded text-[9px] font-mono text-white/70" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ═══ FULLSCREEN MODE ═══
  if (fullscreen) {
    return (
      <>
        <div className="bg-slate-100 rounded-2xl border border-slate-200/60 p-5 text-center">
          <p className="text-xs font-semibold text-slate-600">Fullscreen Editor aktiv</p>
          <p className="text-[10px] text-slate-400 mt-1">Tryk <kbd className="px-1 py-0.5 bg-slate-200 rounded text-[9px] font-mono">Esc</kbd> for at lukke</p>
        </div>
        <div className="fixed inset-0 z-[9999] bg-[#121218] flex flex-col" style={{ isolation: "isolate" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 bg-[#1e1e2e] border-b border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Ic d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159" className="w-3 h-3 text-white" />
              </div>
              <div>
                <h2 className="text-[11px] font-bold text-white leading-none">{frame.name}</h2>
                <p className="text-[9px] text-white/30 mt-0.5">{frame.frameWidth}x{frame.frameHeight}px</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onSave} disabled={saving} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-md disabled:opacity-40 flex items-center gap-1.5 transition-colors">
                {saving ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" /> : <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3" />}Gem
              </button>
              <button onClick={() => setFullscreen(false)} className="px-3 py-1.5 bg-white/[0.08] hover:bg-white/[0.12] text-white/70 text-[10px] font-semibold rounded-md flex items-center gap-1.5 transition-colors">
                <Ic d="M6 18L18 6M6 6l12 12" className="w-3 h-3" />Luk
              </button>
            </div>
          </div>
          {toolbar(true)}
          {placementTabs}
          <div className="flex-1 overflow-hidden flex items-center justify-center bg-[#0a0a0f]">{editorCanvas(true)}</div>
          {coordBar(true)}
        </div>
      </>
    );
  }

  // ═══ INLINE MODE (dark, app-like) ═══
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-900">
      <div className="px-3 py-2 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-white/70 uppercase tracking-wide">Placement Editor</span>
          <span className="text-[9px] text-white/30">{placements.length} placering{placements.length > 1 ? "er" : ""}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setFullscreen(true)} className="px-2 py-1 bg-white/[0.06] hover:bg-white/[0.12] text-white/60 text-[10px] font-semibold rounded-md flex items-center gap-1 transition-colors">
            <Ic d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" className="w-3 h-3" />Expand
          </button>
          <button onClick={onSave} disabled={saving} className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-md disabled:opacity-40 flex items-center gap-1 transition-colors">
            {saving ? <div className="animate-spin rounded-full h-2.5 w-2.5 border-2 border-white/30 border-t-white" /> : <Ic d="M4.5 12.75l6 6 9-13.5" className="w-2.5 h-2.5" />}Gem
          </button>
        </div>
      </div>
      {toolbar(false)}
      {placementTabs}
      {editorCanvas(false)}
      {coordBar(false)}
    </div>
  );
}

// ── Frame Edit Modal ────────────────────────────────────

function FrameEditModal({ frame, onSave, onClose }: { frame: Frame; onSave: (updates: Partial<Frame>) => void; onClose: () => void }) {
  const [name, setName] = useState(frame.name);
  const [address, setAddress] = useState(frame.locationAddress || "");
  const [city, setCity] = useState(frame.locationCity || "");
  const [type, setType] = useState(frame.frameType);
  const [traffic, setTraffic] = useState(frame.dailyTraffic?.toString() || "");
  const [price, setPrice] = useState(frame.listPrice?.toString() || "");

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Rediger Frame</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><Ic d="M6 18L18 6M6 6l12 12" className="w-5 h-5 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Navn *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Adresse</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">By</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Type</label>
              <select value={type} onChange={e => setType(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-violet-300 bg-white">
                <option value="scaffolding">Stillads</option>
                <option value="facade">Facade</option>
                <option value="gable">Gavl</option>
                <option value="other">Andet</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Trafik/dag</label>
              <input type="number" value={traffic} onChange={e => setTraffic(e.target.value)} placeholder="fx 45000" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wide">Pris DKK/md</label>
              <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="fx 85000" className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-xl">Annuller</button>
          <button onClick={() => onSave({ name, locationAddress: address || undefined, locationCity: city || undefined, frameType: type, dailyTraffic: traffic ? parseInt(traffic) : undefined, listPrice: price ? parseInt(price) : undefined })} className="px-6 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl shadow-sm">Gem</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────

export default function OOHPanel({ initialFrame, initialClient, onToast }: OOHPanelProps) {
  const [tab, setTab] = useState<OOHTab>("oplaeg");
  const [frames, setFrames] = useState<Frame[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);

  const toast = useCallback((msg: string, type: "success" | "error" | "info" = "info") => { if (onToast) onToast(msg, type); }, [onToast]);

  // Builder state
  const [step, setStep] = useState<"frame" | "creative" | "result">("frame");
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [selectedCreative, setSelectedCreative] = useState<Creative | null>(null);
  // Multi-placement creative assignments: placementIndex -> creativeId
  const [creativeAssignments, setCreativeAssignments] = useState<Record<number, string>>({});
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null);
  const [savingPlacement, setSavingPlacement] = useState(false);

  // Client info
  const [clientEmail, setClientEmail] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientContact, setClientContact] = useState("");

  // Generation
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genMessage, setGenMessage] = useState("");
  const [genResult, setGenResult] = useState<{
    id: string; status: string; mockupPreview?: string; mockupUrl?: string; slidesUrl?: string; pdfUrl?: string; processingDurationMs?: number;
  } | null>(null);

  // Downloads
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingMockup, setDownloadingMockup] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [creativeSearch, setCreativeSearch] = useState("");

  // Frame editing
  const [editModalFrame, setEditModalFrame] = useState<Frame | null>(null);

  // Networks & multi-select
  const [networks, setNetworks] = useState<Network[]>([]);
  const [selectedFrameIds, setSelectedFrameIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [batchResults, setBatchResults] = useState<{ frameId: string; frameName: string; success: boolean; preview?: string; error?: string }[]>([]);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [networkName, setNetworkName] = useState("");
  const [showNetworkCreate, setShowNetworkCreate] = useState(false);

  // Presentation templates (Oplæg)
  const [presTemplates, setPresTemplates] = useState<PresentationTemplate[]>([]);
  const [activePresTemplate, setActivePresTemplate] = useState<PresentationTemplate | null>(null);
  const [presEditorOpen, setPresEditorOpen] = useState(false);
  const presSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const presSavePendingRef = useRef<{ id: string; pages: PresentationTemplate["pages"] } | null>(null);
  const [presGenerating, setPresGenerating] = useState(false);
  const [presCreativeId, setPresCreativeId] = useState<string | null>(null);
  // Per-placement creative overrides for Oplæg: frameId -> { placementIdx -> creativeId }
  // Using frameId as key so all slots linked to the same frame share the same assignments
  const [presPlacementOverrides, setPresPlacementOverrides] = useState<Record<string, Record<number, string>>>({});
  const [presUseSameCreative, setPresUseSameCreative] = useState(true);
  // Text placeholder values for presentation generation
  const [presTextValues, setPresTextValues] = useState<Record<string, string>>({});
  const [uploadingTemplate, setUploadingTemplate] = useState(false);

  // Creative naming modal – stores pending upload until user names it
  const [pendingCreativeUpload, setPendingCreativeUpload] = useState<{
    file: File;
    context: "builder" | "creatives-tab" | "oplaeg" | "oplaeg-inline";
    /** For oplaeg-inline: template to auto-generate for (single-placement only) */
    tpl?: PresentationTemplate;
  } | null>(null);
  const [creativeNameInput, setCreativeNameInput] = useState("");

  // Loading state
  const [initialLoading, setInitialLoading] = useState(true);

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    detail?: string;
    variant?: "danger" | "warning" | "info";
    confirmLabel?: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const showConfirm = useCallback((opts: Omit<typeof confirmModal, "open">) => {
    setConfirmModal({ ...opts, open: true });
  }, []);
  const closeConfirm = useCallback(() => setConfirmModal(prev => ({ ...prev, open: false })), []);

  // Batch progress detail
  const [batchCurrentFrame, setBatchCurrentFrame] = useState<string>("");

  // ── Initial data from props ───────────────────────────
  useEffect(() => {
    if (initialClient) { setClientCompany(initialClient.company); setClientContact(initialClient.contactName); setClientEmail(initialClient.email); setTab("builder"); }
  }, [initialClient]);

  useEffect(() => {
    if (initialFrame) {
      (async () => {
        try {
          const res = await fetch("/api/ooh/frames", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: initialFrame.address, locationAddress: initialFrame.address, locationCity: initialFrame.city, frameType: initialFrame.type || "scaffolding", frameImageUrl: initialFrame.imageUrl || "", frameWidth: 800, frameHeight: 600, dailyTraffic: initialFrame.traffic, placement: { x: 80, y: 60, width: 640, height: 480, label: "Front" }, placements: [{ x: 80, y: 60, width: 640, height: 480, label: "Front" }] }) });
          const frame = await res.json();
          setFrames(prev => [frame, ...prev]); setSelectedFrame(frame); setEditingFrameId(frame.id); setStep("frame"); setTab("builder"); toast("Frame oprettet!", "success");
        } catch { toast("Kunne ikke oprette frame", "error"); }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFrame]);

  // ── Fetch data ────────────────────────────────────────
  const fetchFrames = useCallback(async () => {
    try {
      const res = await fetch("/api/ooh/frames");
      if (!res.ok) { console.error("[OOH] fetchFrames", res.status); return; }
      const data = await res.json(); setFrames(data.frames || []);
    } catch (err) { console.error("[OOH] fetchFrames", err); }
  }, []);
  const fetchCreatives = useCallback(async () => {
    try {
      const q = creativeSearch ? `?q=${encodeURIComponent(creativeSearch)}` : "";
      const res = await fetch(`/api/ooh/creatives${q}`);
      if (!res.ok) { console.error("[OOH] fetchCreatives", res.status); return; }
      const data = await res.json(); setCreatives(data.items || []);
    } catch (err) { console.error("[OOH] fetchCreatives", err); }
  }, [creativeSearch]);
  const fetchProposals = useCallback(async () => {
    try {
      const res = await fetch("/api/ooh/proposals");
      if (!res.ok) { console.error("[OOH] fetchProposals", res.status); return; }
      const data = await res.json(); setProposals(data.items || []);
    } catch (err) { console.error("[OOH] fetchProposals", err); }
  }, []);
  const fetchNetworks = useCallback(async () => {
    try {
      const res = await fetch("/api/ooh/networks");
      if (!res.ok) { console.error("[OOH] fetchNetworks", res.status); return; }
      const data = await res.json(); setNetworks(data.networks || []);
    } catch (err) { console.error("[OOH] fetchNetworks", err); }
  }, []);
  const fetchPresTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/ooh/presentation-templates");
      if (!res.ok) { console.error("[OOH] fetchPresTemplates", res.status); return; }
      const data = await res.json(); setPresTemplates(Array.isArray(data) ? data : []);
    } catch (err) { console.error("[OOH] fetchPresTemplates", err); }
  }, []);

  useEffect(() => {
    setInitialLoading(true);
    Promise.all([fetchFrames(), fetchCreatives(), fetchProposals(), fetchNetworks(), fetchPresTemplates()])
      .finally(() => setInitialLoading(false));
  }, [fetchFrames, fetchCreatives, fetchProposals, fetchNetworks, fetchPresTemplates]);
  useEffect(() => { const t = setTimeout(fetchCreatives, 300); return () => clearTimeout(t); }, [creativeSearch, fetchCreatives]);

  useEffect(() => () => { if (presSaveTimeoutRef.current) clearTimeout(presSaveTimeoutRef.current); }, []);

  // ── Save frame placement ──────────────────────────────
  const saveFramePlacement = async (frame: Frame) => {
    setSavingPlacement(true);
    try {
      const placements = ensurePlacements(frame);
      const res = await fetch("/api/ooh/frames", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: frame.id, placement: placements[0], placements }) });
      if (res.ok) {
        const updated = await res.json();
        setFrames(prev => prev.map(f => f.id === updated.id ? { ...updated, placementSaved: true } : f));
        if (selectedFrame?.id === frame.id) setSelectedFrame({ ...updated, placementSaved: true });
        toast("Placement gemt!", "success"); setEditingFrameId(null);
      } else { toast("Fejl ved gem", "error"); }
    } catch { toast("Netvaerksfejl", "error"); }
    finally { setSavingPlacement(false); }
  };

  // ── Save frame metadata ───────────────────────────────
  const saveFrameMetadata = async (frameId: string, updates: Partial<Frame>) => {
    try {
      const res = await fetch("/api/ooh/frames", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: frameId, ...updates }) });
      if (res.ok) {
        const updated = await res.json();
        setFrames(prev => prev.map(f => f.id === updated.id ? updated : f));
        if (selectedFrame?.id === updated.id) setSelectedFrame(updated);
        toast("Frame opdateret!", "success");
      }
    } catch { toast("Fejl", "error"); }
    setEditModalFrame(null);
  };

  // ── Delete frame ─────────────────────────────────────
  const removeFrame = (frameId: string) => {
    const frame = frames.find(f => f.id === frameId);
    showConfirm({
      title: "Slet frame",
      message: "Er du sikker på du vil slette denne frame?",
      detail: frame ? `${frame.name} – ${frame.locationCity || "Ingen by"}` : undefined,
      variant: "danger",
      confirmLabel: "Slet",
      onConfirm: async () => {
        closeConfirm();
        try {
          const res = await fetch(`/api/ooh/frames?id=${frameId}`, { method: "DELETE" });
          if (res.ok) {
            setFrames(prev => prev.filter(f => f.id !== frameId));
            if (selectedFrame?.id === frameId) setSelectedFrame(null);
            setSelectedFrameIds(prev => { const n = new Set(prev); n.delete(frameId); return n; });
            toast("Frame slettet", "success");
          } else { toast("Kunne ikke slette frame", "error"); }
        } catch { toast("Netværksfejl", "error"); }
      },
    });
  };

  // ── Delete creative ───────────────────────────────────
  const removeCreative = (creativeId: string) => {
    const creative = creatives.find(c => c.id === creativeId);
    showConfirm({
      title: "Slet creative",
      message: "Er du sikker på du vil slette dette creative?",
      detail: creative ? `${creative.companyName} (${creative.filename})` : undefined,
      variant: "danger",
      confirmLabel: "Slet",
      onConfirm: async () => {
        closeConfirm();
        try {
          const res = await fetch(`/api/ooh/creatives?id=${creativeId}`, { method: "DELETE" });
          if (res.ok) {
            setCreatives(prev => prev.filter(c => c.id !== creativeId));
            if (selectedCreative?.id === creativeId) setSelectedCreative(null);
            toast("Creative slettet", "success");
          } else { toast("Kunne ikke slette", "error"); }
        } catch { toast("Netværksfejl", "error"); }
      },
    });
  };

  // ── Multi-select helpers ─────────────────────────────
  const toggleFrameSelect = (id: string) => {
    setSelectedFrameIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllFrames = () => setSelectedFrameIds(new Set(frames.map(f => f.id)));
  const deselectAllFrames = () => setSelectedFrameIds(new Set());

  // ── Network management ───────────────────────────────
  const createNetwork = async (name: string, frameIds: string[]) => {
    try {
      const res = await fetch("/api/ooh/networks", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, frameIds }) });
      if (res.ok) { fetchNetworks(); toast(`Netværk "${name}" oprettet med ${frameIds.length} frames`, "success"); setShowNetworkCreate(false); setNetworkName(""); }
    } catch { toast("Fejl ved oprettelse", "error"); }
  };

  const deleteNetworkById = async (id: string) => {
    try {
      const res = await fetch(`/api/ooh/networks?id=${id}`, { method: "DELETE" });
      if (res.ok) { fetchNetworks(); toast("Netværk slettet", "success"); }
    } catch { toast("Fejl", "error"); }
  };

  const applyNetwork = (network: Network) => {
    setSelectedFrameIds(new Set(network.frameIds));
    setBatchMode(true);
    toast(`Netværk "${network.name}" valgt (${network.frameIds.length} frames)`, "info");
  };

  // ── Batch mockup generation ──────────────────────────
  const generateBatchMockups = async (creative: Creative) => {
    const ids = [...selectedFrameIds];
    if (ids.length === 0) { toast("Vælg mindst én frame", "error"); return; }
    setBatchGenerating(true); setBatchProgress(0); setBatchResults([]);
    try {
      const res = await fetch("/api/ooh/batch-mockup", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameIds: ids, creativeId: creative.id, format: "jpg" }) });
      const reader = res.body?.getReader(); if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.progress !== undefined) setBatchProgress(ev.progress);
            if (ev.done && ev.results) {
              // Final: load individual results with previews
            }
          } catch { /* */ }
        }
      }
      // Download each mockup individually after batch completes
      const finalResults: typeof batchResults = [];
      for (let i = 0; i < ids.length; i++) {
        const fid = ids[i];
        const frame = frames.find(f => f.id === fid);
        setBatchCurrentFrame(frame?.name || `Frame ${i + 1}`);
        setBatchProgress(Math.round(((i + 0.5) / ids.length) * 100));
        try {
          const dlRes = await fetch("/api/ooh/download-mockup", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frameId: fid, creativeId: creative.id, format: "jpg", framePlacements: frame ? ensurePlacements(frame) : undefined }) });
          if (dlRes.ok) {
            const blob = await dlRes.blob();
            const preview = URL.createObjectURL(blob);
            finalResults.push({ frameId: fid, frameName: frame?.name || "?", success: true, preview });
          } else {
            finalResults.push({ frameId: fid, frameName: frame?.name || "?", success: false, error: "Download failed" });
          }
        } catch {
          finalResults.push({ frameId: fid, frameName: frame?.name || "?", success: false, error: "Error" });
        }
      }
      setBatchResults(finalResults);
      toast(`${finalResults.filter(r => r.success).length}/${ids.length} mockups genereret!`, "success");
    } catch (e) { toast("Batch generering fejlede", "error"); }
    finally { setBatchGenerating(false); setBatchCurrentFrame(""); }
  };

  const downloadAllBatchResults = () => {
    batchResults.filter(r => r.success && r.preview).forEach((r, i) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = r.preview!;
        a.download = `Mockup-${r.frameName.replace(/\s+/g, "-")}.jpg`;
        document.body.appendChild(a); a.click(); a.remove();
      }, i * 300);
    });
  };

  // Cleanup batch result object URLs on unmount
  useEffect(() => {
    return () => {
      batchResults.forEach(r => { if (r.preview) URL.revokeObjectURL(r.preview); });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Upload ────────────────────────────────────────────

  // Shared helper: upload a file and create a creative record, returns the creative object
  // Includes duplicate detection: if a creative with same filename + fileSize exists, reuse it
  const uploadAndCreateCreative = useCallback(async (file: File, name?: string): Promise<Creative> => {
    // Check for duplicate: same filename and file size
    const existing = creatives.find(c => c.filename === file.name && c.fileSize === file.size);
    if (existing) {
      return existing; // Reuse existing creative – no re-upload
    }

    const formData = new FormData(); formData.append("file", file); formData.append("type", "creative");
    const res = await fetch("/api/ooh/upload", { method: "POST", body: formData });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Upload fejlede"); }
    const data = await res.json();
    const displayName = name?.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    const cRes = await fetch("/api/ooh/creatives", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, companyName: displayName, thumbnailUrl: data.url, mimeType: data.mimeType, width: data.width, height: data.height, fileSize: data.size, tags: [] }) });
    if (!cRes.ok) { const err = await cRes.json().catch(() => ({})); throw new Error(err.error || "Kunne ikke oprette creative"); }
    return cRes.json();
  }, [clientCompany, creatives]);

  const handleDrop = async (e: DragEvent, type: "frame" | "creative") => { e.preventDefault(); setDragOver(null); const file = e.dataTransfer.files[0]; if (file?.type.startsWith("image/")) await uploadFile(file, type); };
  const handleDragOver = (e: DragEvent, zone: string) => { e.preventDefault(); setDragOver(zone); };

  const uploadFile = async (file: File, type: "frame" | "creative") => {
    if (type === "creative") {
      // Check for duplicate first
      const existingCreative = creatives.find(c => c.filename === file.name && c.fileSize === file.size);
      if (existingCreative) {
        setSelectedCreative(existingCreative); toast("Creative findes allerede – genbruger eksisterende", "info");
        return;
      }
      // Open naming modal instead of uploading directly
      setPendingCreativeUpload({ file, context: tab === "creatives" ? "creatives-tab" : "builder" });
      setCreativeNameInput(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
      return;
    }
    setUploading(true);
    const formData = new FormData(); formData.append("file", file); formData.append("type", type);
    try {
      const res = await fetch("/api/ooh/upload", { method: "POST", body: formData }); const data = await res.json();
      const fRes = await fetch("/api/ooh/frames", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "), frameImageUrl: data.url, frameWidth: data.width || 800, frameHeight: data.height || 600,
          placement: { x: Math.round((data.width || 800) * 0.1), y: Math.round((data.height || 600) * 0.1), width: Math.round((data.width || 800) * 0.8), height: Math.round((data.height || 600) * 0.8), label: "Front" },
          placements: [{ x: Math.round((data.width || 800) * 0.1), y: Math.round((data.height || 600) * 0.1), width: Math.round((data.width || 800) * 0.8), height: Math.round((data.height || 600) * 0.8), label: "Front" }] }) });
      const frame = await fRes.json(); setFrames(prev => [frame, ...prev]); setSelectedFrame(frame); setEditingFrameId(frame.id); toast("Frame uploadet!", "success");
    } catch (e) { toast("Upload fejlede", "error"); }
    finally { setUploading(false); }
  };

  // Handler for confirming the creative name and completing the upload
  const confirmCreativeUpload = async () => {
    if (!pendingCreativeUpload) return;
    const { file, context, tpl } = pendingCreativeUpload;
    const name = creativeNameInput.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    setPendingCreativeUpload(null);
    setCreativeNameInput("");
    setUploading(true);
    try {
      const creative = await uploadAndCreateCreative(file, name);
      setCreatives(prev => prev.some(c => c.id === creative.id) ? prev : [creative, ...prev]);

      if (context === "builder") {
        setSelectedCreative(creative);
        toast("Creative uploadet!", "success");
      } else if (context === "creatives-tab") {
        setSelectedCreative(creative);
        toast("Creative uploadet!", "success");
      } else if (context === "oplaeg-inline" && tpl) {
        // Check for multi-placement
        const hasMultiPlacement = tpl.pages.some(pg =>
          pg.imageSlots.some(sl => {
            const f = frames.find(fr => fr.id === sl.linkedFrameId);
            return f && ensurePlacements(f).length > 1;
          })
        );
        setActivePresTemplate(tpl);
        setPresCreativeId(creative.id);
        if (hasMultiPlacement) {
          setPresUseSameCreative(false);
          setPresPlacementOverrides({});
          toast("Creative uploadet! Vælg nu creatives for hver placering.", "success");
        } else {
          // Auto-generate for single-placement
          setPresGenerating(true);
          toast("Genererer oplæg...", "info");
          try {
            const slotAssignments: Record<string, { frameId: string; creativeId: string }> = {};
            for (const page of tpl.pages) {
              for (const slot of page.imageSlots) {
                if (slot.linkedFrameId) {
                  slotAssignments[slot.id] = { frameId: slot.linkedFrameId, creativeId: creative.id };
                }
              }
            }
            if (Object.keys(slotAssignments).length === 0) {
              toast("Ingen billedpladser er linket til frames", "error");
              return;
            }
            const res = await fetch("/api/ooh/generate-presentation", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ templateId: tpl.id, slotAssignments }),
            });
            const contentType = res.headers.get("content-type") || "";
            if (!res.ok || contentType.includes("application/json")) {
              const err = await res.json().catch(() => ({ error: "Generation failed" }));
              throw new Error(err.error || "Generation failed");
            }
            const blob = await res.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a"); a.style.display = "none"; a.href = downloadUrl;
            a.download = `Oplaeg-${tpl.name.replace(/\s+/g, "-")}.pdf`;
            document.body.appendChild(a); a.click();
            setTimeout(() => { window.URL.revokeObjectURL(downloadUrl); document.body.removeChild(a); }, 200);
            toast("Oplæg genereret og downloadet!", "success");
          } catch (err) {
            toast(err instanceof Error ? err.message : "Fejl ved generering", "error");
          } finally {
            setPresGenerating(false);
            setActivePresTemplate(null);
          }
        }
      } else if (context === "oplaeg") {
        setPresCreativeId(creative.id);
        toast("Creative uploadet!", "success");
      }
    } catch (e) { toast(e instanceof Error ? e.message : "Upload fejlede", "error"); }
    finally { setUploading(false); }
  };

  // ── Generate mockup ───────────────────────────────────
  // Accept optional overrides to avoid React setState race condition
  const generateProposal = async (overrideCreative?: Creative) => {
    const frame = selectedFrame;
    const creative = overrideCreative || selectedCreative;
    if (!frame || !creative) return;
    setGenerating(true); setGenProgress(0); setGenMessage("Starter..."); setGenResult(null); setStep("result");
    try {
      const res = await fetch("/api/ooh/proposals", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameId: frame.id, creativeId: creative.id, creativeAssignments: Object.keys(creativeAssignments).length > 0 ? creativeAssignments : undefined, framePlacements: ensurePlacements(frame), clientEmail: clientEmail || "draft@placeholder.com", clientCompany: clientCompany || creative.companyName, clientContactName: clientContact || undefined }) });
      const reader = res.body?.getReader(); const decoder = new TextDecoder(); if (!reader) return;
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) { if (!line.startsWith("data: ")) continue; try { const ev = JSON.parse(line.slice(6)); if (ev.progress !== undefined) setGenProgress(ev.progress); if (ev.message) setGenMessage(ev.message); if (ev.proposal) setGenResult(ev.proposal); } catch { /* */ } }
      }
      toast("Mockup genereret!", "success");
    } catch { toast("Generering fejlede", "error"); }
    finally { setGenerating(false); fetchProposals(); }
  };

  // ── Download mockup ───────────────────────────────────
  const downloadMockup = async (format: "png" | "jpg") => {
    if (!selectedFrame || !selectedCreative) return;
    setDownloadingMockup(true);
    try {
      const res = await fetch("/api/ooh/download-mockup", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameId: selectedFrame.id, creativeId: selectedCreative.id, creativeAssignments: Object.keys(creativeAssignments).length > 0 ? creativeAssignments : undefined, framePlacements: ensurePlacements(selectedFrame), format }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Mockup-${selectedFrame.name}.${format}`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast(`Mockup downloadet som ${format.toUpperCase()}`, "success");
    } catch (e) { toast(e instanceof Error ? e.message : "Download fejlede", "error"); }
    finally { setDownloadingMockup(false); }
  };

  // ── Generate & download PDF ───────────────────────────
  const downloadPdf = async () => {
    if (!selectedFrame || !selectedCreative) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch("/api/ooh/generate-pdf", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameId: selectedFrame.id, creativeId: selectedCreative.id, clientCompany: clientCompany || selectedCreative.companyName, clientContactName: clientContact || undefined, clientEmail: clientEmail || "" }) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `Proposal-${clientCompany || "Draft"}-${selectedFrame.name}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast("PDF downloadet!", "success");
    } catch (e) { toast(e instanceof Error ? e.message : "PDF generering fejlede", "error"); }
    finally { setDownloadingPdf(false); }
  };

  // ── Send email ────────────────────────────────────────
  const sendEmail = async () => {
    if (!genResult?.id || !clientEmail) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`/api/ooh/proposals?action=send&id=${genResult.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (data.success) { toast("Email sendt!", "success"); fetchProposals(); }
      else { toast("Fejl: " + (data.error || "Ukendt"), "error"); }
    } catch { toast("Email fejlede", "error"); }
    finally { setSendingEmail(false); }
  };

  // ── Reset builder ─────────────────────────────────────
  const resetBuilder = () => {
    setStep("frame"); setSelectedFrame(null); setSelectedCreative(null); setGenResult(null);
    setClientEmail(""); setClientCompany(""); setClientContact(""); setEditingFrameId(null);
    setGenProgress(0); setGenMessage(""); setCreativeAssignments({});
  };

  // ── Tab badges ────────────────────────────────────────
  const TABS: Tab<OOHTab>[] = useMemo(() => [
    { id: "builder", label: "Builder", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
    { id: "frames", label: "Frames", count: frames.length, icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V4.5A1.5 1.5 0 0020.25 3H3.75A1.5 1.5 0 002.25 4.5v15A1.5 1.5 0 003.75 21z" },
    { id: "creatives", label: "Creatives", count: creatives.length, icon: "M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128z" },
    { id: "proposals", label: "Historik", count: proposals.length, icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
    { id: "oplaeg", label: "Oplæg", count: presTemplates.length, icon: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" },
    { id: "outreach", label: "Outreach", icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" },
  ], [frames.length, creatives.length, proposals.length, presTemplates.length]);

  return (
    <div className="animate-fade-in">
      {/* Tabs */}
      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* ═══ BUILDER ═══ */}
      {tab === "builder" && (
        <div>
          {/* Mini progress bar */}
          <div className="flex items-center gap-2 mb-6">
            {(["frame", "creative", "result"] as const).map((s, i) => {
              const labels = ["1. Frame", "2. Creative", "3. Resultat"];
              const isActive = step === s;
              const isDone = (s === "frame" && !!selectedFrame) || (s === "creative" && !!selectedCreative) || (s === "result" && !!genResult);
              return (
                <div key={s} className="flex items-center flex-1">
                  <button onClick={() => { if (isDone || isActive) setStep(s); }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all w-full ${isActive ? "bg-violet-50 border border-violet-300 text-violet-700" : isDone ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-white border border-slate-100 text-slate-400"}`}>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${isDone ? "bg-emerald-500 text-white" : isActive ? "bg-violet-500 text-white" : "bg-slate-100 text-slate-400"}`}>
                      {isDone && !isActive ? <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3" /> : i + 1}
                    </div>
                    {labels[i]}
                  </button>
                  {i < 2 && <div className={`w-8 h-0.5 mx-1 rounded-full ${isDone ? "bg-emerald-300" : "bg-slate-100"}`} />}
                </div>
              );
            })}
          </div>

          {/* STEP: FRAME */}
          {step === "frame" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-slate-500">Vælg en frame med gemt placement, eller upload ny</p>
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-sm">
                  <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />Upload<input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], "frame")} />
                </label>
              </div>

              {editingFrameId && selectedFrame?.id === editingFrameId && (
                <div className="mb-6">
                  <PlacementEditor frame={selectedFrame} creative={selectedCreative} onChangePlacements={pls => setSelectedFrame({ ...selectedFrame, placements: pls, placement: pls[0] })} onSave={() => saveFramePlacement(selectedFrame)} saving={savingPlacement} />
                  <div className="flex gap-3 mt-3">
                    <button onClick={() => setEditingFrameId(null)} className="px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Luk editor</button>
                  </div>
                </div>
              )}

              <div onDrop={e => handleDrop(e, "frame")} onDragOver={e => handleDragOver(e, "frame")} onDragLeave={() => setDragOver(null)}
                className={`rounded-2xl border-2 border-dashed transition-all ${dragOver === "frame" ? "border-violet-400 bg-violet-50/50" : "border-transparent"}`}>
                {initialLoading ? (
                  <SkeletonGrid count={8} />
                ) : frames.length === 0 ? (
                  <div className="bg-gradient-to-br from-slate-50 to-violet-50/30 rounded-2xl border-2 border-dashed border-slate-300 p-12 text-center transition-colors hover:border-violet-400 hover:from-violet-50/50">
                    <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-4">
                      <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" className="w-7 h-7 text-violet-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-800 mb-1">Upload din første frame</p>
                    <p className="text-xs text-slate-400 mb-4 max-w-xs mx-auto">Træk et billede af din facade, gavl eller stillads hertil, eller klik for at uploade</p>
                    <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-md shadow-violet-500/20 transition-all hover:shadow-lg">
                      <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />Upload billede<input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], "frame")} />
                    </label>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {frames.map(f => {
                      const isSelected = selectedFrame?.id === f.id;
                      return (
                        <button key={f.id} onClick={() => { setSelectedFrame(f); setStep("creative"); }}
                          className={`group text-left rounded-2xl border-2 overflow-hidden transition-all ${isSelected ? "border-violet-500 ring-4 ring-violet-100 shadow-lg" : "border-slate-200/80 hover:border-violet-300 hover:shadow-md bg-white"}`}>
                          <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden">
                            {f.frameImageUrl && <img src={f.frameImageUrl} alt={f.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                            {f.frameImageUrl && (() => {
                              const pls = ensurePlacements(f);
                              return <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${f.frameWidth} ${f.frameHeight}`} preserveAspectRatio="none">
                                {pls.map((p, pi) => { const q = ensureQuad(p); const c = PLACEMENT_COLORS[pi % PLACEMENT_COLORS.length]; return <polygon key={pi} points={q.map(pt => `${pt.x},${pt.y}`).join(" ")} fill={c.fill} stroke={c.stroke} strokeWidth={Math.max(f.frameWidth, f.frameHeight) * 0.004} />; })}
                              </svg>;
                            })()}
                            {isSelected && <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center shadow-lg"><Ic d="M4.5 12.75l6 6 9-13.5" className="w-3.5 h-3.5 text-white" /></div>}
                            <div className="absolute top-2 left-2 flex gap-1">
                              {f.dailyTraffic && <div className="px-2 py-0.5 rounded-md bg-white/90 text-[9px] font-bold text-slate-700">{f.dailyTraffic.toLocaleString("da-DK")}/dag</div>}
                              {ensurePlacements(f).length > 1 && <div className="px-2 py-0.5 rounded-md bg-violet-500/90 text-[9px] font-bold text-white">{ensurePlacements(f).length} placeringer</div>}
                            </div>
                            {/* Edit placement & delete */}
                            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <div onClick={e => { e.stopPropagation(); setSelectedFrame(f); setEditingFrameId(f.id); }}
                                className="px-2 py-1 bg-white/90 backdrop-blur-sm rounded-md text-[9px] font-bold text-violet-700 cursor-pointer hover:bg-white">Rediger</div>
                              <div onClick={e => { e.stopPropagation(); removeFrame(f.id); }}
                                className="px-2 py-1 bg-white/90 backdrop-blur-sm rounded-md text-[9px] font-bold text-red-600 cursor-pointer hover:bg-red-50">Slet</div>
                            </div>
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-semibold text-slate-800 truncate">{f.name}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">{f.locationCity || "?"}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">{f.frameType}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP: CREATIVE */}
          {step === "creative" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                {batchMode && selectedFrameIds.size > 0 ? (
                  <p className="text-sm text-slate-500">Vælg creative til <span className="font-semibold text-violet-700">{selectedFrameIds.size} frames</span> (batch)</p>
                ) : (
                  <p className="text-sm text-slate-500">Vælg reklame-billede til <span className="font-semibold text-slate-700">{selectedFrame?.name}</span></p>
                )}
                <label className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-sm">
                  <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />Upload<input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], "creative")} />
                </label>
              </div>

              {/* Multi-placement creative assignment panel */}
              {selectedFrame && ensurePlacements(selectedFrame).length > 1 && !batchMode && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 mb-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Tildel creative per placering</h4>
                  <p className="text-[11px] text-slate-500 mb-3">Denne frame har {ensurePlacements(selectedFrame).length} placeringer. Vælg et creative for hver, eller klik direkte på et creative nedenfor for at bruge det til alle.</p>
                  <div className="space-y-2">
                    {ensurePlacements(selectedFrame).map((p, idx) => {
                      const color = PLACEMENT_COLORS[idx % PLACEMENT_COLORS.length];
                      const assignedId = creativeAssignments[idx];
                      const assignedCreative = assignedId ? creatives.find(c => c.id === assignedId) : null;
                      return (
                        <div key={idx} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 rounded-xl">
                          <span className={`w-3 h-3 rounded-full ${color.bg} shrink-0`} />
                          <span className="text-xs font-semibold text-slate-800 min-w-[100px]">{p.label || `Placering ${idx + 1}`}</span>
                          <select
                            value={assignedId || ""}
                            onChange={e => {
                              const val = e.target.value;
                              setCreativeAssignments(prev => {
                                const next = { ...prev };
                                if (val) { next[idx] = val; } else { delete next[idx]; }
                                return next;
                              });
                            }}
                            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                          >
                            <option value="">Ingen valgt</option>
                            {creatives.map(c => (
                              <option key={c.id} value={c.id}>{c.companyName} – {c.filename}</option>
                            ))}
                          </select>
                          {assignedCreative?.thumbnailUrl && (
                            <div className="w-8 h-8 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                              <img src={assignedCreative.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {Object.keys(creativeAssignments).length > 0 && (
                    <button
                      onClick={() => {
                        const firstCreative = creatives.find(c => c.id === Object.values(creativeAssignments)[0]);
                        if (firstCreative) { setSelectedCreative(firstCreative); generateProposal(firstCreative); }
                      }}
                      disabled={batchGenerating || generating}
                      className="mt-3 w-full px-4 py-2.5 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 disabled:opacity-40"
                    >
                      <Ic d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" className="w-4 h-4" />
                      Generer mockup med {Object.keys(creativeAssignments).length} placering{Object.keys(creativeAssignments).length > 1 ? "er" : ""}
                    </button>
                  )}
                </div>
              )}

              {/* Batch generating progress */}
              {batchGenerating && (
                <div className="bg-white rounded-2xl border border-violet-200 p-8 mb-6">
                  <div className="flex items-center gap-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-3 border-violet-200 border-t-violet-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">Genererer {selectedFrameIds.size} mockups...</p>
                      {batchCurrentFrame && <p className="text-xs text-slate-400 mt-0.5 truncate">Nu: {batchCurrentFrame}</p>}
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex-1 bg-violet-100 rounded-full h-2 overflow-hidden">
                          <div className="bg-gradient-to-r from-violet-500 to-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${batchProgress}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-violet-600 tabular-nums shrink-0">{Math.round(batchProgress)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4 relative"><Ic d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={creativeSearch} onChange={e => setCreativeSearch(e.target.value)} placeholder="Søg..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
              </div>
              <div onDrop={e => handleDrop(e, "creative")} onDragOver={e => handleDragOver(e, "creative")} onDragLeave={() => setDragOver(null)}
                className={`rounded-2xl border-2 border-dashed transition-all ${dragOver === "creative" ? "border-violet-400 bg-violet-50/50" : "border-transparent"}`}>
                {creatives.length === 0 ? (
                  <div className="bg-gradient-to-br from-slate-50 to-violet-50/30 rounded-2xl border-2 border-dashed border-slate-300 p-10 text-center transition-colors hover:border-violet-400">
                    <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-3">
                      <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" className="w-6 h-6 text-violet-500" />
                    </div>
                    <p className="text-sm font-bold text-slate-800 mb-1">Upload dit creative</p>
                    <p className="text-xs text-slate-400 mb-3">Træk dit reklamebillede hertil, eller klik Upload knappen ovenfor</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                    {creatives.map(c => (
                      <button key={c.id} disabled={batchGenerating}
                        onClick={() => {
                          setSelectedCreative(c);
                          if (batchMode && selectedFrameIds.size > 0) {
                            generateBatchMockups(c);
                          } else {
                            generateProposal(c);
                          }
                        }}
                        className={`group relative rounded-xl border-2 overflow-hidden transition-all disabled:opacity-40 ${selectedCreative?.id === c.id ? "border-violet-500 ring-4 ring-violet-100 shadow-lg" : "border-slate-200/80 hover:border-violet-300 hover:shadow-md bg-white"}`}>
                        <div className="aspect-square bg-slate-50 relative overflow-hidden">
                          {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt={c.filename} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-300">{c.filename}</div>}
                          <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/20 transition-colors flex items-center justify-center">
                            <span className="px-3 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-bold text-violet-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                              {batchMode && selectedFrameIds.size > 0 ? `Generer ${selectedFrameIds.size} mockups` : "Generer mockup"}
                            </span>
                          </div>
                        </div>
                        <div className="p-2"><p className="text-[11px] font-semibold text-slate-700 truncate">{c.companyName}</p><p className="text-[10px] text-slate-400 truncate">{c.campaignName || c.filename}</p></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Batch results – compact strip */}
              {batchResults.length > 0 && !batchGenerating && (
                <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Ic d="M4.5 12.75l6 6 9-13.5" className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-semibold text-emerald-800">{batchResults.filter(r => r.success).length}/{batchResults.length} mockups klar</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={downloadAllBatchResults} className="px-2.5 py-1.5 bg-emerald-600 text-white text-[10px] font-semibold rounded-lg hover:bg-emerald-700 flex items-center gap-1">
                        <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-3 h-3" />Download alle
                      </button>
                      <button onClick={() => setBatchResults([])} className="p-1 text-emerald-500 hover:text-emerald-700" title="Luk">
                        <Ic d="M6 18L18 6M6 6l12 12" className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
                    {batchResults.map(r => (
                      <div key={r.frameId} className="shrink-0 relative group">
                        {r.success && r.preview ? (
                          <a href={r.preview} download={`Mockup-${r.frameName.replace(/\s+/g, "-")}.jpg`}>
                            <img src={r.preview} alt={r.frameName} className="w-16 h-12 object-cover rounded-lg border border-emerald-200 hover:ring-2 hover:ring-emerald-400" />
                          </a>
                        ) : (
                          <div className="w-16 h-12 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-400"><Ic d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" className="w-3 h-3" /></div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => setStep("frame")} className="mt-4 px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">← Tilbage</button>
            </div>
          )}

          {/* STEP: RESULT */}
          {step === "result" && (
            <div>
              {/* Generating progress */}
              {generating && (
                <div className="bg-white rounded-2xl border border-violet-200 p-8 text-center mb-6">
                  <div className="animate-spin rounded-full h-10 w-10 border-3 border-violet-200 border-t-violet-600 mx-auto mb-4" />
                  <p className="text-sm font-semibold text-slate-900">{genMessage}</p>
                  <div className="w-full max-w-xs mx-auto bg-violet-100 rounded-full h-2 mt-4 overflow-hidden">
                    <div className="bg-gradient-to-r from-violet-500 to-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${genProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Result */}
              {genResult && !generating && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* Mockup preview */}
                  <div className="lg:col-span-3">
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                      <div className="aspect-[4/3] bg-slate-100 relative">
                        {genResult.mockupPreview ? <img src={genResult.mockupPreview} alt="Mockup" className="w-full h-full object-contain" /> :
                          <div className="w-full h-full flex items-center justify-center text-slate-300">Mockup</div>}
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="font-bold text-slate-900">{selectedFrame?.name}</h3>
                            <p className="text-xs text-slate-400">{selectedCreative?.companyName}{selectedCreative?.campaignName ? ` – ${selectedCreative.campaignName}` : ""}</p>
                          </div>
                          {genResult.processingDurationMs && <span className="text-[10px] text-slate-400 font-mono">{(genResult.processingDurationMs / 1000).toFixed(1)}s</span>}
                        </div>
                        {/* Download buttons */}
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => downloadMockup("png")} disabled={downloadingMockup}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-40">
                            {downloadingMockup ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" /> : <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-3.5 h-3.5" />}
                            Download PNG
                          </button>
                          <button onClick={() => downloadMockup("jpg")} disabled={downloadingMockup}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors disabled:opacity-40">
                            <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-3.5 h-3.5" />
                            Download JPG
                          </button>
                          <button onClick={downloadPdf} disabled={downloadingPdf}
                            className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition-colors disabled:opacity-40">
                            {downloadingPdf ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" /> : <Ic d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-3.5 h-3.5" />}
                            4-sidet PDF
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Client info + send */}
                  <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-4">Send til kunde</h3>
                      <div className="space-y-3">
                        <div><label className="text-[10px] font-bold text-slate-500 uppercase">Firma</label><input type="text" value={clientCompany} onChange={e => setClientCompany(e.target.value)} placeholder="Firma navn" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1 focus:border-violet-300" /></div>
                        <div><label className="text-[10px] font-bold text-slate-500 uppercase">Kontakt</label><input type="text" value={clientContact} onChange={e => setClientContact(e.target.value)} placeholder="Kontaktperson" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1 focus:border-violet-300" /></div>
                        <div><label className="text-[10px] font-bold text-slate-500 uppercase">Email *</label><input type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="email@firma.dk" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1 focus:border-violet-300" /></div>
                      </div>
                      <button onClick={sendEmail} disabled={!clientEmail || sendingEmail}
                        className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-sm font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20">
                        {sendingEmail ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" /> : <Ic d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" className="w-4 h-4" />}
                        Send email
                      </button>
                    </div>

                    {/* Quick links */}
                    {(genResult.slidesUrl || genResult.pdfUrl || genResult.mockupUrl) && (
                      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5">
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-3">Links</h3>
                        <div className="space-y-2">
                          {genResult.mockupUrl && <a href={genResult.mockupUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-violet-600 hover:text-violet-700 font-medium"><Ic d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-4.28a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 006.364 6.364l1.757-1.757" className="w-3.5 h-3.5" />Mockup (Drive)</a>}
                          {genResult.slidesUrl && <a href={genResult.slidesUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-700 font-medium"><Ic d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-4.28a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 006.364 6.364l1.757-1.757" className="w-3.5 h-3.5" />Google Slides</a>}
                          {genResult.pdfUrl && <a href={genResult.pdfUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-red-600 hover:text-red-700 font-medium"><Ic d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-4.28a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 006.364 6.364l1.757-1.757" className="w-3.5 h-3.5" />PDF (Drive)</a>}
                        </div>
                      </div>
                    )}

                    <button onClick={resetBuilder} className="w-full px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                      <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-4 h-4" />Ny mockup
                    </button>
                  </div>
                </div>
              )}

              {!genResult && !generating && (
                <div className="text-center py-12">
                  <p className="text-slate-400">Noget gik galt. Proev igen.</p>
                  <button onClick={() => setStep("frame")} className="mt-4 px-4 py-2 bg-violet-600 text-white text-sm rounded-xl">Start forfra</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ FRAMES ═══ */}
      {tab === "frames" && (
        <div>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div><h2 className="text-xl font-bold text-slate-900">Frame Library</h2><p className="text-sm text-slate-500 mt-0.5">{frames.length} frames – vælg, rediger, slet eller opret netværk</p></div>
            <div className="flex items-center gap-2">
              <button onClick={() => setBatchMode(!batchMode)} className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-all ${batchMode ? "bg-violet-50 border-violet-300 text-violet-700" : "bg-white border-slate-200 text-slate-600 hover:border-violet-300"}`}>
                <Ic d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" className="w-3.5 h-3.5 inline mr-1" />{batchMode ? "Multi-select ON" : "Multi-select"}
              </button>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-sm">
                <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />Upload<input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], "frame")} />
              </label>
            </div>
          </div>

          {/* Batch mode toolbar */}
          {batchMode && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-violet-800">{selectedFrameIds.size} valgt</span>
                  <button onClick={selectAllFrames} className="text-[11px] text-violet-600 hover:text-violet-800 font-medium underline">Vælg alle</button>
                  <button onClick={deselectAllFrames} className="text-[11px] text-violet-600 hover:text-violet-800 font-medium underline">Fravælg alle</button>
                </div>
                <div className="flex items-center gap-2">
                  {selectedFrameIds.size > 0 && (
                    <>
                      <button onClick={() => setShowNetworkCreate(true)} className="px-3 py-1.5 bg-white border border-violet-200 text-violet-700 text-[11px] font-semibold rounded-lg hover:bg-violet-100">
                        <Ic d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" className="w-3 h-3 inline mr-1" />Gem som netværk
                      </button>
                      <button onClick={() => { setStep("creative"); setTab("builder"); }}
                        className="px-3 py-1.5 bg-violet-600 text-white text-[11px] font-semibold rounded-lg hover:bg-violet-700 shadow-sm">
                        <Ic d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" className="w-3 h-3 inline mr-1" />Batch generer mockups →
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Network create inline */}
              {showNetworkCreate && (
                <div className="mt-3 flex items-center gap-2 pt-3 border-t border-violet-200">
                  <input type="text" value={networkName} onChange={e => setNetworkName(e.target.value)} placeholder="Netværksnavn, fx 'Aarhus Centrum'" className="flex-1 px-3 py-2 border border-violet-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-200" />
                  <button onClick={() => createNetwork(networkName || "Nyt netværk", [...selectedFrameIds])} className="px-4 py-2 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700">Opret</button>
                  <button onClick={() => setShowNetworkCreate(false)} className="px-3 py-2 text-xs text-slate-500 hover:bg-slate-100 rounded-lg">Annuller</button>
                </div>
              )}
            </div>
          )}

          {/* Networks */}
          {networks.length > 0 && (
            <div className="mb-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Netværk (presets)</h3>
              <div className="flex flex-wrap gap-2">
                {networks.map(n => (
                  <div key={n.id} className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm group">
                    <button onClick={() => applyNetwork(n)} className="text-xs font-semibold text-violet-700 hover:text-violet-900">{n.name}</button>
                    <span className="text-[10px] text-slate-400 font-medium">{n.frameIds.length} frames</span>
                    <button onClick={() => deleteNetworkById(n.id)} className="ml-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Ic d="M6 18L18 6M6 6l12 12" className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Frame grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5" onDrop={e => handleDrop(e, "frame")} onDragOver={e => handleDragOver(e, "fl")} onDragLeave={() => setDragOver(null)}>
            {frames.map(f => {
              const isChecked = selectedFrameIds.has(f.id);
              return (
                <div key={f.id} className={`group bg-white rounded-2xl border-2 shadow-sm overflow-hidden hover:shadow-lg transition-all ${isChecked ? "border-violet-400 ring-2 ring-violet-100" : "border-slate-200/80"}`}>
                  <div className="aspect-[4/3] bg-slate-100 relative overflow-hidden" onClick={batchMode ? () => toggleFrameSelect(f.id) : undefined}>
                    {f.frameImageUrl && <img src={f.frameImageUrl} alt={f.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                    {f.frameImageUrl && (() => {
                      const pls = ensurePlacements(f);
                      return <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${f.frameWidth} ${f.frameHeight}`} preserveAspectRatio="none">
                        {pls.map((p, pi) => { const q = ensureQuad(p); const c = PLACEMENT_COLORS[pi % PLACEMENT_COLORS.length]; return <polygon key={pi} points={q.map(pt => `${pt.x},${pt.y}`).join(" ")} fill={c.fill} stroke={c.stroke} strokeWidth={Math.max(f.frameWidth, f.frameHeight) * 0.005} />; })}
                      </svg>;
                    })()}
                    {/* Multi-select checkbox */}
                    {batchMode && (
                      <div className="absolute top-2 left-2 z-10">
                        <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all cursor-pointer ${isChecked ? "bg-violet-500 border-violet-500" : "bg-white/80 border-slate-300 hover:border-violet-400"}`}
                          onClick={e => { e.stopPropagation(); toggleFrameSelect(f.id); }}>
                          {isChecked && <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3.5 h-3.5 text-white" />}
                        </div>
                      </div>
                    )}
                    {/* Hover actions */}
                    {!batchMode && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <button onClick={() => setEditModalFrame(f)} className="px-2.5 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-semibold text-slate-700 hover:bg-white shadow-sm">
                          <Ic d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" className="w-3 h-3 inline mr-0.5" />Rediger
                        </button>
                        <button onClick={() => { setSelectedFrame(f); setEditingFrameId(f.id); setTab("builder"); setStep("frame"); }} className="px-2.5 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-semibold text-violet-700 hover:bg-white shadow-sm">Placement</button>
                        <button onClick={() => { setSelectedFrame(f); setTab("builder"); setStep("creative"); }} className="px-2.5 py-1.5 bg-violet-600/90 backdrop-blur-sm rounded-lg text-[10px] font-semibold text-white hover:bg-violet-700 shadow-sm">Brug →</button>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm text-slate-900 truncate flex-1">{f.name}</h3>
                      <button onClick={() => removeFrame(f.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Slet frame">
                        <Ic d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {f.locationAddress && <p className="text-[10px] text-slate-400 truncate mt-0.5">{f.locationAddress}</p>}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{f.locationCity || "?"}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{f.frameType === "scaffolding" ? "Stillads" : f.frameType === "facade" ? "Facade" : f.frameType === "gable" ? "Gavl" : f.frameType}</span>
                      {f.dailyTraffic && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">{f.dailyTraffic.toLocaleString("da-DK")}/dag</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Batch results – compact collapsible strip */}
          {batchResults.length > 0 && (
            <div className="mt-5 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Ic d="M4.5 12.75l6 6 9-13.5" className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-semibold text-emerald-800">{batchResults.filter(r => r.success).length}/{batchResults.length} mockups klar</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={downloadAllBatchResults} className="px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-semibold rounded-lg hover:bg-emerald-700 flex items-center gap-1.5">
                    <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-3 h-3" />Download alle
                  </button>
                  <button onClick={() => setBatchResults([])} className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100 rounded-lg" title="Luk">
                    <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Compact thumbnail row */}
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                {batchResults.map(r => (
                  <div key={r.frameId} className="shrink-0 relative group">
                    {r.success && r.preview ? (
                      <a href={r.preview} download={`Mockup-${r.frameName.replace(/\s+/g, "-")}.jpg`}>
                        <img src={r.preview} alt={r.frameName} className="w-20 h-14 object-cover rounded-lg border border-emerald-200 hover:ring-2 hover:ring-emerald-400 transition-all" />
                      </a>
                    ) : (
                      <div className="w-20 h-14 rounded-lg bg-red-100 border border-red-200 flex items-center justify-center text-red-400"><Ic d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" className="w-4 h-4" /></div>
                    )}
                    <div className="absolute -bottom-0.5 left-0 right-0 text-center"><span className="text-[8px] font-medium text-emerald-700 bg-emerald-50/90 px-1 rounded">{r.frameName.length > 10 ? r.frameName.slice(0, 10) + "…" : r.frameName}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ CREATIVES ═══ */}
      {tab === "creatives" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div><h2 className="text-xl font-bold text-slate-900">Creative Library</h2><p className="text-sm text-slate-500 mt-0.5">{creatives.length} reklamebilleder og assets</p></div>
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-sm">
              <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />Upload<input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0], "creative")} />
            </label>
          </div>
          <div className="mb-4 relative max-w-md"><Ic d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={creativeSearch} onChange={e => setCreativeSearch(e.target.value)} placeholder="Soeg creatives..." className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4" onDrop={e => handleDrop(e, "creative")} onDragOver={e => handleDragOver(e, "cl")} onDragLeave={() => setDragOver(null)}>
            {creatives.map(c => (
              <div key={c.id} className="group bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden hover:shadow-lg transition-all">
                <div className="aspect-square bg-slate-50 relative overflow-hidden">
                  {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt={c.filename} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-slate-200 text-xs">{c.filename}</div>}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                    <button onClick={() => { setSelectedCreative(c); setTab("builder"); setStep("creative"); }}
                      className="px-2.5 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-semibold text-violet-700 shadow-sm hover:bg-white">Brug</button>
                    <button onClick={() => removeCreative(c.id)}
                      className="px-2.5 py-1.5 bg-white/90 backdrop-blur-sm rounded-lg text-[10px] font-semibold text-red-600 shadow-sm hover:bg-red-50">Slet</button>
                  </div>
                </div>
                <div className="p-2.5 flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{c.companyName}</p>
                    <p className="text-[10px] text-slate-400 truncate">{c.campaignName || c.filename}</p>
                  </div>
                  <button onClick={() => removeCreative(c.id)} className="p-0.5 text-slate-300 hover:text-red-500 shrink-0 mt-0.5" title="Slet">
                    <Ic d="M6 18L18 6M6 6l12 12" className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ PROPOSALS HISTORY ═══ */}
      {tab === "proposals" && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div><h2 className="text-xl font-bold text-slate-900">Historik</h2><p className="text-sm text-slate-500 mt-0.5">{proposals.length} genererede mockups & proposals</p></div>
          </div>
          {proposals.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center">
              <Ic d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700 mb-1">Ingen proposals endnu</p>
              <p className="text-xs text-slate-400">Generér et mockup i Builder-fanen for at se historik her</p>
            </div>
          ) : (
            <div className="space-y-3">
              {proposals.map(p => {
                const frame = frames.find(f => f.id === p.frameId);
                return (
                  <div key={p.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                    <div className="flex items-stretch">
                      <div className="w-36 shrink-0 bg-slate-100">{p.mockupPreview ? <img src={p.mockupPreview} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center min-h-[80px] text-slate-200"><Ic d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159" className="w-6 h-6" /></div>}</div>
                      <div className="flex-1 p-4 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="font-bold text-sm text-slate-900">{p.clientCompany}</h3>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${p.status === "sent" ? "bg-emerald-100 text-emerald-700" : p.status === "error" ? "bg-red-100 text-red-700" : "bg-violet-100 text-violet-700"}`}>{p.status === "sent" ? "SENDT" : p.status.toUpperCase()}</span>
                          </div>
                          <p className="text-xs text-slate-500">{frame?.name || "?"} · {p.clientEmail}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{new Date(p.createdAt).toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {p.mockupPreview && <a href={p.mockupPreview} download className="p-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100"><Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-4 h-4" /></a>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ OPLÆG (Presentation Templates) ═══ */}
      {tab === "oplaeg" && !presEditorOpen && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Oplæg Skabeloner</h2>
              <p className="text-sm text-slate-500 mt-0.5">Upload PDF-skabeloner og definer billedpladser til automatisk mockup-indsættelse</p>
            </div>
            <label className={`inline-flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-sm ${uploadingTemplate ? "opacity-50 pointer-events-none" : ""}`}>
              <Ic d="M12 4.5v15m7.5-7.5h-15" className="w-3.5 h-3.5" />
              {uploadingTemplate ? "Uploader..." : "Upload PDF"}
              <input type="file" accept="application/pdf" className="hidden" onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingTemplate(true);
                try {
                  // 1. Upload the PDF file
                  const fd = new FormData();
                  fd.append("file", file);
                  const uploadRes = await fetch("/api/ooh/upload-template-pdf", { method: "POST", body: fd });
                  const uploadData = await uploadRes.json();
                  if (!uploadRes.ok) throw new Error(uploadData.error);

                  // 2. Create the template record
                  const tplRes = await fetch("/api/ooh/presentation-templates", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: file.name.replace(/\.pdf$/i, ""),
                      pdfFileUrl: uploadData.url,
                      pageCount: uploadData.pageCount || 0,
                      pages: [],
                    }),
                  });
                  const tpl = await tplRes.json();
                  setPresTemplates(prev => [tpl, ...prev]);
                  setActivePresTemplate(tpl);
                  setPresEditorOpen(true);
                  toast("PDF uploadet! Definer billedpladser.", "success");
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Upload fejlede", "error");
                } finally {
                  setUploadingTemplate(false);
                  e.target.value = "";
                }
              }} />
            </label>
          </div>

          {/* How it works */}
          {presTemplates.length === 0 && (
            <div className="bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200/60 rounded-2xl p-8 mb-6 text-center">
              <Ic d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3" className="w-12 h-12 text-violet-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-800 mb-2">Automatiser dine oplæg</h3>
              <p className="text-sm text-slate-600 mb-4 max-w-md mx-auto">
                Upload din Canva/PDF-skabelon, marker hvor mockup-billeder skal indsættes, og generer færdige oplæg med ét klik.
              </p>
              <div className="flex justify-center gap-6 text-xs text-slate-500">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" className="w-5 h-5 text-violet-600" />
                  </div>
                  <span className="font-semibold">1. Upload PDF</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <Ic d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159" className="w-5 h-5 text-violet-600" />
                  </div>
                  <span className="font-semibold">2. Definer pladser</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <Ic d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" className="w-5 h-5 text-violet-600" />
                  </div>
                  <span className="font-semibold">3. Generer oplæg</span>
                </div>
              </div>
            </div>
          )}

          {/* Templates list */}
          {presTemplates.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {presTemplates.map(tpl => {
                const totalSlots = tpl.pages.reduce((s, p) => s + p.imageSlots.length, 0);
                const hasSlots = totalSlots > 0;
                const previewThumb = tpl.pages.find(p => p.thumbnailUrl)?.thumbnailUrl;

                return (
                  <div key={tpl.id} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden hover:shadow-lg transition-all group">
                    {/* Preview */}
                    <div className="aspect-[4/3] bg-slate-50 relative overflow-hidden">
                      {previewThumb ? (
                        <img src={previewThumb} alt={tpl.name} className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Ic d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" className="w-12 h-12 text-slate-200" />
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1">
                        <span className="px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-md text-[10px] font-bold text-slate-600">{tpl.pageCount} sider</span>
                        {hasSlots && <span className="px-2 py-0.5 bg-violet-500/90 backdrop-blur-sm rounded-md text-[10px] font-bold text-white">{totalSlots} pladser</span>}
                      </div>
                      {/* Generating overlay */}
                      {presGenerating && activePresTemplate?.id === tpl.id && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 z-10">
                          <div className="animate-spin rounded-full h-8 w-8 border-3 border-violet-200 border-t-violet-600" />
                          <span className="text-xs font-semibold text-violet-600">Genererer oplæg...</span>
                        </div>
                      )}
                    </div>

                    {/* Info + actions */}
                    <div className="p-4">
                      <h3 className="text-sm font-bold text-slate-900 truncate mb-1">{tpl.name}</h3>
                      <p className="text-[10px] text-slate-400 mb-3">
                        Oprettet {new Date(tpl.createdAt).toLocaleDateString("da-DK", { day: "2-digit", month: "short", year: "numeric" })}
                      </p>

                      <div className="flex gap-2">
                        <button
                          onClick={() => { setActivePresTemplate(tpl); setPresEditorOpen(true); }}
                          className="px-3 py-2 bg-slate-100 text-slate-700 text-[11px] font-semibold rounded-lg hover:bg-slate-200 flex items-center justify-center gap-1.5"
                        >
                          <Ic d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" className="w-3 h-3" />
                          Rediger
                        </button>
                        {hasSlots && (
                          <label className="flex-1 px-3 py-2 bg-violet-600 text-white text-[11px] font-semibold rounded-lg hover:bg-violet-700 flex items-center justify-center gap-1.5 cursor-pointer">
                            <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" className="w-3 h-3" />
                            Upload creative & generer
                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              e.target.value = "";
                              // Check duplicate
                              const existing = creatives.find(c => c.filename === file.name && c.fileSize === file.size);
                              if (existing) {
                                // Duplicate: skip naming, go straight to generation
                                setActivePresTemplate(tpl);
                                setPresCreativeId(existing.id);
                                toast("Creative findes allerede – genbruger eksisterende", "info");
                                return;
                              }
                              // Open naming modal → after confirm, it handles generation
                              setPendingCreativeUpload({ file, context: "oplaeg-inline", tpl });
                              setCreativeNameInput(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
                            }} />
                          </label>
                        )}
                        {hasSlots && (
                          <button
                            onClick={() => { setActivePresTemplate(tpl); setPresCreativeId(null); setPresPlacementOverrides({}); setPresUseSameCreative(true); }}
                            className="px-2 py-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg"
                            title="Vælg eksisterende creative"
                          >
                            <Ic d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            showConfirm({
                              title: "Slet skabelon",
                              message: "Er du sikker på du vil slette denne skabelon?",
                              detail: tpl.name,
                              variant: "danger",
                              confirmLabel: "Slet",
                              onConfirm: async () => {
                                closeConfirm();
                                try {
                                  const res = await fetch(`/api/ooh/presentation-templates?id=${tpl.id}`, { method: "DELETE" });
                                  if (res.ok) {
                                    setPresTemplates(prev => prev.filter(t => t.id !== tpl.id));
                                    if (activePresTemplate?.id === tpl.id) setActivePresTemplate(null);
                                    toast("Skabelon slettet", "success");
                                  }
                                } catch { toast("Kunne ikke slette", "error"); }
                              },
                            });
                          }}
                          className="px-2 py-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg"
                          title="Slet skabelon"
                        >
                          <Ic d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Generate modal (select creative & generate) ── */}
          {activePresTemplate && !presEditorOpen && (
            <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setActivePresTemplate(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Generer oplæg</h3>
                    <p className="text-xs text-slate-500">{activePresTemplate.name} · {activePresTemplate.pages.reduce((s, p) => s + p.imageSlots.length, 0)} billedpladser</p>
                  </div>
                  <button onClick={() => setActivePresTemplate(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                    <Ic d="M6 18L18 6M6 6l12 12" className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  {/* Slot assignments overview with multi-placement support */}
                  <div className="mb-5">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Billedpladser & tilknyttede frames</h4>
                    {/* Group slots by linked frame to show shared placement assignments */}
                    {(() => {
                      // Collect unique frames and which slots/pages use them
                      const frameSlotMap = new Map<string, { frame: Frame; slots: { slotLabel: string; pageIdx: number }[] }>();
                      const unlinkedSlots: { slotLabel: string; pageIdx: number }[] = [];
                      for (const p of activePresTemplate.pages) {
                        for (const slot of p.imageSlots) {
                          if (slot.linkedFrameId) {
                            const f = frames.find(fr => fr.id === slot.linkedFrameId);
                            if (f) {
                              if (!frameSlotMap.has(f.id)) frameSlotMap.set(f.id, { frame: f, slots: [] });
                              frameSlotMap.get(f.id)!.slots.push({ slotLabel: slot.label, pageIdx: p.pageIndex });
                            } else {
                              unlinkedSlots.push({ slotLabel: slot.label, pageIdx: p.pageIndex });
                            }
                          } else {
                            unlinkedSlots.push({ slotLabel: slot.label, pageIdx: p.pageIndex });
                          }
                        }
                      }
                      return (
                        <div className="space-y-2">
                          {[...frameSlotMap.entries()].map(([frameId, { frame: linkedFrame, slots }]) => {
                            const framePlacements = ensurePlacements(linkedFrame);
                            const hasMulti = framePlacements.length > 1;
                            return (
                              <div key={frameId} className="px-3 py-2 bg-slate-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                  <div className="flex gap-1">
                                    {slots.map((s, i) => (
                                      <div key={i} className="w-6 h-6 rounded bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600">{s.pageIdx + 1}</div>
                                    ))}
                                  </div>
                                  <span className="text-xs font-semibold text-slate-800 flex-1">
                                    {slots.map(s => s.slotLabel).join(", ")}
                                  </span>
                                  <span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
                                    <Ic d="M4.5 12.75l6 6 9-13.5" className="w-3 h-3" />{linkedFrame.name}
                                    {hasMulti && <span className="ml-1 px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 text-[9px] font-bold">{framePlacements.length} placeringer</span>}
                                  </span>
                                </div>
                                {/* Per-placement creative overrides – keyed by frameId so all slots share */}
                                {hasMulti && !presUseSameCreative && presCreativeId && (
                                  <div className="mt-2 ml-9 space-y-1.5">
                                    {framePlacements.map((pl, pi) => {
                                      const color = PLACEMENT_COLORS[pi % PLACEMENT_COLORS.length];
                                      const overrideId = presPlacementOverrides[frameId]?.[pi];
                                      return (
                                        <div key={pi} className="flex items-center gap-2">
                                          <span className={`w-2.5 h-2.5 rounded-full ${color.bg} shrink-0`} />
                                          <span className="text-[10px] font-medium text-slate-600 min-w-[80px]">{pl.label || `Placering ${pi + 1}`}</span>
                                          <select
                                            value={overrideId || ""}
                                            onChange={e => {
                                              setPresPlacementOverrides(prev => {
                                                const next = { ...prev };
                                                if (!next[frameId]) next[frameId] = {};
                                                if (e.target.value) {
                                                  next[frameId] = { ...next[frameId], [pi]: e.target.value };
                                                } else {
                                                  const s = { ...next[frameId] };
                                                  delete s[pi];
                                                  next[frameId] = s;
                                                }
                                                return next;
                                              });
                                            }}
                                            className="flex-1 px-2 py-1 border border-slate-200 rounded-lg text-[10px] bg-white focus:border-violet-300 focus:ring-1 focus:ring-violet-100"
                                          >
                                            <option value="">Samme som hoved-creative</option>
                                            {creatives.map(c => (
                                              <option key={c.id} value={c.id}>{c.companyName} – {c.filename}</option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {unlinkedSlots.map((s, i) => (
                            <div key={`unlinked-${i}`} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
                              <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">{s.pageIdx + 1}</div>
                              <span className="text-xs font-semibold text-slate-800 flex-1">{s.slotLabel}</span>
                              <span className="text-[10px] text-amber-500 font-medium">Ingen frame linket</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Creative mode toggle */}
                  {(() => {
                    const hasAnyMulti = activePresTemplate.pages.some(p =>
                      p.imageSlots.some(slot => {
                        const f = frames.find(fr => fr.id === slot.linkedFrameId);
                        return f && ensurePlacements(f).length > 1;
                      })
                    );
                    if (!hasAnyMulti) return null;
                    return (
                      <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <Ic d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="flex-1">
                          <p className="text-[11px] font-semibold text-slate-700">Frames med flere placeringer fundet</p>
                          <p className="text-[10px] text-slate-500">Vælg om du vil bruge samme creative på alle placeringer eller forskellige</p>
                        </div>
                        <div className="flex gap-1 bg-white rounded-lg border border-slate-200 p-0.5">
                          <button
                            onClick={() => { setPresUseSameCreative(true); setPresPlacementOverrides({}); }}
                            className={`px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all ${presUseSameCreative ? "bg-violet-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                          >Samme</button>
                          <button
                            onClick={() => setPresUseSameCreative(false)}
                            className={`px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all ${!presUseSameCreative ? "bg-violet-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                          >Forskellige</button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Creative upload + selection */}
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">{presUseSameCreative ? "Creative til alle mockups" : "Hoved-creative (brugt som standard)"}</h4>

                  {/* Selected creative preview */}
                  {presCreativeId && (() => {
                    const selC = creatives.find(c => c.id === presCreativeId);
                    if (!selC) return null;
                    return (
                      <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl">
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-white border border-violet-200 shrink-0">
                          {selC.thumbnailUrl ? <img src={selC.thumbnailUrl} alt={selC.filename} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-300 text-[10px]">{selC.filename}</div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-violet-900 truncate">{selC.companyName || selC.filename}</p>
                          <p className="text-[11px] text-violet-600">{selC.width && selC.height ? `${selC.width}×${selC.height}` : selC.filename}</p>
                        </div>
                        <button onClick={() => setPresCreativeId(null)} className="p-1.5 hover:bg-violet-100 rounded-lg transition-colors" title="Fjern valg">
                          <Ic d="M6 18L18 6M6 6l12 12" className="w-4 h-4 text-violet-400" />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Upload zone */}
                  <div
                    className="relative mb-4 border-2 border-dashed border-slate-200 hover:border-violet-400 rounded-xl p-5 text-center cursor-pointer transition-colors group"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-violet-400", "bg-violet-50"); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove("border-violet-400", "bg-violet-50"); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("border-violet-400", "bg-violet-50");
                      const file = e.dataTransfer.files[0];
                      if (!file?.type.startsWith("image/")) return;
                      // Check duplicate
                      const existing = creatives.find(c => c.filename === file.name && c.fileSize === file.size);
                      if (existing) {
                        setPresCreativeId(existing.id);
                        toast("Creative findes allerede – genbruger eksisterende", "info");
                        return;
                      }
                      // Open naming modal
                      setPendingCreativeUpload({ file, context: "oplaeg" });
                      setCreativeNameInput(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
                    }}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file"; input.accept = "image/*";
                      input.onchange = () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        // Check duplicate
                        const existing = creatives.find(c => c.filename === file.name && c.fileSize === file.size);
                        if (existing) {
                          setPresCreativeId(existing.id);
                          toast("Creative findes allerede – genbruger eksisterende", "info");
                          return;
                        }
                        // Open naming modal
                        setPendingCreativeUpload({ file, context: "oplaeg" });
                        setCreativeNameInput(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
                      };
                      input.click();
                    }}
                  >
                    {uploading ? (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-violet-300 border-t-violet-600" />
                        <span className="text-sm text-violet-600 font-medium">Uploader...</span>
                      </div>
                    ) : (
                      <>
                        <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" className="w-7 h-7 text-slate-300 group-hover:text-violet-400 mx-auto mb-2 transition-colors" />
                        <p className="text-sm font-semibold text-slate-600 group-hover:text-violet-600 transition-colors">Upload nyt creative</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Klik eller træk et billede hertil</p>
                      </>
                    )}
                  </div>

                  {/* Divider */}
                  {creatives.length > 0 && (
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px bg-slate-200" />
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">eller vælg eksisterende</span>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                  )}

                  {/* Existing creatives grid */}
                  {creatives.length > 0 && (
                    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                      {creatives.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setPresCreativeId(c.id)}
                          className={`rounded-xl border-2 overflow-hidden transition-all ${presCreativeId === c.id ? "border-violet-500 ring-2 ring-violet-200 shadow-md" : "border-transparent hover:border-slate-300"}`}
                        >
                          <div className="aspect-square bg-slate-50">
                            {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt={c.filename} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-200 text-[10px]">{c.filename}</div>}
                          </div>
                          <div className="p-1.5 bg-white">
                            <p className="text-[9px] font-semibold text-slate-700 truncate">{c.companyName}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Text Placeholder Values ── */}
                {(() => {
                  const allTextSlots = activePresTemplate.pages.flatMap(p => p.textSlots || []);
                  if (allTextSlots.length === 0) return null;
                  // Deduplicate by placeholder
                  const uniquePlaceholders = [...new Set(allTextSlots.map(ts => ts.placeholder))];
                  const LABELS: Record<string, string> = {
                    "{{CLIENT_NAME}}": "Kundenavn",
                    "{{COMPANY}}": "Virksomhed",
                    "{{DATE}}": "Dato",
                    "{{PRICE}}": "Pris",
                    "{{ADDRESS}}": "Adresse",
                    "{{CITY}}": "By",
                    "{{PERIOD}}": "Periode",
                    "{{CUSTOM}}": "Brugerdefineret",
                  };
                  return (
                    <div className="px-6 pb-4">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Tekst-placeholders</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {uniquePlaceholders.map(ph => (
                          <div key={ph}>
                            <label className="text-[10px] font-semibold text-slate-600 mb-1 block">{LABELS[ph] || ph}</label>
                            <input
                              type="text"
                              value={presTextValues[ph] || ""}
                              onChange={e => setPresTextValues(prev => ({ ...prev, [ph]: e.target.value }))}
                              placeholder={LABELS[ph] || ph}
                              className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                  <button onClick={() => setActivePresTemplate(null)} className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-xl">Annuller</button>
                  <button
                    disabled={!presCreativeId || presGenerating}
                    onClick={async () => {
                      if (!presCreativeId || !activePresTemplate) return;
                      setPresGenerating(true);
                      try {
                        // Build slot assignments: each slot with a linked frame gets the creative
                        // Overrides are keyed by frameId so all slots sharing a frame get the same assignments
                        const slotAssignments: Record<string, { frameId: string; creativeId: string; creativeAssignments?: Record<number, string> }> = {};
                        for (const page of activePresTemplate.pages) {
                          for (const slot of page.imageSlots) {
                            if (slot.linkedFrameId) {
                              const sa: typeof slotAssignments[string] = { frameId: slot.linkedFrameId, creativeId: presCreativeId };
                              // Add per-placement overrides if in "different" mode (keyed by frameId)
                              if (!presUseSameCreative && presPlacementOverrides[slot.linkedFrameId]) {
                                sa.creativeAssignments = presPlacementOverrides[slot.linkedFrameId];
                              }
                              slotAssignments[slot.id] = sa;
                            }
                          }
                        }

                        if (Object.keys(slotAssignments).length === 0) {
                          toast("Ingen billedpladser er linket til frames", "error");
                          return;
                        }

                        const res = await fetch("/api/ooh/generate-presentation", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            templateId: activePresTemplate.id,
                            slotAssignments,
                            textValues: Object.keys(presTextValues).length > 0 ? presTextValues : undefined,
                          }),
                        });

                        const contentType = res.headers.get("content-type") || "";
                        if (!res.ok || contentType.includes("application/json")) {
                          const err = await res.json().catch(() => ({ error: "Generation failed" }));
                          throw new Error(err.error || "Generation failed");
                        }

                        // Download the PDF
                        const blob = await res.blob();
                        const downloadUrl = window.URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.style.display = "none";
                        a.href = downloadUrl;
                        a.download = `Oplaeg-${activePresTemplate.name.replace(/\s+/g, "-")}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        setTimeout(() => {
                          window.URL.revokeObjectURL(downloadUrl);
                          document.body.removeChild(a);
                        }, 200);

                        toast("Oplæg genereret og downloadet!", "success");
                        setActivePresTemplate(null);
                      } catch (err) {
                        toast(err instanceof Error ? err.message : "Fejl ved generering", "error");
                      } finally {
                        setPresGenerating(false);
                      }
                    }}
                    className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-sm font-semibold rounded-xl shadow-sm flex items-center gap-2"
                  >
                    {presGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                        Genererer...
                      </>
                    ) : (
                      <>
                        <Ic d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" className="w-4 h-4" />
                        Generer & download PDF
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ OUTREACH ═══ */}
      {tab === "outreach" && (
        <OOHOutreach
          frames={frames as any}
          creatives={creatives as any}
          networks={networks as any}
          presTemplates={presTemplates as any}
          onToast={toast}
        />
      )}

      {/* ═══ TEMPLATE EDITOR (full-width overlay) ═══ */}
      {tab === "oplaeg" && presEditorOpen && activePresTemplate && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style={{ height: "calc(100vh - 200px)" }}>
          <TemplateEditor
            pdfUrl={activePresTemplate.pdfFileUrl}
            pages={activePresTemplate.pages}
            frames={frames as import("@/lib/ooh/types").Frame[]}
            templateName={activePresTemplate.name}
            onNameChange={async (newName) => {
              const updated = { ...activePresTemplate, name: newName.trim(), updatedAt: new Date().toISOString() };
              setActivePresTemplate(updated);
              setPresTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
              try {
                const res = await fetch("/api/ooh/presentation-templates", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: updated.id, name: updated.name, pages: updated.pages }),
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  toast(data?.error || "Kunne ikke gemme navn", "error");
                }
              } catch (err) {
                console.error("[OOH] Template name save failed", err);
                toast("Kunne ikke gemme navn", "error");
              }
            }}
            onPagesChange={(newPages) => {
              const updated = { ...activePresTemplate, pages: newPages };
              setActivePresTemplate(updated);

              // Debounce save to avoid request storm (e.g. on every drag)
              presSavePendingRef.current = { id: updated.id, pages: newPages };
              if (presSaveTimeoutRef.current) clearTimeout(presSaveTimeoutRef.current);
              presSaveTimeoutRef.current = setTimeout(async () => {
                presSaveTimeoutRef.current = null;
                const pending = presSavePendingRef.current;
                presSavePendingRef.current = null;
                if (!pending) return;
                try {
                  const res = await fetch("/api/ooh/presentation-templates", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: pending.id, pages: pending.pages }),
                  });
                  if (res.ok) {
                    setPresTemplates(prev => prev.map(t => t.id === pending.id ? { ...t, pages: pending.pages, updatedAt: new Date().toISOString() } : t));
                  } else {
                    const data = await res.json().catch(() => ({}));
                    toast(data?.error || "Kunne ikke gemme skabelon-ændringer", "error");
                  }
                } catch (err) {
                  console.error("[OOH] Template save failed", err);
                  toast("Kunne ikke gemme skabelon-ændringer", "error");
                }
              }, 800);
            }}
            onClose={() => { setPresEditorOpen(false); fetchPresTemplates(); }}
          />
        </div>
      )}

      {/* Frame edit modal */}
      {editModalFrame && <FrameEditModal frame={editModalFrame} onSave={updates => saveFrameMetadata(editModalFrame.id, updates)} onClose={() => setEditModalFrame(null)} />}

      {/* Upload indicator */}
      {uploading && (
        <div className="fixed bottom-6 right-6 z-50 px-5 py-3 bg-white border border-slate-200 rounded-xl shadow-lg flex items-center gap-3">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-200 border-t-violet-600" />
          <span className="text-sm font-medium text-slate-700">Uploader...</span>
        </div>
      )}

      {/* Creative naming modal */}
      {pendingCreativeUpload && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setPendingCreativeUpload(null); setCreativeNameInput(""); }}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-2">
              <h3 className="text-lg font-bold text-slate-900 mb-1">Navngiv creative</h3>
              <p className="text-sm text-slate-500">Giv dette creative et beskrivende navn, så det er nemt at finde igen.</p>
            </div>
            {/* Preview */}
            <div className="px-6 py-3">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-white border border-slate-200 shrink-0">
                  <img src={URL.createObjectURL(pendingCreativeUpload.file)} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-400 truncate">{pendingCreativeUpload.file.name}</p>
                  <p className="text-[10px] text-slate-300">{(pendingCreativeUpload.file.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
            </div>
            {/* Name input */}
            <div className="px-6 pb-3">
              <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Navn</label>
              <input
                type="text"
                autoFocus
                value={creativeNameInput}
                onChange={e => setCreativeNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") confirmCreativeUpload(); }}
                placeholder="f.eks. Carlsberg Forår 2026"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none transition-all"
              />
            </div>
            {/* Actions */}
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => { setPendingCreativeUpload(null); setCreativeNameInput(""); }}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Annuller
              </button>
              <button
                onClick={confirmCreativeUpload}
                disabled={uploading}
                className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                    Uploader...
                  </>
                ) : (
                  <>
                    <Ic d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" className="w-4 h-4" />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Modal ── */}
      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        detail={confirmModal.detail}
        variant={confirmModal.variant}
        confirmLabel={confirmModal.confirmLabel}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
