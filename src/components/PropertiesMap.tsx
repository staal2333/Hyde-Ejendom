"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getStatusConfig } from "@/lib/statusConfig";
import type { PropertyItem } from "@/contexts/DashboardContext";

function statusToColor(status: string): string {
  const c = getStatusConfig(status);
  if (c.stripe.includes("emerald")) return "#10b981";
  if (c.stripe.includes("green")) return "#22c55e";
  if (c.stripe.includes("amber") || c.stripe.includes("orange")) return "#f59e0b";
  if (c.stripe.includes("blue") || c.stripe.includes("indigo")) return "#6366f1";
  if (c.stripe.includes("red") || c.stripe.includes("rose")) return "#ef4444";
  return "#64748b";
}

function createMarkerIcon(status: string, selected: boolean) {
  const color = statusToColor(status);
  const size = selected ? 20 : 14;
  return L.divIcon({
    className: "",
    iconSize: [size + 6, size + 6],
    iconAnchor: [(size + 6) / 2, (size + 6) / 2],
    html: `<div style="
      width:${size + 6}px;height:${size + 6}px;display:flex;align-items:center;justify-content:center">
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};
        border:${selected ? "3px solid #1e293b" : "2px solid #fff"};
        box-shadow:0 1px 6px rgba(0,0,0,0.25);
      "></div>
    </div>`,
  });
}

export interface PropertyMapPoint {
  id: string;
  lat: number;
  lng: number;
  property: PropertyItem;
}

interface PropertiesMapProps {
  points: PropertyMapPoint[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenDetail: (id: string) => void;
  height?: number;
}

export default function PropertiesMap({
  points,
  selectedId,
  onSelect,
  onOpenDetail,
  height = 420,
}: PropertiesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [55.676, 12.568],
      zoom: 12,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 19,
      subdomains: "abcd",
    }).addTo(map);

    L.control.attribution({ position: "bottomright", prefix: false })
      .addAttribution('&copy; <a href="https://carto.com/">CARTO</a>')
      .addTo(map);

    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => {
        try {
          m.remove();
        } catch {
          // ignore
        }
      });
      markersRef.current = [];
      try {
        mapRef.current?.remove();
      } catch {
        // ignore
      }
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container || !document.contains(container)) return;

    markersRef.current.forEach((m) => {
      try {
        m.remove();
      } catch {
        // ignore
      }
    });
    markersRef.current = [];

    if (points.length === 0) return;

    const bounds: L.LatLngExpression[] = [];

    points.forEach((pt) => {
      const isSelected = pt.id === selectedId;
      const icon = createMarkerIcon(pt.property.outreachStatus, isSelected);
      const marker = L.marker([pt.lat, pt.lng], {
        icon,
        zIndexOffset: isSelected ? 1000 : 0,
      }).addTo(map);

      const status = getStatusConfig(pt.property.outreachStatus);
      const html = `
        <div style="font-family:system-ui;font-size:12px;max-width:280px;line-height:1.4">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">${pt.property.name || pt.property.address}</div>
          <div style="font-size:11px;color:#475569;margin-bottom:6px">${pt.property.address}, ${pt.property.postalCode} ${pt.property.city}</div>
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
            <span style="background:${statusToColor(pt.property.outreachStatus)};color:#fff;padding:2px 8px;border-radius:5px;font-size:10px;font-weight:700">${status.label}</span>
            ${pt.property.ownerCompanyName ? `<span style="font-size:10px;color:#475569">${pt.property.ownerCompanyName}</span>` : ""}
          </div>
          ${pt.property.primaryContact?.email ? `<div style="font-size:11px;color:#6366f1">${pt.property.primaryContact.email}</div>` : ""}
          <button data-id="${pt.id}" style="margin-top:8px;padding:4px 10px;background:#4f46e5;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">Se detaljer</button>
        </div>`;

      marker.bindPopup(html, { maxWidth: 300 });
      marker.on("popupopen", () => {
        const btn = document.querySelector(`[data-id="${pt.id}"]`);
        btn?.addEventListener("click", () => {
          onOpenDetail(pt.id);
          map.closePopup();
        });
      });

      marker.on("click", () => onSelect(pt.id));
      bounds.push([pt.lat, pt.lng]);
      markersRef.current.push(marker);
    });

    if (bounds.length > 1) {
      try {
        if (document.contains(containerRef.current!)) {
          map.fitBounds(L.latLngBounds(bounds as L.LatLngTuple[]), {
            padding: [24, 24],
            maxZoom: 15,
            animate: false,
          });
        }
      } catch {
        // ignore
      }
    } else if (bounds.length === 1) {
      try {
        if (document.contains(containerRef.current!)) {
          map.setView(bounds[0] as L.LatLngTuple, 14, { animate: false });
        }
      } catch {
        // ignore
      }
    }
  }, [points, selectedId, onSelect, onOpenDetail]);

  useEffect(() => {
    const map = mapRef.current;
    if (selectedId === null || !map) return;
    const pt = points.find((p) => p.id === selectedId);
    if (pt) {
      try {
        map.panTo([pt.lat, pt.lng], { animate: false });
      } catch {
        // ignore
      }
    }
  }, [selectedId, points]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: "16px", overflow: "hidden" }}
      className="border border-slate-200/60 shadow-[var(--card-shadow)]"
    />
  );
}
