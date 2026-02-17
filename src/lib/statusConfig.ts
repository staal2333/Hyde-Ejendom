/**
 * Shared status configuration for outreach pipeline (HubSpot statuses).
 * Used by dashboard, properties tab, and other components.
 */

export const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; dot: string; icon: string; stripe: string; filterKey: string }
> = {
  NY_KRAEVER_RESEARCH: {
    label: "Ny",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200/60",
    dot: "bg-gradient-to-br from-amber-400 to-orange-400",
    stripe: "bg-gradient-to-b from-amber-400 to-orange-400",
    icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
    filterKey: "pending",
  },
  RESEARCH_IGANGSAT: {
    label: "Researching",
    color: "text-blue-700",
    bg: "bg-blue-50 border-blue-200/60",
    dot: "bg-gradient-to-br from-blue-400 to-indigo-400 animate-gentle-pulse",
    stripe: "bg-gradient-to-b from-blue-400 to-indigo-500",
    icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3",
    filterKey: "researching",
  },
  RESEARCH_DONE_CONTACT_PENDING: {
    label: "Researched",
    color: "text-indigo-700",
    bg: "bg-indigo-50 border-indigo-200/60",
    dot: "bg-gradient-to-br from-indigo-400 to-purple-400",
    stripe: "bg-gradient-to-b from-indigo-400 to-purple-500",
    icon: "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.62 48.62 0 0112 20.904a48.62 48.62 0 018.232-4.41 60.46 60.46 0 00-.491-6.347",
    filterKey: "researched",
  },
  KLAR_TIL_UDSENDELSE: {
    label: "Klar",
    color: "text-green-700",
    bg: "bg-green-50 border-green-200/60",
    dot: "bg-gradient-to-br from-green-400 to-emerald-400",
    stripe: "bg-gradient-to-b from-green-400 to-emerald-500",
    icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    filterKey: "ready",
  },
  FOERSTE_MAIL_SENDT: {
    label: "Sendt",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200/60",
    dot: "bg-gradient-to-br from-emerald-400 to-teal-400",
    stripe: "bg-gradient-to-b from-emerald-400 to-teal-500",
    icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
    filterKey: "sent",
  },
  FEJL: {
    label: "Fejl",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200/60",
    dot: "bg-gradient-to-br from-red-400 to-rose-400",
    stripe: "bg-gradient-to-b from-red-400 to-rose-500",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z",
    filterKey: "error",
  },
};

export function getStatusConfig(status: string) {
  return (
    STATUS_CONFIG[status] || {
      label: status,
      color: "text-gray-700",
      bg: "bg-gray-50 border-gray-200/60",
      dot: "bg-gray-400",
      stripe: "bg-gray-400",
      icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      filterKey: "unknown",
    }
  );
}

export const STATUS_TO_FILTER: Record<string, string> = {
  NY_KRAEVER_RESEARCH: "pending",
  RESEARCH_IGANGSAT: "researching",
  RESEARCH_DONE_CONTACT_PENDING: "researched",
  KLAR_TIL_UDSENDELSE: "ready",
  FOERSTE_MAIL_SENDT: "sent",
  FEJL: "error",
};
