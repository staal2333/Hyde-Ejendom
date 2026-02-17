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

  return (
    <div className={`score-ring ${bgColor}`}>
      <div
        className={`w-full h-full rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-extrabold text-xs shadow-sm`}
      >
        {score}
      </div>
    </div>
  );
}
