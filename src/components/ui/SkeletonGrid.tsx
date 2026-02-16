"use client";

interface SkeletonGridProps {
  count?: number;
  columns?: string;
  aspect?: string;
}

/** Animated skeleton grid for loading states */
export default function SkeletonGrid({ count = 8, columns = "grid-cols-2 md:grid-cols-3 lg:grid-cols-4", aspect = "aspect-[4/3]" }: SkeletonGridProps) {
  return (
    <div className={`grid ${columns} gap-4`}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/80 overflow-hidden bg-white animate-pulse">
          <div className={`${aspect} bg-slate-100`} />
          <div className="p-3 space-y-2">
            <div className="h-3.5 bg-slate-100 rounded-md w-3/4" />
            <div className="flex gap-1.5">
              <div className="h-3 bg-slate-100 rounded-md w-12" />
              <div className="h-3 bg-slate-100 rounded-md w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
