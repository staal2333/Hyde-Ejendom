"use client";

import { useEffect, useRef, useState, useMemo } from "react";

export interface CommandPaletteTab {
  id: string;
  label: string;
}

export interface CommandPaletteProperty {
  id: string;
  name: string;
  address?: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  tabs: CommandPaletteTab[];
  setActiveTab: (id: string) => void;
  properties?: CommandPaletteProperty[];
  onSelectProperty?: (id: string) => void;
}

type Item = { type: "tab"; id: string; label: string } | { type: "property"; id: string; label: string; sub?: string };

export function CommandPalette({
  open,
  onClose,
  tabs,
  setActiveTab,
  properties = [],
  onSelectProperty,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo((): Item[] => {
    const q = query.trim().toLowerCase();
    const tabItems: Item[] = tabs
      .filter((t) => !q || t.label.toLowerCase().includes(q))
      .map((t) => ({ type: "tab" as const, id: t.id, label: t.label }));
    const propItems: Item[] = [];
    if (properties.length > 0 && (onSelectProperty || !q)) {
      const filtered = q
        ? properties.filter(
            (p) =>
              p.name?.toLowerCase().includes(q) ||
              p.address?.toLowerCase().includes(q)
          )
        : properties.slice(0, 8);
      filtered.forEach((p) =>
        propItems.push({
          type: "property",
          id: p.id,
          label: p.name || p.address || p.id,
          sub: p.address,
        })
      );
    }
    return [...tabItems, ...propItems];
  }, [query, tabs, properties, onSelectProperty]);

  const visibleCount = items.length;
  const selected = items[Math.min(selectedIndex, visibleCount - 1)] ?? null;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(0, visibleCount - 1)));
  }, [visibleCount]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowDown") {
        setSelectedIndex((i) => Math.min(i + 1, visibleCount - 1));
        e.preventDefault();
        return;
      }
      if (e.key === "ArrowUp") {
        setSelectedIndex((i) => Math.max(i - 1, 0));
        e.preventDefault();
        return;
      }
      if (e.key === "Enter" && selected) {
        if (selected.type === "tab") {
          setActiveTab(selected.id);
          onClose();
        } else if (selected.type === "property" && onSelectProperty) {
          onSelectProperty(selected.id);
          setActiveTab("properties");
          onClose();
        }
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, visibleCount, selected, setActiveTab, onClose, onSelectProperty]);

  useEffect(() => {
    if (!selected || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex, selected]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-label="Kommando-palette"
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <svg
            className="w-5 h-5 text-slate-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Søg faner eller ejendomme..."
            className="flex-1 min-w-0 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={selected ? `item-${selectedIndex}` : undefined}
          />
          <kbd className="hidden sm:inline text-[10px] text-slate-400 font-mono px-1.5 py-0.5 rounded bg-slate-100">
            Esc
          </kbd>
        </div>
        <div
          id="command-palette-list"
          ref={listRef}
          className="max-h-[min(60vh,400px)] overflow-y-auto py-2"
          role="listbox"
        >
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              Ingen resultater
            </div>
          ) : (
            items.map((item, i) => (
              <button
                key={item.type + item.id + i}
                type="button"
                data-index={i}
                id={`item-${i}`}
                role="option"
                aria-selected={i === selectedIndex}
                onClick={() => {
                  if (item.type === "tab") {
                    setActiveTab(item.id);
                    onClose();
                  } else if (item.type === "property" && onSelectProperty) {
                    onSelectProperty(item.id);
                    setActiveTab("properties");
                    onClose();
                  }
                }}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                  i === selectedIndex
                    ? "bg-indigo-50 text-indigo-900"
                    : "text-slate-800 hover:bg-slate-50"
                }`}
              >
                {item.type === "tab" ? (
                  <span className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-mono text-slate-500 shrink-0">
                    {i < 9 ? i + 1 : "0"}
                  </span>
                ) : (
                  <span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <svg
                      className="w-3.5 h-3.5 text-emerald-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75"
                      />
                    </svg>
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{item.label}</div>
                  {item.type === "property" && item.sub && (
                    <div className="text-[11px] text-slate-500 truncate">
                      {item.sub}
                    </div>
                  )}
                </div>
                {item.type === "tab" && (
                  <span className="text-[10px] text-slate-400 shrink-0">
                    Gå til fane
                  </span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
          <span>↑↓ vælg · Enter åbn · Esc luk</span>
          <span>⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
