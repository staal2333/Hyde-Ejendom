"use client";

export function PipelineStat({ label, value, color, icon, active, onClick }: {
  label: string;
  value: number;
  color: string;
  icon: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const colorMap: Record<string, { bg: string; text: string; iconBg: string; iconText: string; ring: string }> = {
    slate: { bg: "bg-white", text: "text-slate-900", iconBg: "bg-slate-100", iconText: "text-slate-500", ring: "ring-slate-300" },
    amber: { bg: "bg-white", text: "text-amber-600", iconBg: "bg-amber-50", iconText: "text-amber-500", ring: "ring-amber-300" },
    blue: { bg: "bg-white", text: "text-blue-600", iconBg: "bg-blue-50", iconText: "text-blue-500", ring: "ring-blue-300" },
    indigo: { bg: "bg-white", text: "text-indigo-600", iconBg: "bg-indigo-50", iconText: "text-indigo-500", ring: "ring-indigo-300" },
    green: { bg: "bg-white", text: "text-green-600", iconBg: "bg-green-50", iconText: "text-green-500", ring: "ring-green-300" },
    emerald: { bg: "bg-white", text: "text-emerald-600", iconBg: "bg-emerald-50", iconText: "text-emerald-500", ring: "ring-emerald-300" },
  };
  const c = colorMap[color] || colorMap.slate;

  return (
    <button onClick={onClick}
      className={`${c.bg} rounded-2xl border shadow-[var(--card-shadow)] p-4 hover:shadow-[var(--card-shadow-hover)] transition-all text-left w-full ${
        active ? `border-2 ${c.ring} ring-1 ${c.ring}` : "border-slate-200/60"
      }`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center`}>
          <svg className={`w-4 h-4 ${c.iconText}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        {active && (
          <div className={`w-2 h-2 rounded-full ${c.iconBg}`}>
            <div className={`w-full h-full rounded-full ${c.iconText.replace("text-", "bg-")}`} />
          </div>
        )}
      </div>
      <div className={`text-2xl font-extrabold tabular-nums ${c.text}`}>{value}</div>
      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{label}</div>
    </button>
  );
}
