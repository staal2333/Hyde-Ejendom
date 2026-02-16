"use client";

import Ic from "./Icon";

export interface Tab<T extends string = string> {
  id: T;
  label: string;
  count?: number;
  icon: string;
}

interface TabBarProps<T extends string = string> {
  tabs: Tab<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Smaller variant for sub-tabs */
  size?: "default" | "small";
}

export default function TabBar<T extends string>({ tabs, active, onChange, size = "default" }: TabBarProps<T>) {
  const isSmall = size === "small";

  return (
    <div className={`flex items-center gap-1 ${isSmall ? "bg-slate-50/80" : "bg-slate-100/80"} p-1 rounded-xl w-fit`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative flex items-center gap-1.5 ${
            isSmall ? "px-3 py-1.5 text-[11px]" : "px-4 py-2 text-xs"
          } rounded-lg font-semibold transition-all ${
            active === t.id
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Ic d={t.icon} className={isSmall ? "w-3 h-3" : "w-3.5 h-3.5"} />
          {t.label}
          {!!t.count && (
            <span
              className={`font-bold px-1.5 py-0.5 rounded-md ${
                isSmall ? "text-[9px]" : "text-[10px]"
              } ${
                active === t.id
                  ? "bg-violet-100 text-violet-600"
                  : "bg-slate-200/80 text-slate-500"
              }`}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
