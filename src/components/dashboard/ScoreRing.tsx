"use client";

export function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 8
      ? "from-green-500 to-emerald-500"
      : score >= 6
        ? "from-brand-500 to-blue-500"
        : score >= 4
          ? "from-amber-500 to-orange-500"
          : "from-red-400 to-rose-400";
  const bgColor =
    score >= 8 ? "bg-green-50" : score >= 6 ? "bg-brand-50" : score >= 4 ? "bg-amber-50" : "bg-red-50";
  const ringColor =
    score >= 8 ? "ring-green-200/50" : score >= 6 ? "ring-brand-200/50" : score >= 4 ? "ring-amber-200/50" : "ring-red-200/50";
  const glowColor =
    score >= 8 ? "rgba(16,185,129,0.15)" : score >= 6 ? "rgba(99,102,241,0.15)" : score >= 4 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)";

  return (
    <div className={`score-ring ${bgColor} ring-2 ${ringColor}`}
      style={{ boxShadow: `0 2px 8px -2px rgba(0,0,0,0.12), 0 0 12px -2px ${glowColor}` }}
    >
      <div
        className={`w-full h-full rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-extrabold text-xs`}
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.1)" }}
      >
        {score}
      </div>
    </div>
  );
}
