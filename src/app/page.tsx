"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── Keyboard shortcuts (1–9, 0 = settings) ─────────────────
function useTabShortcuts(setActiveTab: (id: TabId) => void) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = e.key;
      if (key.length !== 1) return;
      const n = key === "0" ? 9 : parseInt(key, 10) - 1;
      if (n < 0 || n > 9) return;
      const tab = TABS[n];
      if (tab) {
        setActiveTab(tab.id);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setActiveTab]);
}
import type { OOHPanelProps } from "../components/OOHPanel";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { DashboardProvider, useDashboard } from "../contexts/DashboardContext";
import type { TabId } from "../contexts/DashboardContext";
import PinGate from "../components/PinGate";
import { ScaffoldingTab } from "../components/tabs/ScaffoldingTab";
import { HomeTab } from "../components/tabs/HomeTab";
import { DiscoverTab } from "../components/tabs/DiscoverTab";
import { StagingTab } from "../components/tabs/StagingTab";
import { OOHTab } from "../components/tabs/OOHTab";
import { TilbudTab } from "../components/tabs/TilbudTab";
import { IndbakkeTab } from "../components/tabs/IndbakkeTab";
import { PropertiesTab } from "../components/tabs/PropertiesTab";
import { ResearchTab } from "../components/tabs/ResearchTab";
import { StreetAgentTab } from "../components/tabs/StreetAgentTab";
import { OutreachTab } from "../components/tabs/OutreachTab";
import { SettingsTab } from "../components/tabs/SettingsTab";
import { LeadSourcingTab } from "../components/tabs/LeadSourcingTab";
import { LeadScannerTab } from "../components/tabs/LeadScannerTab";
import { ProgressBar, LogPanel, ResultStat, PipelineStat, PropertyCard } from "@/components/dashboard";
import { BriefingPanel } from "@/components/dashboard/BriefingPanel";
import { FollowUpPanel } from "@/components/dashboard/FollowUpPanel";
import { LeadIntelPanel } from "@/components/dashboard/LeadIntelPanel";
import { TilbudAgentPanel } from "@/components/dashboard/TilbudAgentPanel";
import FullCircleWizard from "../components/FullCircleWizard";
import { CommandPalette } from "../components/CommandPalette";

// ─── Types ──────────────────────────────────────────────────

interface DiscoveryResultData {
  success?: boolean;
  street: string;
  city: string;
  totalAddresses: number;
  afterPreFilter: number;
  afterTrafficFilter: number;
  afterScoring: number;
  created: number;
  skipped: number;
  alreadyExists: number;
  estimatedTraffic?: number;
  trafficSource?: string;
  candidates: ScoredCandidateData[];
  error?: string;
}

interface ScoredCandidateData {
  address: string;
  postalCode: string;
  city: string;
  area?: number;
  floors?: number;
  units?: number;
  usageText?: string;
  buildingYear?: number;
  outdoorScore: number;
  scoreReason: string;
  estimatedDailyTraffic?: number;
  trafficSource?: string;
}

interface DashboardData {
  totalProperties: number;
  pendingResearch: number;
  researchInProgress: number;
  researchDone: number;
  readyToSend: number;
  mailsSent: number;
  errors: number;
  byStatus: Record<string, number>;
  recentRuns: WorkflowRun[];
  lastRunAt: string | null;
  error?: string;
  staging?: {
    new: number;
    researching: number;
    researched: number;
    approved: number;
    rejected: number;
    pushed: number;
    awaitingAction: number;
    total: number;
  };
  analytics?: {
    emailQueue: { queued: number; sent: number; failed: number; sentThisHour: number; rateLimitPerHour: number };
    ooh: { totalSent: number; opened: number; clicked: number; replied: number; meetings: number; sold: number };
    funnel: { discovered: number; staged: number; approved: number; inHubSpot: number; ready: number; sent: number };
  };
}

interface WorkflowRun {
  propertyId: string;
  propertyName: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  steps: WorkflowStep[];
  error?: string;
}

interface WorkflowStep {
  stepId: string;
  stepName: string;
  status: string;
  details?: string;
  error?: string;
}

interface PropertyItem {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  outreachStatus: string;
  outdoorScore?: number;
  ownerCompanyName?: string;
  researchSummary?: string;
  emailDraftSubject?: string;
  emailDraftBody?: string;
  contactPerson?: string | null;
  contactEmail?: string | null;
  contactCount: number;
  primaryContact: {
    name: string | null;
    email: string | null;
    role: string | null;
  } | null;
  lastModifiedDate?: string | null;
}

interface ProgressEvent {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  candidates?: ScoredCandidateData[];
  result?: DiscoveryResultData;
  stats?: Record<string, number>;
  timestamp: number;
}

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  detail?: string;
}

// ─── Status Config ──────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string; icon: string; stripe: string; filterKey: string }> = {
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

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status] || {
    label: status,
    color: "text-gray-700",
    bg: "bg-gray-50 border-gray-200/60",
    dot: "bg-gray-400",
    stripe: "bg-gray-400",
    icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    filterKey: "unknown",
  };
}

const STATUS_TO_FILTER: Record<string, string> = {
  NY_KRAEVER_RESEARCH: "pending",
  RESEARCH_IGANGSAT: "researching",
  RESEARCH_DONE_CONTACT_PENDING: "researched",
  KLAR_TIL_UDSENDELSE: "ready",
  FOERSTE_MAIL_SENDT: "sent",
  FEJL: "error",
};

// ─── Tabs (consolidated navigation: 7 top-level items) ─────
interface NavTab {
  id: TabId;
  label: string;
  icon: string;
  desc: string;
  children?: { id: TabId; label: string }[];
}

const NAV_TABS: NavTab[] = [
  { id: "home", label: "Dashboard", desc: "Overblik", icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" },
  { id: "discover", label: "Discovery", desc: "Find ejendomme", icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z",
    children: [
      { id: "discover", label: "Vej-scan" },
      { id: "street_agent", label: "Gade-Agent" },
      { id: "scaffolding", label: "Stilladser" },
    ] },
  { id: "staging", label: "Staging", desc: "Godkend leads", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
  { id: "properties", label: "Ejendomme", desc: "Pipeline & research", icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75",
    children: [
      { id: "properties", label: "Pipeline" },
      { id: "research", label: "Research" },
    ] },
  { id: "lead_sourcing", label: "Leads", desc: "Lead funnel", icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z",
    children: [
      { id: "lead_sourcing", label: "Lead Funnel" },
      { id: "lead_scanner", label: "Lead Scanner" },
    ] },
  { id: "ooh", label: "Outreach", desc: "OOH & emails", icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V4.5A1.5 1.5 0 0020.25 3H3.75A1.5 1.5 0 002.25 4.5v15A1.5 1.5 0 003.75 21z",
    children: [
      { id: "ooh", label: "OOH Proposals" },
      { id: "outreach", label: "Email Kø" },
    ] },
  { id: "tilbud", label: "Tilbud", desc: "Builder & PDF", icon: "M9 12h6m-6 4h6M7.5 3h9A2.25 2.25 0 0118.75 5.25v13.5A2.25 2.25 0 0116.5 21h-9a2.25 2.25 0 01-2.25-2.25V5.25A2.25 2.25 0 017.5 3z" },
  { id: "indbakke", label: "Indbakke", desc: "Alle 3 mailkonti", icon: "M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z" },
  { id: "settings", label: "Indstillinger", desc: "System & regler", icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" },
];

function getNavTabForActive(activeTab: TabId): NavTab {
  for (const nav of NAV_TABS) {
    if (nav.id === activeTab) return nav;
    if (nav.children?.some(c => c.id === activeTab)) return nav;
  }
  return NAV_TABS[0];
}

// Flat list for keyboard shortcuts and command palette
const TABS = NAV_TABS.flatMap(nav =>
  nav.children ? nav.children.map(c => ({ id: c.id, label: c.label, icon: nav.icon, desc: nav.desc })) : [{ id: nav.id, label: nav.label, icon: nav.icon, desc: nav.desc }]
);

// ─── Sort Options ───────────────────────────────────────────
type SortKey = "name" | "status" | "score" | "owner";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Adresse" },
  { key: "status", label: "Status" },
  { key: "score", label: "Score" },
  { key: "owner", label: "Ejer" },
];

const STATUS_ORDER: Record<string, number> = {
  RESEARCH_IGANGSAT: 0,
  NY_KRAEVER_RESEARCH: 1,
  RESEARCH_DONE_CONTACT_PENDING: 2,
  KLAR_TIL_UDSENDELSE: 3,
  FOERSTE_MAIL_SENDT: 4,
  FEJL: 5,
};

// ─── Hook: filtreret data (isolerede useMemos for stabil hook-rækkefølge, undgår React #310) ──
function useFilteredDashboardData(
  properties: PropertyItem[],
  researchEvents: ProgressEvent[],
  opts: {
    propertyFilter: string;
    statusFilter: string | null;
    cityFilter: string;
    scoreFilter: [number, number];
    sortBy: SortKey;
    sortAsc: boolean;
    researchRunning: string | null;
  }
) {
  const safeProperties = properties ?? [];
  const safeResearchEvents = researchEvents ?? [];
  const availableCities = useMemo(() => {
    try {
      return [...new Set(safeProperties.map(p => p?.city).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "da"));
    } catch {
      return [];
    }
  }, [safeProperties]);
  const filteredProperties = useMemo(() => {
    try {
      const { propertyFilter: q, statusFilter: statusFilter, cityFilter: cityFilter, scoreFilter: scoreFilter, sortBy: sortBy, sortAsc: sortAsc } = opts;
      const qLower = q?.toLowerCase();
      return safeProperties
        .filter((p) => {
          if (qLower) {
            const matches = p.name?.toLowerCase().includes(qLower) || p.address?.toLowerCase().includes(qLower) || p.ownerCompanyName?.toLowerCase().includes(qLower) || p.city?.toLowerCase().includes(qLower);
            if (!matches) return false;
          }
          if (statusFilter) {
            const filterKey = STATUS_TO_FILTER[p.outreachStatus] || "unknown";
            if (filterKey !== statusFilter) return false;
          }
          if (cityFilter && p.city !== cityFilter) return false;
          const score = p.outdoorScore ?? 0;
          if (score < scoreFilter[0] || score > scoreFilter[1]) return false;
          return true;
        })
        .sort((a, b) => {
          let cmp = 0;
          switch (opts.sortBy) {
            case "name":
              cmp = (a.name || a.address || "").localeCompare(b.name || b.address || "", "da");
              break;
            case "status":
              cmp = (STATUS_ORDER[a.outreachStatus] ?? 99) - (STATUS_ORDER[b.outreachStatus] ?? 99);
              break;
            case "score":
              cmp = (b.outdoorScore ?? 0) - (a.outdoorScore ?? 0);
              break;
            case "owner":
              cmp = (a.ownerCompanyName || "zzz").localeCompare(b.ownerCompanyName || "zzz", "da");
              break;
          }
          return opts.sortAsc ? cmp : -cmp;
        });
    } catch {
      return [];
    }
  }, [safeProperties, opts.propertyFilter, opts.statusFilter, opts.cityFilter, opts.scoreFilter, opts.sortBy, opts.sortAsc]);
  const currentResearchProperty = useMemo(() => {
    try {
      return opts.researchRunning && opts.researchRunning !== "all" ? safeProperties.find(p => p.id === opts.researchRunning) ?? null : null;
    } catch {
      return null;
    }
  }, [opts.researchRunning, safeProperties]);
  const researchSummary = useMemo(() => {
    try {
      return {
        oisOwner: safeResearchEvents.find(e => e?.phase === "ois_owner_set" || e?.message?.includes("OIS officiel ejer"))?.message?.replace(/.*?:\s*/, "") ?? null,
        cvrCompany: safeResearchEvents.find(e => e?.phase === "cvr" && e?.message?.includes("CVR fundet"))?.message ?? null,
        contactsFound: safeResearchEvents.filter(e => e?.phase === "contact_create").length,
        emailsFound: safeResearchEvents.filter(e => e?.phase === "email_hunt_found" || e?.message?.includes("Email fundet")).length,
        totalSearches: safeResearchEvents.filter(e => e?.phase === "search_query").length,
        currentStep: safeResearchEvents.length > 0 ? safeResearchEvents[safeResearchEvents.length - 1]?.message ?? null : null,
      };
    } catch {
      return { oisOwner: null, cvrCompany: null, contactsFound: 0, emailsFound: 0, totalSearches: 0, currentStep: null };
    }
  }, [safeResearchEvents]);
  return { availableCities, filteredProperties, currentResearchProperty, researchSummary };
}

// ─── Main Dashboard ─────────────────────────────────────────

export default function Page() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const [mounted, setMounted] = useState(false);
  const { isAuthenticated, refreshActivity } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Same initial output on server and client to avoid hydration mismatch (auth is client-only).
  if (!mounted) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50" style={{ background: "var(--background)" }}>
        <div className="text-center animate-fade-in">
          <div className="relative w-14 h-14 mx-auto mb-5">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 animate-pulse" />
            <div className="absolute inset-0 rounded-2xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
              </svg>
            </div>
          </div>
          <p className="text-sm font-semibold text-slate-700">Ejendom AI</p>
          <p className="text-xs text-slate-400 mt-1">Indlæser...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <PinGate />;
  return (
    <div className="min-h-screen w-full flex" onMouseDown={refreshActivity} onKeyDown={refreshActivity} onTouchStart={refreshActivity}>
      <DashboardProvider>
        <DashboardContent />
      </DashboardProvider>
    </div>
  );
}

function DashboardContent() {
  const { logout } = useAuth();
  const {
    activeTab,
    setActiveTab,
    dashboard,
    properties,
    loading,
    error,
    setError,
    fetchDashboard,
    fetchProperties,
    fetchData,
    systemHealth,
    toasts,
    addToast,
    removeToast,
    scaffoldPeriodCounts,
    setScaffoldPeriodCounts,
    oohInitialFrame,
    setOohInitialFrame,
    oohInitialClient,
    setOohInitialClient,
    stagingResearch,
  } = useDashboard();

  useTabShortcuts(setActiveTab);

  // Discovery
  const [discoverStreet, setDiscoverStreet] = useState("");
  const [discoverCity, setDiscoverCity] = useState("København");
  const [discoverPostcodes, setDiscoverPostcodes] = useState("");
  const [discoverMinScore, setDiscoverMinScore] = useState(6);
  const [discoverMinTraffic, setDiscoverMinTraffic] = useState(10000);
  const [discoverMaxCandidates, setDiscoverMaxCandidates] = useState(50);
  const [discoveryRunning, setDiscoveryRunning] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResultData | null>(null);
  const [progressEvents, setProgressEvents] = useState<ProgressEvent[]>([]);
  const [progressPct, setProgressPct] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("");
  const progressLogRef = useRef<HTMLDivElement>(null);

  // Scaffolding
  const [scaffoldCity, setScaffoldCity] = useState("København");
  const [scaffoldRunning, setScaffoldRunning] = useState(false);
  const [scaffoldEvents, setScaffoldEvents] = useState<ProgressEvent[]>([]);
  const [scaffoldPct, setScaffoldPct] = useState(0);
  const [scaffoldReport, setScaffoldReport] = useState<{
    total: number; qualified: number; skipped: number;
    sources: { name: string; count: number }[];
    byType: Record<string, number>;
    topPermits: {
      address: string; score: number; scoreReason: string; traffic: string; trafficNum: number;
      type: string; category: string; startDate: string; endDate: string; createdDate: string;
      applicant: string; contractor: string; lat: number; lng: number; durationWeeks: number;
      description: string; facadeArea: string; sagsnr: string; contactPerson: string; contactEmail: string;
    }[];
    reportText: string;
  } | null>(null);
  const [scaffoldFilter, setScaffoldFilter] = useState<Set<string>>(new Set(["Stilladsreklamer", "Stilladser"]));
  const [scaffoldSort, setScaffoldSort] = useState<{ col: string; dir: "asc" | "desc" }>({ col: "score", dir: "desc" });
  const [scaffoldView, setScaffoldView] = useState<"table" | "map" | "split">("split");
  const [scaffoldSelectedIdx, setScaffoldSelectedIdx] = useState<number | null>(null);
  const scaffoldLogRef = useRef<HTMLDivElement>(null);
  const [fullCircleOpen, setFullCircleOpen] = useState(false);
  const [fullCircleRunningInBackground, setFullCircleRunningInBackground] = useState(false);

  // Research
  const [researchRunning, setResearchRunning] = useState<string | null>(null);
  const [markReadyLoading, setMarkReadyLoading] = useState<string | null>(null);
  const [researchEvents, setResearchEvents] = useState<ProgressEvent[]>([]);
  const [researchPct, setResearchPct] = useState(0);
  const researchLogRef = useRef<HTMLDivElement>(null);

  // Street Agent
  const [agentStreet, setAgentStreet] = useState("");
  const [agentCity, setAgentCity] = useState("København");
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentEvents, setAgentEvents] = useState<ProgressEvent[]>([]);
  const [agentPct, setAgentPct] = useState(0);
  const [agentPhaseLabel, setAgentPhaseLabel] = useState("");
  const [agentStats, setAgentStats] = useState<Record<string, number> | null>(null);
  const agentLogRef = useRef<HTMLDivElement>(null);
  const agentRunIdRef = useRef<string | null>(null);

  // Live activity (shared across all users via Supabase)
  interface AgentActivityRun {
    id: string; street: string; city: string;
    phase: string; progress: number; message?: string | null;
    buildings_found?: number | null; created_count?: number | null;
    research_completed?: number | null; research_total?: number | null;
    started_at: string; updated_at: string; completed_at?: string | null;
  }
  const [liveActivity, setLiveActivity] = useState<AgentActivityRun[]>([]);

  // Outreach / Email Queue
  const [outreachData, setOutreachData] = useState<{
    stats: { queued: number; sending: number; sent: number; failed: number; totalProcessed: number; rateLimitPerHour: number; isProcessing: boolean; sentThisHour: number };
    items: { id: string; propertyId: string; to: string; subject: string; body: string; contactName?: string; status: string; queuedAt: string; sentAt?: string; error?: string }[];
    gmail: { configured: boolean; working: boolean; email?: string; error?: string };
  } | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [readyToSend, setReadyToSend] = useState<PropertyItem[]>([]);
  const [selectedForSend, setSelectedForSend] = useState<Set<string>>(new Set());

  // Abort controllers
  const discoveryAbortRef = useRef<AbortController | null>(null);
  const scaffoldAbortRef = useRef<AbortController | null>(null);
  const researchAbortRef = useRef<AbortController | null>(null);
  const agentAbortRef = useRef<AbortController | null>(null);

  // Command palette (Cmd+K / Ctrl+K)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Properties view state
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState<string>("");
  const [scoreFilter, setScoreFilter] = useState<[number, number]>([0, 10]);
  const [sortBy, setSortBy] = useState<SortKey>("status");
  const [sortAsc, setSortAsc] = useState(true);

  // Quick-add
  const [quickAddAddress, setQuickAddAddress] = useState("");
  const [quickAddLoading, setQuickAddLoading] = useState(false);

  // Auto-scroll
  useEffect(() => {
    if (progressLogRef.current) progressLogRef.current.scrollTop = progressLogRef.current.scrollHeight;
  }, [progressEvents]);
  useEffect(() => {
    if (scaffoldLogRef.current) scaffoldLogRef.current.scrollTop = scaffoldLogRef.current.scrollHeight;
  }, [scaffoldEvents]);
  useEffect(() => {
    if (researchLogRef.current) researchLogRef.current.scrollTop = researchLogRef.current.scrollHeight;
  }, [researchEvents]);
  useEffect(() => {
    if (agentLogRef.current) agentLogRef.current.scrollTop = agentLogRef.current.scrollHeight;
  }, [agentEvents]);

  useEffect(() => {
    if (fullCircleOpen) setFullCircleRunningInBackground(false);
  }, [fullCircleOpen]);

  // ── Live activity polling (every 12 seconds) ──
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/agent/activity");
        if (res.ok) {
          const data = await res.json() as { runs: AgentActivityRun[] };
          setLiveActivity((data.runs || []).filter(r =>
            r.phase !== "done" && r.phase !== "stopped"
          ));
        }
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 12000);
    return () => clearInterval(interval);
  }, []);

  // ── Helper: post agent activity update ──
  const postActivity = async (update: Partial<AgentActivityRun & { id: string; street: string; city: string }>) => {
    try {
      await fetch("/api/agent/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
    } catch { /* non-critical */ }
  };

  // Cleanup: abort in-flight SSE on unmount so processes don't stay "running"
  useEffect(() => {
    return () => {
      discoveryAbortRef.current?.abort();
      discoveryAbortRef.current = null;
      scaffoldAbortRef.current?.abort();
      scaffoldAbortRef.current = null;
      researchAbortRef.current?.abort();
      researchAbortRef.current = null;
      agentAbortRef.current?.abort();
      agentAbortRef.current = null;
    };
  }, []);

  // (Auto-scan ved åbning af Stilladser-fanen slået fra midlertidigt pga. React #310 under scan – brug "Start scan" på fanen. Full Circle auto-scanner stadig ved valg af Stilladser.)

  // ── Property Feedback ──
  const submitFeedback = useCallback(async (propertyId: string, feedback: string, note?: string) => {
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, feedback, note }),
      });
      if (res.ok) {
        addToast(`Feedback gemt: ${feedback}`, "success");
        fetchData(); // Refresh
      } else {
        addToast("Kunne ikke gemme feedback", "error");
      }
    } catch {
      addToast("Fejl ved afsendelse af feedback", "error");
    }
  }, [addToast, fetchData]);

  // ── SSE Helper ──
  const consumeSSE = async (
    url: string,
    method: "GET" | "POST",
    body: unknown,
    setEvents: React.Dispatch<React.SetStateAction<ProgressEvent[]>>,
    setPct: React.Dispatch<React.SetStateAction<number>>,
    setPhase: React.Dispatch<React.SetStateAction<string>>,
    onResult?: (event: ProgressEvent) => void,
    onDone?: () => void,
    signal?: AbortSignal
  ) => {
    try {
      const res = await fetch(url, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify(body) : undefined,
        signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Fejl" }));
        setError(errData.error || "Fejl");
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            const pe: ProgressEvent = { ...event, timestamp: Date.now() };
            setEvents((prev) => [...prev, pe]);
            if (event.progress !== undefined) setPct(event.progress);
            if (event.phase) setPhase(event.phase);
            if (onResult) onResult(pe);
            if (event.phase === "complete" || event.phase === "done") {
              setTimeout(fetchData, 1500);
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setEvents((prev) => [...prev, {
          phase: "stopped",
          message: "Stoppet af bruger",
          timestamp: Date.now(),
        } as ProgressEvent]);
        setPct(100);
        setTimeout(fetchData, 1000);
      } else {
        setError(e instanceof Error ? e.message : "Stream fejlede");
      }
    } finally {
      if (onDone) onDone();
    }
  };

  // ── Trigger functions ──
  const triggerDiscovery = async () => {
    if (!discoverStreet.trim()) return;
    const controller = new AbortController();
    discoveryAbortRef.current = controller;
    setDiscoveryRunning(true);
    setDiscoveryResult(null);
    setProgressEvents([]);
    setProgressPct(0);
    setCurrentPhase("");

    addToast(`Scanner ${discoverStreet.trim()}...`, "info");

    await consumeSSE(
      "/api/discover", "POST",
      {
        street: discoverStreet.trim(),
        city: discoverCity.trim(),
        minScore: discoverMinScore,
        minTraffic: discoverMinTraffic,
        maxCandidates: discoverMaxCandidates > 0 ? discoverMaxCandidates : undefined,
      },
      setProgressEvents, setProgressPct, setCurrentPhase,
      (pe) => {
        if (pe.candidates) setDiscoveryResult((prev) => ({ ...(prev || emptyDiscovery()), candidates: pe.candidates! }));
        if (pe.result) {
          setDiscoveryResult({ success: !pe.result.error, ...pe.result } as DiscoveryResultData);
          addToast(`Discovery faerdig: ${pe.result.created} ejendomme oprettet`, "success");
        }
      },
      () => { setDiscoveryRunning(false); discoveryAbortRef.current = null; },
      controller.signal
    );
  };

  const stopDiscovery = () => {
    discoveryAbortRef.current?.abort();
    discoveryAbortRef.current = null;
    addToast("Discovery stoppet", "info");
  };

  const triggerAreaDiscovery = async () => {
    const postcodes = discoverPostcodes.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
    if (postcodes.length === 0) return;
    const controller = new AbortController();
    discoveryAbortRef.current = controller;
    setDiscoveryRunning(true);
    setDiscoveryResult(null);
    setProgressEvents([]);
    setProgressPct(0);
    setCurrentPhase("");

    addToast(`Scanner område ${postcodes.join(", ")}...`, "info");

    const emptyAreaDiscovery = (): DiscoveryResultData => ({
      street: `Område: ${postcodes.join(", ")}`,
      city: discoverCity.trim(),
      totalAddresses: 0,
      afterPreFilter: 0,
      afterTrafficFilter: 0,
      afterScoring: 0,
      created: 0,
      skipped: 0,
      alreadyExists: 0,
      candidates: [],
    });

    await consumeSSE(
      "/api/discover-area",
      "POST",
      {
        postcodes,
        city: discoverCity.trim(),
        minScore: discoverMinScore,
        maxAddresses: 500,
        maxCandidates: discoverMaxCandidates > 0 ? discoverMaxCandidates : undefined,
      },
      setProgressEvents,
      setProgressPct,
      setCurrentPhase,
      (pe) => {
        if (pe.candidates) setDiscoveryResult((prev) => ({ ...(prev || emptyAreaDiscovery()), candidates: pe.candidates! }));
        if (pe.result) {
          setDiscoveryResult({ success: !pe.result.error, ...pe.result } as DiscoveryResultData);
          addToast(`Område-scan færdig: ${pe.result.created} ejendomme oprettet`, "success");
        }
      },
      () => { setDiscoveryRunning(false); discoveryAbortRef.current = null; },
      controller.signal
    );
  };

  const triggerScaffolding = async () => {
    const controller = new AbortController();
    scaffoldAbortRef.current = controller;
    setScaffoldRunning(true);
    setScaffoldEvents([]);
    setScaffoldPct(0);
    setScaffoldReport(null);
    setScaffoldFilter(new Set(["Stilladsreklamer", "Stilladser"]));
    setScaffoldSort({ col: "score", dir: "desc" });
    setScaffoldSelectedIdx(null);

    addToast(`Henter tilladelsesdata fra kommunale GIS-systemer for ${scaffoldCity}...`, "info");

    await consumeSSE(
      "/api/discover-scaffolding", "POST",
      { city: scaffoldCity.trim(), minTraffic: discoverMinTraffic, minScore: 5 },
      setScaffoldEvents, setScaffoldPct, () => {},
      (ev) => {
        // Extract report data from SSE events
        const raw = ev as unknown as Record<string, unknown>;
        if (raw.result) {
          const r = raw.result as Record<string, unknown>;
          const permits = (raw.permits || r.permits || []) as Record<string, unknown>[];
          setScaffoldReport({
            total: (r.totalPermits as number) || 0,
            qualified: (r.afterFilter as number) || 0,
            skipped: (r.skipped as number) || 0,
            sources: (r.sources as { name: string; count: number }[]) || [],
            byType: (r.byType as Record<string, number>) || {},
            topPermits: permits.slice(0, 200).map((p: Record<string, unknown>) => ({
              address: String(p.address || ""),
              score: Number(p.outdoorScore || 0),
              scoreReason: String(p.scoreReason || ""),
              traffic: String(p.estimatedDailyTraffic ? `${Math.round(Number(p.estimatedDailyTraffic) / 1000)}K` : "?"),
              trafficNum: Number(p.estimatedDailyTraffic || 0),
              type: String(p.permitType || ""),
              category: String(p.category || ""),
              startDate: String(p.startDate || "").substring(0, 10),
              endDate: String(p.endDate || "").substring(0, 10),
              createdDate: String(p.createdDate || p.startDate || "").substring(0, 10),
              applicant: String(p.applicant || ""),
              contractor: String(p.contractor || ""),
              lat: Number(p.lat || 0),
              lng: Number(p.lng || 0),
              durationWeeks: Number(p.durationWeeks || 0),
              description: String(p.description || ""),
              facadeArea: String(p.facadeArea || ""),
              sagsnr: String(p.sagsnr || ""),
              contactPerson: String(p.contactPerson || ""),
              contactEmail: String(p.contactEmail || ""),
            })),
            reportText: (raw.detail as string) || "",
          });
        }
      },
      () => { setScaffoldRunning(false); scaffoldAbortRef.current = null; addToast("Stillads-scanning afsluttet!", "success"); },
      controller.signal
    );
  };

  const stopScaffolding = () => {
    scaffoldAbortRef.current?.abort();
    scaffoldAbortRef.current = null;
    addToast("Stillads-scanning stoppet", "info");
  };

  const triggerResearch = async (propertyId?: string, opts?: { staged?: boolean }) => {
    const id = propertyId || "all";
    const controller = new AbortController();
    researchAbortRef.current = controller;
    setResearchRunning(id);
    setResearchEvents([]);
    setResearchPct(0);
    setActiveTab("research");

    const property = properties.find(p => p.id === propertyId);
    addToast(
      propertyId ? `Starter research for ${property?.name || property?.address || "ejendom"}` : "Starter research for alle ventende",
      "info"
    );

    const postBody = propertyId
      ? (opts?.staged ? { stagedPropertyId: propertyId } : { propertyId })
      : undefined;

    await consumeSSE(
      "/api/run-research",
      propertyId ? "POST" : "GET",
      postBody,
      setResearchEvents, setResearchPct, () => {},
      (pe) => {
        if (pe.phase === "property_done" || pe.phase === "complete") {
          addToast("Research faerdig!", "success", pe.message);
        }
      },
      () => {
        setResearchPct((p) => (p < 100 ? 100 : p));
        setResearchRunning(null);
        researchAbortRef.current = null;
      },
      controller.signal
    );
  };

  const stopResearch = () => {
    researchAbortRef.current?.abort();
    researchAbortRef.current = null;
    addToast("Research stoppet", "info");
  };

  const markPropertyReady = async (propertyId: string) => {
    setMarkReadyLoading(propertyId);
    try {
      const res = await fetch("/api/properties/mark-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Kunne ikke opdatere");
      addToast("Ejendom markeret klar til udsendelse", "success");
      await fetchData();
    } catch (e) {
      addToast(e instanceof Error ? e.message : "Fejl ved markering", "error");
    } finally {
      setMarkReadyLoading(null);
    }
  };

  const exportCSV = (which: "ready" | "sent") => {
    const status = which === "ready" ? "KLAR_TIL_UDSENDELSE" : "FOERSTE_MAIL_SENDT";
    const list = properties.filter((p) => p.outreachStatus === status);
    const headers = ["Adresse", "Postnr", "By", "Status", "Score", "Ejer", "Kontakt", "Email", "Emne"];
    const escape = (s: string | number) => (String(s ?? "").includes(",") || String(s).includes('"') || String(s).includes("\n") ? `"${String(s).replace(/"/g, '""')}"` : String(s ?? ""));
    const rows = list.map((p) => [
      p.address ?? p.name ?? "",
      p.postalCode ?? "",
      p.city ?? "",
      p.outreachStatus ?? "",
      p.outdoorScore ?? "",
      p.ownerCompanyName ?? "",
      p.primaryContact?.name ?? p.contactPerson ?? "",
      p.primaryContact?.email ?? p.contactEmail ?? "",
      p.emailDraftSubject ?? "",
    ].map(escape).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ejendomme-${which === "ready" ? "klar" : "sendt"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast(`${list.length} ejendomme eksporteret`, "success");
  };

  // ── Street Agent ──
  // Three-phase client-orchestrated approach to avoid Vercel timeout:
  // Phase 1: Fetch address list from DAWA (1 fast request, <2s)
  // Phase 2: Score addresses in batches of 15 (each batch = separate <10s request)
  // Phase 3: Research each staged property individually (separate <60s requests)
  const triggerStreetAgent = async () => {
    if (!agentStreet.trim()) return;
    const controller = new AbortController();
    agentAbortRef.current = controller;
    setAgentRunning(true);
    setAgentEvents([]);
    setAgentPct(0);
    setAgentPhaseLabel("discovery");
    setAgentStats(null);

    const street = agentStreet.trim();
    const city = agentCity.trim();

    // Create a unique run ID for this session
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    agentRunIdRef.current = runId;

    const addEvent = (ev: { phase: string; message: string; detail?: string; progress?: number }) => {
      setAgentEvents(prev => [...prev, { ...ev, timestamp: Date.now() }]);
    };

    addToast(`Gade-agent starter: ${street}, ${city}...`, "info");

    // Broadcast start to all users
    await postActivity({ id: runId, street, city, phase: "discovery", progress: 0, message: "Henter adresser...", started_at: new Date().toISOString() });

    // ── Phase 1: Get address list ──
    addEvent({ phase: "scan", message: `Henter adresser på ${street}...`, progress: 2 });

    let addresses: unknown[] = [];
    let trafficDaily = 0;
    let trafficFormatted = "";

    try {
      const addrRes = await fetch(
        `/api/agent/street/addresses?street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}`,
        { signal: controller.signal }
      );
      if (!addrRes.ok) throw new Error(`Adresse-opslag fejlede (${addrRes.status})`);
      const addrData = await addrRes.json() as {
        addresses: unknown[];
        total: number;
        trafficEstimate: { daily: number; formatted: string; source: string; confidence: number };
      };
      addresses = addrData.addresses;
      trafficDaily = addrData.trafficEstimate.daily;
      trafficFormatted = addrData.trafficEstimate.formatted;

      addEvent({
        phase: "scan_done",
        message: `${addresses.length} adresser fundet på ${street} · Trafik: ${trafficFormatted}/dag`,
        progress: 5,
      });
    } catch (e) {
      if (controller.signal.aborted) { setAgentRunning(false); return; }
      addEvent({ phase: "error", message: `Fejl ved adresse-opslag: ${e instanceof Error ? e.message : e}`, progress: 100 });
      setAgentRunning(false);
      return;
    }

    if (addresses.length === 0) {
      addEvent({ phase: "done", message: "Ingen adresser fundet på denne gade", progress: 100 });
      await postActivity({ id: runId, street, city, phase: "done", progress: 100, message: "Ingen adresser fundet", completed_at: new Date().toISOString() });
      setAgentRunning(false);
      return;
    }

    // Broadcast address count
    await postActivity({ id: runId, street, city, phase: "scoring", progress: 8, message: `Scorer ${addresses.length} bygninger...`, buildings_found: addresses.length });

    // ── Phase 2: Score in batches of 15 ──
    const BATCH_SIZE = 15;
    const batches: unknown[][] = [];
    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
      batches.push(addresses.slice(i, i + BATCH_SIZE));
    }

    addEvent({
      phase: "scoring",
      message: `AI vurderer ${addresses.length} bygninger i ${batches.length} batches...`,
      progress: 8,
    });

    const stagedPropertyIds: string[] = [];
    let totalCreated = 0;
    let totalAlreadyExists = 0;
    let totalSkipped = 0;

    for (let i = 0; i < batches.length; i++) {
      if (controller.signal.aborted) break;

      const pct = 8 + Math.round(((i) / batches.length) * 55);
      addEvent({
        phase: "scoring_batch",
        message: `AI scorer batch ${i + 1}/${batches.length} (${batches[i].length} bygninger)`,
        progress: pct,
      });
      setAgentPct(pct);

      try {
        const batchRes = await fetch("/api/agent/street/score-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: batches[i], street, city, trafficDaily }),
          signal: controller.signal,
        });

        if (batchRes.ok) {
          const batchData = await batchRes.json() as {
            scored: { address: string; score: number; reason: string }[];
            staged: { id: string; address: string }[];
            created: number;
            alreadyExists: number;
            skipped: number;
            error?: string;
          };

          totalCreated += batchData.created || 0;
          totalAlreadyExists += batchData.alreadyExists || 0;
          totalSkipped += batchData.skipped || 0;

          if (batchData.staged?.length) {
            for (const s of batchData.staged) stagedPropertyIds.push(s.id);
            const top = batchData.scored.sort((a, b) => b.score - a.score)[0];
            addEvent({
              phase: "staging_created",
              message: `Batch ${i + 1}: ${batchData.created} ny ejendom staged${top ? ` — Top: ${top.address} (${top.score}/10)` : ""}`,
              progress: pct,
            });
          }
        }
      } catch (e) {
        if (controller.signal.aborted) break;
        addEvent({ phase: "scoring_batch_error", message: `Batch ${i + 1} fejlede: ${e instanceof Error ? e.message : e}`, progress: pct });
      }
    }

    if (controller.signal.aborted) {
      setAgentRunning(false);
      return;
    }

    const scoringPct = 63;
    setAgentPct(scoringPct);
    addEvent({
      phase: "scoring_done",
      message: `Discovery færdig: ${totalCreated} nye ejendomme staged, ${totalAlreadyExists} eksisterede allerede`,
      progress: scoringPct,
    });

    if (totalCreated === 0) {
      setAgentStats({ totalBuildings: addresses.length, created: 0, alreadyExists: totalAlreadyExists, researchCompleted: 0, researchFailed: 0, emailDraftsGenerated: 0 });
      setAgentPhaseLabel("done");
      setAgentPct(100);
      addEvent({ phase: "agent_done", message: "Ingen nye ejendomme at researche — alle eksisterer allerede eller scorede for lavt", progress: 100 });
      await postActivity({ id: runId, street, city, phase: "done", progress: 100, message: "Ingen nye ejendomme fundet", created_count: 0, completed_at: new Date().toISOString() });
      setAgentRunning(false);
      agentAbortRef.current = null;
      return;
    }

    // Broadcast research start
    await postActivity({ id: runId, street, city, phase: "research", progress: scoringPct, message: `Researcher ${stagedPropertyIds.length} ejendomme...`, created_count: totalCreated, research_total: stagedPropertyIds.length, research_completed: 0 });

    // ── Phase 3: Research each staged property ──
    setAgentPhaseLabel("research");
    addEvent({
      phase: "research_start",
      message: `Fase 3: Researcher ${stagedPropertyIds.length} ejendomme individuelt...`,
      progress: scoringPct,
    });

    let researchCompleted = 0;
    let researchFailed = 0;
    let emailDraftsGenerated = 0;

    for (let i = 0; i < stagedPropertyIds.length; i++) {
      if (controller.signal.aborted) break;
      const propId = stagedPropertyIds[i];
      const pct = scoringPct + Math.round((i / stagedPropertyIds.length) * (95 - scoringPct));

      addEvent({
        phase: "research_property",
        message: `[${i + 1}/${stagedPropertyIds.length}] Researcher ejendom...`,
        progress: pct,
      });
      setAgentPct(pct);

      let propDone = false;
      let propFailed = false;
      await consumeSSE(
        "/api/run-research", "POST",
        { stagedPropertyId: propId },
        setAgentEvents,
        setAgentPct,
        setAgentPhaseLabel,
        (pe) => {
          if (pe.phase === "complete" || pe.phase === "done") propDone = true;
          if (pe.phase === "error") propFailed = true;
          const raw = pe as unknown as Record<string, unknown>;
          if (raw.stepId === "generate_email_draft" && raw.status === "completed") emailDraftsGenerated++;
        },
        () => { if (!propDone && !propFailed) propFailed = true; },
        controller.signal
      );

      if (propFailed) {
        researchFailed++;
        addEvent({ phase: "research_property_failed", message: `[${i + 1}/${stagedPropertyIds.length}] Fejlet – springer over`, progress: undefined });
      } else {
        researchCompleted++;
        addEvent({ phase: "research_property_done", message: `[${i + 1}/${stagedPropertyIds.length}] Research OK ✓`, progress: undefined });
      }
      const newPct = scoringPct + Math.round(((i + 1) / stagedPropertyIds.length) * (95 - scoringPct));
      setAgentPct(newPct);
      // Broadcast progress every 3 properties
      if ((i + 1) % 3 === 0 || i + 1 === stagedPropertyIds.length) {
        await postActivity({ id: runId, street, city, phase: "research", progress: newPct, message: `Researcher ${i + 1}/${stagedPropertyIds.length}...`, research_completed: researchCompleted, research_total: stagedPropertyIds.length });
      }
    }

    const finalStats = {
      totalBuildings: addresses.length,
      created: totalCreated,
      alreadyExists: totalAlreadyExists,
      researchCompleted,
      researchFailed,
      emailDraftsGenerated,
    };
    setAgentStats(finalStats);
    setAgentPhaseLabel("done");
    setAgentPct(100);
    addEvent({
      phase: "agent_done",
      message: `Færdig! ${researchCompleted} researched, ${emailDraftsGenerated} email-udkast — gå til Staging`,
      progress: 100,
    });
    addToast(`Agent færdig: ${researchCompleted} ejendomme researched`, "success");
    await postActivity({ id: runId, street, city, phase: "done", progress: 100, message: `Færdig: ${researchCompleted} researched`, research_completed: researchCompleted, research_total: stagedPropertyIds.length, completed_at: new Date().toISOString() });
    agentRunIdRef.current = null;
    setAgentRunning(false);
    agentAbortRef.current = null;
  };

  const stopStreetAgent = () => {
    agentAbortRef.current?.abort();
    agentAbortRef.current = null;
    setAgentRunning(false);
    addToast("Gade-agent stoppet", "info");
    // Broadcast stop to all users
    if (agentRunIdRef.current) {
      fetch(`/api/agent/activity?id=${agentRunIdRef.current}`, { method: "DELETE" }).catch(() => {});
      agentRunIdRef.current = null;
    }
  };

  // ── Outreach / Email Queue ──
  const fetchOutreachData = async () => {
    setOutreachLoading(true);
    try {
      const [queueRes, propsRes] = await Promise.all([
        fetch("/api/send-email"),
        fetch("/api/properties"),
      ]);
      const queueData = await queueRes.json();
      const propsData = await propsRes.json();
      setOutreachData(queueData);
      const ready = (propsData.properties || []).filter((p: PropertyItem) => p.outreachStatus === "KLAR_TIL_UDSENDELSE");
      setReadyToSend(ready);
    } catch {
      addToast("Kunne ikke hente outreach-data", "error");
    } finally {
      setOutreachLoading(false);
    }
  };

  const sendBatchEmails = async () => {
    if (selectedForSend.size === 0) return;
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyIds: [...selectedForSend] }),
      });
      const data = await res.json();
      addToast(`${data.enqueued || 0} emails sat i koe`, "success");
      setSelectedForSend(new Set());
      await fetchOutreachData();
    } catch {
      addToast("Fejl ved afsendelse", "error");
    }
  };

  const sendSingleEmail = async (
    propertyId: string,
    opts?: { attachmentUrl?: string; attachmentFile?: { filename: string; content: string }; subject?: string; body?: string; to?: string }
  ): Promise<boolean> => {
    try {
      const body = opts ? { propertyId, ...opts } : { propertyId };
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        const hasPdf = opts?.attachmentUrl || opts?.attachmentFile;
        addToast(hasPdf ? "Email med PDF sat i koe" : "Email sat i koe", "success");
        await fetchOutreachData();
        return true;
      }
      addToast(data.error || "Fejl", "error");
      return false;
    } catch {
      addToast("Fejl ved afsendelse", "error");
      return false;
    }
  };

  const quickAddProperty = async (andResearch = false) => {
    if (!quickAddAddress.trim() || quickAddLoading) return;
    setQuickAddLoading(true);
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: quickAddAddress.trim(), startResearch: andResearch }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Fejl ved oprettelse");
        addToast(data.error || "Fejl ved oprettelse", "error");
        return;
      }
      addToast(`${quickAddAddress.trim()} tilfojet!`, "success");
      setQuickAddAddress("");
      await fetchData();
      if (andResearch && data.id) {
        triggerResearch(data.id, { staged: data.staged === true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fejl ved oprettelse");
    } finally {
      setQuickAddLoading(false);
    }
  };

  const emptyDiscovery = (): DiscoveryResultData => ({
    street: discoverStreet, city: discoverCity, totalAddresses: 0, afterPreFilter: 0,
    afterTrafficFilter: 0, afterScoring: 0, created: 0, skipped: 0, alreadyExists: 0, candidates: [],
  });

  // Filtreret data i egen hook for stabil hook-rækkefølge (undgår React #310)
  const { availableCities, filteredProperties, currentResearchProperty, researchSummary } = useFilteredDashboardData(
    properties ?? [],
    researchEvents ?? [],
    { propertyFilter, statusFilter, cityFilter, scoreFilter, sortBy, sortAsc, researchRunning }
  );

  const pendingResearchProperties = useMemo(() => {
    const list = properties ?? [];
    return list.filter((p) => p.outreachStatus === "NY_KRAEVER_RESEARCH" || p.outreachStatus === "RESEARCH_IGANGSAT");
  }, [properties]);

  // Single return path only (no early return) to avoid React #310
  return (
    <div className={`w-full flex flex-col relative ${activeTab === "indbakke" ? "h-screen overflow-hidden" : "min-h-screen"}`} style={{ background: "var(--background)" }}>
      {/* Loading overlay when context is still loading */}
      {loading && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-50" style={{ background: "var(--background)" }}>
          <div className="text-center animate-fade-in">
            <div className="relative w-14 h-14 mx-auto mb-5">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 animate-pulse" />
              <div className="absolute inset-0 rounded-2xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
                </svg>
              </div>
            </div>
            <p className="text-sm font-semibold text-slate-700">Ejendom AI</p>
            <p className="text-xs text-slate-400 mt-1">Forbinder til systemer...</p>
          </div>
        </div>
      )}
      <div className={`layout-top-bar flex-1 min-h-0 w-full ${loading ? "invisible" : ""}`}>
        {/* ─── Top bar ─── */}
        <header className="top-bar">
          {/* Logo */}
          <div className="top-bar-logo">
            <div className="top-bar-logo-icon">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
              </svg>
            </div>
            <span className="top-bar-logo-text hidden sm:inline">Ejendom AI</span>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-5 bg-white/10 flex-shrink-0" />

          <nav className="top-bar-nav">
            {(() => { const activeNavTab = getNavTabForActive(activeTab); return NAV_TABS.map((nav) => {
              const isActive = activeNavTab.id === nav.id;
              const childIds = nav.children?.map(c => c.id) ?? [nav.id];
              const showDot =
                childIds.includes("discover" as TabId) && discoveryRunning ||
                childIds.includes("scaffolding" as TabId) && scaffoldRunning ||
                childIds.includes("research" as TabId) && !!researchRunning ||
                childIds.includes("street_agent" as TabId) && agentRunning;
              return (
                <button
                  key={nav.id}
                  type="button"
                  onClick={() => {
                    if (!nav.children) {
                      setActiveTab(nav.id);
                    } else if (!isActive) {
                      setActiveTab(nav.children[0].id);
                    }
                  }}
                  className={`top-bar-tab ${isActive ? "active" : ""}`}
                  title={nav.label}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={nav.icon} />
                  </svg>
                  <span>{nav.label}</span>
                  {nav.id === "properties" && properties.length > 0 && (
                    <span className="text-[10px] opacity-50 font-normal tabular-nums">{properties.length}</span>
                  )}
                  {nav.id === "staging" && (dashboard?.staging?.awaitingAction || 0) > 0 && (
                    <span className="relative inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-amber-400 text-amber-900 text-[9px] font-bold tabular-nums shadow-sm">
                      {dashboard?.staging?.awaitingAction}
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                    </span>
                  )}
                  {showDot && <span className="tab-dot bg-indigo-400 animate-pulse shadow-sm shadow-indigo-500/50" />}
                </button>
              );
            }); })()}
          </nav>

          {/* Right side: stats + status + logout */}
          <div className="top-bar-stats">
            {/* Keyboard shortcut hint */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-slate-500 bg-white/5 border border-white/8 hover:bg-white/10 transition-colors mr-1"
              title="Åbn command palette (Ctrl+K)"
            >
              <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" />
              </svg>
              <kbd className="text-[10px] opacity-50">⌘K</kbd>
            </button>

            <div className="top-bar-stat">
              <div className="top-bar-stat-value">{dashboard?.totalProperties ?? 0}</div>
              <div className="top-bar-stat-label">Ejendomme</div>
            </div>
            <div className="top-bar-stat">
              <div className="top-bar-stat-value" style={{ color: "#34d399" }}>{dashboard?.readyToSend ?? 0}</div>
              <div className="top-bar-stat-label">Klar</div>
            </div>
            <div className="top-bar-stat" title={`Ny: ${dashboard?.staging?.new ?? 0} · Researched: ${dashboard?.staging?.researched ?? 0}`}>
              <div className="top-bar-stat-value" style={{ color: "#fbbf24" }}>{dashboard?.staging?.awaitingAction ?? 0}</div>
              <div className="top-bar-stat-label">Stage</div>
            </div>
            <div className="top-bar-stat">
              <div className="top-bar-stat-value" style={{ color: "#818cf8" }}>{dashboard?.mailsSent ?? 0}</div>
              <div className="top-bar-stat-label">Sendt</div>
            </div>

            {/* Live activity badge — shows when any user is running a street agent */}
            {liveActivity.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab("street_agent")}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 transition-colors animate-pulse-ring"
                title={liveActivity.map(r => `${r.street}, ${r.city} — ${r.message || r.phase}`).join("\n")}
                style={{ animationDuration: "2s" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                <span className="text-[10px] font-semibold text-amber-300 leading-none">
                  {liveActivity.length === 1
                    ? `${liveActivity[0].street}`
                    : `${liveActivity.length} agents`}
                </span>
                {liveActivity[0].research_completed != null && liveActivity[0].research_total != null && (
                  <span className="text-[9px] text-amber-400/70 font-mono tabular-nums">
                    {liveActivity[0].research_completed}/{liveActivity[0].research_total}
                  </span>
                )}
              </button>
            )}

            {/* System health dot */}
            {systemHealth && (
              <div
                className="flex items-center justify-center w-7 h-7 rounded-md bg-white/5 border border-white/8"
                title={systemHealth.status === "healthy" ? "Alle systemer OK" : systemHealth.status === "degraded" ? "Delvis nedsat" : "Problemer"}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  systemHealth.status === "healthy" ? "bg-emerald-400 shadow-sm shadow-emerald-400/60" :
                  systemHealth.status === "degraded" ? "bg-amber-400 animate-pulse" : "bg-red-400 animate-pulse"
                }`} />
              </div>
            )}

            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-slate-400 hover:text-white hover:bg-white/8 transition-colors border border-transparent hover:border-white/10"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              <span className="hidden sm:inline">Log ud</span>
            </button>
          </div>
        </header>

        {/* ─── Main content ─── */}
        <main className={`main-after-top scroll-slim ${activeTab === "indbakke" ? "!overflow-hidden !pb-0" : ""}`}>
        {/* Error Banner */}
        {error && (
          <div className="dashboard-container mt-4 p-3.5 bg-red-50 border border-red-200/40 rounded-xl flex items-center gap-3 text-sm animate-fade-in">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-red-700 text-xs font-semibold">
                {/HUBSPOT_ACCESS_TOKEN|Missing required environment variable/i.test(error)
                  ? "HubSpot API-nøgle er ikke konfigureret"
                  : error}
              </span>
              <p className="text-[10px] text-red-500/80 mt-0.5">Tjek API-nøgler under Indstillinger</p>
            </div>
            <button onClick={() => { setActiveTab("settings"); setError(null); }}
              className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200 shrink-0">Åbn Indstillinger</button>
            <button onClick={() => { setError(null); fetchData(); }}
              className="px-3 py-1.5 bg-white border border-red-200 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-50 shrink-0">Prøv igen</button>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-100 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {/* ─── Active Processes ─── */}
        {(discoveryRunning || scaffoldRunning || !!researchRunning || agentRunning || !!stagingResearch) && (
          <div className="dashboard-container sticky top-0 z-30 mt-3">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-900/95 backdrop-blur-sm rounded-xl border border-slate-700/40 shadow-xl">
              <div className="relative w-4 h-4 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-t-emerald-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                <div className="absolute inset-[4px] rounded-full bg-emerald-400" />
              </div>
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                {discoveryRunning && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 text-blue-300 overflow-hidden">
                    <button onClick={() => setActiveTab("discover")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-blue-500/20 transition-all">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      Discovery {progressPct > 0 && <span className="opacity-70">{progressPct}%</span>}
                    </button>
                    <button onClick={stopDiscovery} title="Stop discovery"
                      className="px-2 py-1.5 text-blue-200 hover:bg-red-500/30 hover:text-white transition-all border-l border-blue-500/30">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                    </button>
                  </div>
                )}
                {scaffoldRunning && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 overflow-hidden">
                    <button onClick={() => setActiveTab("scaffolding")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-cyan-500/20 transition-all">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Stilladser {scaffoldPct > 0 && <span className="opacity-70">{scaffoldPct}%</span>}
                    </button>
                    <button onClick={stopScaffolding} title="Stop stillads-scan"
                      className="px-2 py-1.5 text-cyan-200 hover:bg-red-500/30 hover:text-white transition-all border-l border-cyan-500/30">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                    </button>
                  </div>
                )}
                {researchRunning && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 text-amber-300 overflow-hidden">
                    <button onClick={() => setActiveTab("research")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-amber-500/20 transition-all">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      {researchRunning === "all" ? "Batch research" : "Research"}
                    </button>
                    <button onClick={stopResearch} title="Stop research"
                      className="px-2 py-1.5 text-amber-200 hover:bg-red-500/30 hover:text-white transition-all border-l border-amber-500/30">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                    </button>
                  </div>
                )}
                {agentRunning && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/15 text-violet-300 overflow-hidden">
                    <button onClick={() => setActiveTab("street_agent")}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold hover:bg-violet-500/20 transition-all">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                      Gade-agent
                    </button>
                    <button onClick={stopStreetAgent} title="Stop gade-agent"
                      className="px-2 py-1.5 text-violet-200 hover:bg-red-500/30 hover:text-white transition-all border-l border-violet-500/30">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                    </button>
                  </div>
                )}
                {stagingResearch && (
                  <button onClick={() => setActiveTab("staging")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-semibold hover:bg-amber-500/20 transition-all">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Staging research {stagingResearch.active > 0 && (
                      <span className="opacity-70">
                        {stagingResearch.total > 1
                          ? `${stagingResearch.total - stagingResearch.active + 1}/${stagingResearch.total}`
                          : ""}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Page title + sub-tab bar ─── */}
        {activeTab !== "indbakke" && (() => {
          const navTab = getNavTabForActive(activeTab);
          const subTab = navTab.children?.find(c => c.id === activeTab);
          const title = subTab ? subTab.label : navTab.label;
          return (
            <div className="dashboard-container mt-6 mb-2">
              <div className="flex items-center gap-3">
                {/* Icon bubble */}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)", boxShadow: "0 4px 12px rgba(99,102,241,0.3)" }}>
                  <svg className="w-4.5 h-4.5 text-white w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={navTab.icon} />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight leading-none">{title}</h1>
                  {navTab.desc && <p className="text-xs text-slate-400 mt-0.5 font-medium">{navTab.desc}</p>}
                </div>
              </div>
              {navTab.children && navTab.children.length > 1 && (
                <div className="flex items-center gap-1 mt-4 border-b border-slate-200/70">
                  {navTab.children.map(child => (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => setActiveTab(child.id)}
                      className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-all relative ${
                        activeTab === child.id
                          ? "text-indigo-700 bg-white shadow-sm border border-slate-200/70 border-b-white"
                          : "text-slate-500 hover:text-slate-700 hover:bg-white/60"
                      }`}
                    >
                      {child.label}
                      {activeTab === child.id && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-t" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <div className={`dashboard-container py-4 sm:py-6 ${activeTab === "indbakke" ? "hidden" : ""}`}>
          {/* ═══ DASHBOARD / HOME ═══ */}
          {activeTab === "home" && (
            <>
              <div className="mb-4">
                <BriefingPanel />
              </div>

              <HomeTab
                discoveryRunning={discoveryRunning}
                scaffoldRunning={scaffoldRunning}
                researchRunning={!!researchRunning}
                agentRunning={agentRunning}
                fullCircleOpen={fullCircleOpen}
                setFullCircleOpen={setFullCircleOpen}
                setStatusFilter={setStatusFilter}
                setExpandedProperty={setExpandedProperty}
                scaffoldCity={scaffoldCity}
              />

              {/* AI Agents */}
              <div className="mt-6 space-y-4">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">AI Agenter</h2>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <FollowUpPanel onToast={addToast} />
                  <TilbudAgentPanel onToast={addToast} />
                </div>
                <LeadIntelPanel onToast={addToast} />
              </div>
            </>
          )}

          {/* ═══ DISCOVER TAB ═══ */}
          {activeTab === "discover" && (
            <DiscoverTab
              discoverStreet={discoverStreet}
              setDiscoverStreet={setDiscoverStreet}
              discoverCity={discoverCity}
              setDiscoverCity={setDiscoverCity}
              discoverPostcodes={discoverPostcodes}
              setDiscoverPostcodes={setDiscoverPostcodes}
              discoverMinScore={discoverMinScore}
              setDiscoverMinScore={setDiscoverMinScore}
              discoverMinTraffic={discoverMinTraffic}
              setDiscoverMinTraffic={setDiscoverMinTraffic}
              discoverMaxCandidates={discoverMaxCandidates}
              setDiscoverMaxCandidates={setDiscoverMaxCandidates}
              discoveryRunning={discoveryRunning}
              discoveryResult={discoveryResult}
              progressEvents={progressEvents}
              progressPct={progressPct}
              currentPhase={currentPhase}
              progressLogRef={progressLogRef}
              triggerDiscovery={triggerDiscovery}
              triggerAreaDiscovery={triggerAreaDiscovery}
              stopDiscovery={stopDiscovery}
              setActiveTab={setActiveTab}
              addToast={addToast}
              fetchData={fetchData}
              ProgressBar={ProgressBar}
              LogPanel={LogPanel}
            />
          )}

          {/* ═══ SCAFFOLDING TAB ═══ */}
          {activeTab === "scaffolding" && scaffoldRunning && (
            /* Under scan: vis kun progress – mount ikke den tunge ScaffoldingTab (undgår React #310) */
            <div className="animate-fade-in space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">Scanner stilladser</h2>
                <button onClick={stopScaffolding} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg">
                  Stop
                </button>
              </div>
              <ProgressBar pct={scaffoldPct} running={true} phase="Henter tilladelser..." />
              <LogPanel logRef={scaffoldLogRef} events={scaffoldEvents} running={true} maxHeight="400px" />
            </div>
          )}
          {activeTab === "scaffolding" && !scaffoldRunning && (
            <ScaffoldingTab
              scaffoldCity={scaffoldCity}
              setScaffoldCity={setScaffoldCity}
              setFullCircleOpen={setFullCircleOpen}
              scaffoldRunning={scaffoldRunning}
              scaffoldEvents={scaffoldEvents}
              scaffoldPct={scaffoldPct}
              scaffoldReport={scaffoldReport}
              scaffoldFilter={scaffoldFilter}
              setScaffoldFilter={setScaffoldFilter}
              scaffoldSort={scaffoldSort}
              setScaffoldSort={setScaffoldSort}
              scaffoldView={scaffoldView}
              setScaffoldView={setScaffoldView}
              scaffoldSelectedIdx={scaffoldSelectedIdx}
              setScaffoldSelectedIdx={setScaffoldSelectedIdx}
              scaffoldLogRef={scaffoldLogRef}
              triggerScaffolding={triggerScaffolding}
              stopScaffolding={stopScaffolding}
              addToast={addToast}
              fetchData={fetchData}
              setOohInitialFrame={setOohInitialFrame}
              setActiveTab={setActiveTab}
              ProgressBar={ProgressBar}
              LogPanel={LogPanel}
            />
          )}

          {/* ═══ STAGING QUEUE TAB ═══ */}
          {activeTab === "staging" && <StagingTab />}

          {activeTab === "properties" && (
            <PropertiesTab
              properties={properties}
              dashboard={dashboard}
              filteredProperties={filteredProperties}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              propertyFilter={propertyFilter}
              setPropertyFilter={setPropertyFilter}
              cityFilter={cityFilter}
              setCityFilter={setCityFilter}
              scoreFilter={scoreFilter}
              setScoreFilter={setScoreFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              sortAsc={sortAsc}
              setSortAsc={setSortAsc}
              expandedProperty={expandedProperty}
              setExpandedProperty={setExpandedProperty}
              quickAddAddress={quickAddAddress}
              setQuickAddAddress={setQuickAddAddress}
              quickAddLoading={quickAddLoading}
              quickAddProperty={quickAddProperty}
              researchRunning={researchRunning}
              triggerResearch={triggerResearch}
              stopResearch={stopResearch}
              submitFeedback={submitFeedback}
              sendSingleEmail={sendSingleEmail}
              markPropertyReady={markPropertyReady}
              markReadyLoading={markReadyLoading}
              exportCSV={exportCSV}
              addToast={addToast}
              fetchData={fetchData}
              setActiveTab={setActiveTab}
              setOohInitialFrame={setOohInitialFrame}
              setOohInitialClient={setOohInitialClient}
              availableCities={availableCities}
              PipelineStat={PipelineStat}
              PropertyCard={PropertyCard}
            />
          )}

          {activeTab === "research" && (
            <ResearchTab
              researchRunning={researchRunning}
              researchEvents={researchEvents}
              researchPct={researchPct}
              researchLogRef={researchLogRef}
              triggerResearch={triggerResearch}
              stopResearch={stopResearch}
              currentResearchProperty={currentResearchProperty}
              researchSummary={researchSummary}
              pendingResearchProperties={pendingResearchProperties}
              ProgressBar={ProgressBar}
              LogPanel={LogPanel}
            />
          )}

          {activeTab === "street_agent" && (
            <StreetAgentTab
              agentStreet={agentStreet}
              setAgentStreet={setAgentStreet}
              agentCity={agentCity}
              setAgentCity={setAgentCity}
              agentRunning={agentRunning}
              agentEvents={agentEvents}
              agentPct={agentPct}
              agentPhaseLabel={agentPhaseLabel}
              agentStats={agentStats}
              agentLogRef={agentLogRef}
              triggerStreetAgent={triggerStreetAgent}
              stopStreetAgent={stopStreetAgent}
              setActiveTab={setActiveTab}
              fetchOutreachData={fetchOutreachData}
              ProgressBar={ProgressBar}
              LogPanel={LogPanel}
              ResultStat={ResultStat}
            />
          )}

          {activeTab === "outreach" && (
            <OutreachTab
              outreachData={outreachData}
              outreachLoading={outreachLoading}
              fetchOutreachData={fetchOutreachData}
              readyToSend={readyToSend}
              selectedForSend={selectedForSend}
              setSelectedForSend={setSelectedForSend}
              sendSingleEmail={sendSingleEmail}
              sendBatchEmails={sendBatchEmails}
              ResultStat={ResultStat}
              addToast={addToast}
            />
          )}

          {/* ═══ OOH PROPOSALS TAB ═══ */}
          {activeTab === "ooh" && (
            <OOHTab
              initialFrame={oohInitialFrame}
              initialClient={oohInitialClient}
              onToast={addToast}
              setActiveTab={(tab) => setActiveTab(tab as TabId)}
            />
          )}

          {activeTab === "tilbud" && (
            <TilbudTab onToast={addToast} />
          )}

          {activeTab === "lead_sourcing" && <LeadSourcingTab />}
          {activeTab === "lead_scanner" && <LeadScannerTab />}
          {activeTab === "settings" && <SettingsTab />}
        </div>

        {activeTab === "indbakke" && (
          <div className="flex-1 min-h-0 overflow-hidden px-3 pb-1">
            <IndbakkeTab />
          </div>
        )}
      </main>

      {/* ─── Full Circle Wizard ─── */}
      <FullCircleWizard
        isOpen={fullCircleOpen}
        onClose={() => setFullCircleOpen(false)}
        onMinimizeToBackground={() => setFullCircleRunningInBackground(true)}
        onRunningChange={(running) => { if (!running) setFullCircleRunningInBackground(false); }}
        city={scaffoldCity}
        onComplete={() => { fetchData(); addToast("Full Circle Pipeline afsluttet!", "success"); }}
      />

      {/* ─── Full Circle kører i baggrunden ─── */}
      {fullCircleRunningInBackground && (
        <div className="fixed bottom-6 left-6 z-50 pointer-events-auto">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border bg-violet-50/95 border-violet-200/80 text-violet-800">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-300 border-t-violet-600" />
              <span className="text-sm font-medium">Full Circle kører i baggrunden</span>
            </div>
            <button
              onClick={() => setFullCircleOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700"
            >
              Åbn
            </button>
          </div>
        </div>
      )}

      {/* ─── Toast Notifications ─── */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2.5 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id}
            className={`pointer-events-auto animate-slide-in-right flex items-start gap-3 pl-4 pr-3 py-3 rounded-xl shadow-lg border backdrop-blur-sm max-w-sm toast-accent ${
              toast.type === "success" ? "bg-green-50/95 border-green-200/80 text-green-800 toast-success" :
              toast.type === "error" ? "bg-red-50/95 border-red-200/80 text-red-800 toast-error" :
              "bg-white/95 border-slate-200/60 text-slate-800 toast-info"
            }`}
            style={{ boxShadow: "0 8px 30px -4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.03)" }}
          >
            <div className="flex-shrink-0 mt-0.5">
              {toast.type === "success" ? (
                <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              ) : toast.type === "error" ? (
                <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>
              ) : (
                <svg className="w-4 h-4 text-brand-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{toast.message}</p>
              {toast.detail && <p className="text-xs opacity-75 mt-0.5 truncate">{toast.detail}</p>}
            </div>
            <button onClick={() => removeToast(toast.id)} className="flex-shrink-0 opacity-40 hover:opacity-100 p-1 rounded-lg hover:bg-black/5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
        setActiveTab={(id) => setActiveTab(id as TabId)}
        properties={properties.map((p) => ({ id: p.id, name: p.name, address: [p.address, p.postalCode, p.city].filter(Boolean).join(", ") }))}
        onSelectProperty={(id) => setExpandedProperty(id)}
      />
      </div>
    </div>
  );
}

