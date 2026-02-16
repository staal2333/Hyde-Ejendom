"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ── Inject ping animation for urgent markers ── */
if (typeof document !== "undefined") {
  const styleId = "scaffolding-map-keyframes";
  if (!document.getElementById(styleId)) {
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@keyframes ping{75%,100%{transform:scale(2);opacity:0}}`;
    document.head.appendChild(style);
  }
}

/* ── Score → color mapping (green = high score, amber = medium, red = low) ── */
function scoreColor(score: number): string {
  if (score >= 8) return "#10b981"; // emerald-500
  if (score >= 6) return "#3b82f6"; // blue-500
  if (score >= 4) return "#f59e0b"; // amber-500
  return "#ef4444"; // red-500
}

/* ── Category ring color (subtle outer ring) ── */
const GROUP_RING: Record<string, string> = {
  Stilladsreklamer: "#8b5cf6", // violet-500
  Stilladser:       "#6366f1", // indigo-500
};

/* ── SVG circle marker with score-based color + optional pulse ── */
function createIcon(score: number, type: string, selected: boolean, daysLeft?: number) {
  const color = scoreColor(score);
  const ring = GROUP_RING[type] || "#94a3b8";
  const size = selected ? 22 : 14;
  const isUrgent = daysLeft != null && daysLeft <= 14 && daysLeft > 0;
  const isExpired = daysLeft != null && daysLeft <= 0;

  return L.divIcon({
    className: "",
    iconSize: [size + 6, size + 6],
    iconAnchor: [(size + 6) / 2, (size + 6) / 2],
    html: `<div style="position:relative;width:${size + 6}px;height:${size + 6}px;display:flex;align-items:center;justify-content:center">
      ${isUrgent ? `<div style="position:absolute;inset:-3px;border-radius:50%;border:2px solid ${color};opacity:0.4;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite"></div>` : ""}
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${isExpired ? "#94a3b8" : color};
        border:${selected ? `3px solid ${ring}` : `2px solid #fff`};
        box-shadow:0 1px 6px rgba(0,0,0,0.25);
        ${selected ? "z-index:999;" : ""}
        ${isExpired ? "opacity:0.5;" : ""}
      "></div>
      ${selected ? `<div style="position:absolute;top:-2px;right:-2px;width:8px;height:8px;border-radius:50%;background:${ring};border:1px solid #fff"></div>` : ""}
    </div>`,
  });
}

export interface MapPermit {
  address: string;
  type: string;
  category: string;
  score: number;
  lat: number;
  lng: number;
  applicant: string;
  period: string;
  createdDate?: string;
  durationWeeks?: number;
  traffic?: string;
  daysLeft?: number;
}

interface Props {
  permits: MapPermit[];
  activeCategories: Set<string>;
  selectedIdx: number | null;
  onSelect: (idx: number | null) => void;
  height?: number;
}

export default function ScaffoldingMap({
  permits,
  activeCategories,
  selectedIdx,
  onSelect,
  height = 500,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  /* Init map once */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [55.676, 12.568], // Copenhagen default
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    // Attribution at bottom-right, small
    L.control.attribution({ position: "bottomright", prefix: false })
      .addAttribution('&copy; <a href="https://carto.com/">CARTO</a>')
      .addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  /* Update markers when data/filter changes */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const visible = permits.filter(
      (p) => p.lat && p.lng && activeCategories.has(p.type)
    );

    if (visible.length === 0) return;

    const bounds: L.LatLngExpression[] = [];

    visible.forEach((p) => {
      const origIdx = permits.indexOf(p);
      const isSelected = origIdx === selectedIdx;
      const color = scoreColor(p.score);
      const icon = createIcon(p.score, p.type, isSelected, p.daysLeft);

      const marker = L.marker([p.lat, p.lng], { icon, zIndexOffset: isSelected ? 1000 : 0 })
        .addTo(map);

      // Timeline bar for popup
      const dLeft = p.daysLeft;
      const totalDays = (p.durationWeeks || 0) * 7;
      const elapsed = totalDays > 0 && dLeft != null ? Math.max(0, totalDays - dLeft) : 0;
      const pctElapsed = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;
      const timelineColor = dLeft != null && dLeft <= 14 ? "#ef4444" : dLeft != null && dLeft <= 60 ? "#f59e0b" : "#10b981";
      const timelineHtml = totalDays > 0 ? `
        <div style="margin:6px 0 2px;background:#e2e8f0;border-radius:4px;height:5px;overflow:hidden">
          <div style="width:${pctElapsed}%;height:100%;background:${timelineColor};border-radius:4px;transition:width 0.3s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:#94a3b8">
          <span>${elapsed}d forbi</span>
          <span>${dLeft != null && dLeft > 0 ? `${dLeft}d tilbage` : dLeft === 0 ? "Slutter i dag" : "Udloebet"}</span>
        </div>` : "";

      marker.bindPopup(
        `<div style="font-family:system-ui;font-size:12px;max-width:260px;line-height:1.4">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">${p.address}</div>
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
            <span style="background:${color};color:#fff;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700">Score ${p.score}/10</span>
            <span style="background:${GROUP_RING[p.type] || "#94a3b8"};color:#fff;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:600">${p.type === "Stilladsreklamer" ? "Reklame" : "Stillads"}</span>
            ${p.traffic ? `<span style="font-size:10px;color:#475569;font-weight:600">${p.traffic}/d trafik</span>` : ""}
          </div>
          ${p.applicant ? `<div style="font-size:11px;color:#475569"><b>Entrepr:</b> ${p.applicant}</div>` : ""}
          <div style="font-size:11px;color:#475569;margin-top:2px">${p.period}</div>
          ${p.createdDate ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px">Oprettet: ${p.createdDate}</div>` : ""}
          ${timelineHtml}
        </div>`,
        { closeButton: false, maxWidth: 280 }
      );

      marker.on("click", () => onSelect(origIdx));

      bounds.push([p.lat, p.lng]);
      markersRef.current.push(marker);
    });

    // Fit bounds
    if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds as L.LatLngTuple[]), { padding: [40, 40], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0] as L.LatLngTuple, 15);
    }
  }, [permits, activeCategories, selectedIdx, onSelect]);

  /* Pan to selected marker */
  useEffect(() => {
    if (selectedIdx === null || !mapRef.current) return;
    const p = permits[selectedIdx];
    if (p?.lat && p?.lng) {
      mapRef.current.panTo([p.lat, p.lng], { animate: true });
    }
  }, [selectedIdx, permits]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: "16px", overflow: "hidden" }}
      className="border border-slate-200/60 shadow-[var(--card-shadow)]"
    />
  );
}
