"use client";

import dynamic from "next/dynamic";
import type { MapPermit } from "./ScaffoldingMap";

const ScaffoldingMap = dynamic(() => import("./ScaffoldingMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-[500px] bg-slate-50 rounded-2xl border border-slate-200/80">
      <div className="flex items-center gap-3 text-slate-400">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-slate-500" />
        <span className="text-sm">Indlæser kort...</span>
      </div>
    </div>
  ),
});

export default ScaffoldingMap;
export type { MapPermit };
