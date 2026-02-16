"use client";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  // Campaign / general
  draft: { bg: "bg-slate-100", text: "text-slate-600", label: "Kladde" },
  active: { bg: "bg-blue-100", text: "text-blue-700", label: "Aktiv" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Fuldført" },
  cancelled: { bg: "bg-red-100", text: "text-red-700", label: "Annulleret" },
  // Send statuses
  queued: { bg: "bg-slate-100", text: "text-slate-600", label: "I kø" },
  sending: { bg: "bg-amber-100", text: "text-amber-700", label: "Sender..." },
  sent: { bg: "bg-blue-100", text: "text-blue-700", label: "Sendt" },
  opened: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Åbnet" },
  clicked: { bg: "bg-violet-100", text: "text-violet-700", label: "Klikket" },
  replied: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Besvaret" },
  meeting: { bg: "bg-cyan-100", text: "text-cyan-700", label: "Møde" },
  closed: { bg: "bg-green-100", text: "text-green-700", label: "Solgt" },
  bounced: { bg: "bg-red-100", text: "text-red-600", label: "Fejlet" },
  rejected: { bg: "bg-red-100", text: "text-red-700", label: "Afvist" },
  // Proposal statuses
  pending: { bg: "bg-amber-100", text: "text-amber-700", label: "Afventer" },
  done: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Færdig" },
  error: { bg: "bg-red-100", text: "text-red-700", label: "Fejl" },
};

interface StatusBadgeProps {
  status: string;
  /** Override label text */
  label?: string;
  size?: "xs" | "sm";
}

export default function StatusBadge({ status, label, size = "xs" }: StatusBadgeProps) {
  const s = STATUS_STYLES[status] || { bg: "bg-slate-100", text: "text-slate-600", label: status };
  const sizeClasses = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5";

  return (
    <span className={`inline-flex items-center font-semibold rounded-md ${s.bg} ${s.text} ${sizeClasses}`}>
      {label || s.label}
    </span>
  );
}

/** Utility: get style info for a status without rendering */
export function getStatusStyle(status: string) {
  return STATUS_STYLES[status] || { bg: "bg-slate-100", text: "text-slate-600", label: status };
}
