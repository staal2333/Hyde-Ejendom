"use client";

import { formatTraffic } from "./utils";

export function TrafficBadge({ traffic, source }: { traffic: number; source?: string }) {
  const isHigh = traffic >= 20000;
  const isMed = traffic >= 10000;
  const color = isHigh
    ? "bg-green-50 text-green-700 border-green-200/60"
    : isMed
    ? "bg-amber-50 text-amber-700 border-amber-200/60"
    : "bg-red-50 text-red-700 border-red-200/60";

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${color}`}>
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
      ~{formatTraffic(traffic)}/dag
      {source && source !== "estimate" && (
        <span className="opacity-50 text-[9px]">({source === "vejdirektoratet" ? "VD" : "KK"})</span>
      )}
    </span>
  );
}
