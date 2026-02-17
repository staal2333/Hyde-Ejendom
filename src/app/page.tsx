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
import dynamic from "next/dynamic";
import type { OOHPanelProps } from "../components/OOHPanel";
import { DashboardProvider, useDashboard } from "../contexts/DashboardContext";
import type { TabId } from "../contexts/DashboardContext";
import { ScaffoldingTab } from "../components/tabs/ScaffoldingTab";
import { HomeTab } from "../components/tabs/HomeTab";
import { DiscoverTab } from "../components/tabs/DiscoverTab";
import { StagingTab } from "../components/tabs/StagingTab";
import { OOHTab } from "../components/tabs/OOHTab";
import { PropertiesTab } from "../components/tabs/PropertiesTab";
import { ResearchTab } from "../components/tabs/ResearchTab";
import { StreetAgentTab } from "../components/tabs/StreetAgentTab";
import { OutreachTab } from "../components/tabs/OutreachTab";
import { SettingsTab } from "../components/tabs/SettingsTab";
import { ProgressBar, LogPanel, ResultStat, PipelineStat, PropertyCard } from "@/components/dashboard";

const FullCircleWizard = dynamic(() => import("../components/FullCircleWizard"), { ssr: false });

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

// ─── Tabs ───────────────────────────────────────────────────
// Pipeline section tabs
const PIPELINE_TABS: { id: TabId; label: string; icon: string; desc: string }[] = [
  { id: "discover", label: "Discovery", desc: "Scan veje", icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" },
  { id: "street_agent", label: "Gade-Agent", desc: "Auto pipeline", icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" },
  { id: "scaffolding", label: "Stilladser", desc: "Tilladelser", icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" },
  { id: "staging", label: "Staging", desc: "Godkend leads", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
  { id: "properties", label: "Ejendomme", desc: "Pipeline", icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" },
  { id: "research", label: "Research", desc: "Live agent", icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" },
];

// Outreach section tabs
const OUTREACH_TABS: { id: TabId; label: string; icon: string; desc: string }[] = [
  { id: "ooh", label: "OOH Proposals", desc: "Mockups & PDF", icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V4.5A1.5 1.5 0 0020.25 3H3.75A1.5 1.5 0 002.25 4.5v15A1.5 1.5 0 003.75 21z" },
  { id: "outreach", label: "Email Koe", desc: "Emails & koe", icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" },
];

// System section tabs
const SYSTEM_TABS: { id: TabId; label: string; icon: string; desc: string }[] = [
  { id: "settings", label: "Indstillinger", desc: "System & regler", icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" },
];

// Home tab (shown separately in sidebar)
const HOME_TAB: { id: TabId; label: string; icon: string; desc: string } = {
  id: "home", label: "Dashboard", desc: "Overblik", icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
};

// Combined for backwards compat
const TABS = [HOME_TAB, ...PIPELINE_TABS, ...OUTREACH_TABS, ...SYSTEM_TABS];

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

// ─── Main Dashboard ─────────────────────────────────────────

export default function Page() {
  return (
    <DashboardProvider>
      <DashboardContent />
    </DashboardProvider>
  );
}

function DashboardContent() {
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
  } = useDashboard();

  useTabShortcuts(setActiveTab);

  // Discovery
  const [discoverStreet, setDiscoverStreet] = useState("");
  const [discoverCity, setDiscoverCity] = useState("København");
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

  // Outreach / Email Queue
  const [outreachData, setOutreachData] = useState<{
    stats: { queued: number; sending: number; sent: number; failed: number; totalProcessed: number; rateLimitPerHour: number; isProcessing: boolean; sentThisHour: number };
    items: { id: string; propertyId: string; to: string; subject: string; body: string; contactName?: string; status: string; queuedAt: string; sentAt?: string; error?: string }[];
    gmail: { configured: boolean; working: boolean; email?: string; error?: string };
  } | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [readyToSend, setReadyToSend] = useState<PropertyItem[]>([]);
  const [selectedForSend, setSelectedForSend] = useState<Set<string>>(new Set());
  const [emailPreview, setEmailPreview] = useState<{ propertyId: string; to: string; subject: string; body: string; contactName?: string; attachmentUrl?: string } | null>(null);
  const [editingEmail, setEditingEmail] = useState<{ subject: string; body: string; attachmentUrl?: string } | null>(null);

  // Abort controllers
  const discoveryAbortRef = useRef<AbortController | null>(null);
  const scaffoldAbortRef = useRef<AbortController | null>(null);
  const researchAbortRef = useRef<AbortController | null>(null);
  const agentAbortRef = useRef<AbortController | null>(null);

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

  const triggerResearch = async (propertyId?: string) => {
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

    await consumeSSE(
      "/api/run-research",
      propertyId ? "POST" : "GET",
      propertyId ? { propertyId } : undefined,
      setResearchEvents, setResearchPct, () => {},
      (pe) => {
        if (pe.phase === "property_done" || pe.phase === "complete") {
          addToast("Research faerdig!", "success", pe.message);
        }
      },
      () => { setResearchRunning(null); researchAbortRef.current = null; },
      controller.signal
    );
  };

  const stopResearch = () => {
    researchAbortRef.current?.abort();
    researchAbortRef.current = null;
    addToast("Research stoppet", "info");
  };

  // ── Street Agent ──
  const triggerStreetAgent = async () => {
    if (!agentStreet.trim()) return;
    const controller = new AbortController();
    agentAbortRef.current = controller;
    setAgentRunning(true);
    setAgentEvents([]);
    setAgentPct(0);
    setAgentPhaseLabel("");
    setAgentStats(null);

    addToast(`Gade-agent starter: ${agentStreet.trim()}, ${agentCity}...`, "info");

    await consumeSSE(
      "/api/agent/street", "POST",
      { street: agentStreet.trim(), city: agentCity.trim() },
      setAgentEvents, setAgentPct, setAgentPhaseLabel,
      (pe) => {
        if (pe.stats) setAgentStats(pe.stats as Record<string, number>);
        if (pe.phase === "agent_done") {
          addToast(pe.message || "Agent faerdig!", "success");
        }
      },
      () => { setAgentRunning(false); agentAbortRef.current = null; },
      controller.signal
    );
  };

  const stopStreetAgent = () => {
    agentAbortRef.current?.abort();
    agentAbortRef.current = null;
    addToast("Gade-agent stoppet", "info");
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

  const sendSingleEmail = async (propertyId: string, attachmentUrl?: string) => {
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId, attachmentUrl }),
      });
      const data = await res.json();
      if (data.success) {
        addToast(attachmentUrl ? "Email med proposal-PDF sat i koe" : "Email sat i koe", "success");
        await fetchOutreachData();
      } else {
        addToast(data.error || "Fejl", "error");
      }
    } catch {
      addToast("Fejl ved afsendelse", "error");
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
        triggerResearch(data.id);
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

  // ── Filtered + Sorted Properties (memoized) ──
  const availableCities = useMemo(
    () => [...new Set(properties.map(p => p.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "da")),
    [properties]
  );

  const filteredProperties = useMemo(() => {
    const q = propertyFilter?.toLowerCase();
    return properties
      .filter((p) => {
        if (q) {
          const matches = p.name?.toLowerCase().includes(q) ||
            p.address?.toLowerCase().includes(q) ||
            p.ownerCompanyName?.toLowerCase().includes(q) ||
            p.city?.toLowerCase().includes(q);
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
        switch (sortBy) {
          case "name":
            cmp = (a.name || a.address).localeCompare(b.name || b.address, "da");
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
        return sortAsc ? cmp : -cmp;
      });
  }, [properties, propertyFilter, statusFilter, cityFilter, scoreFilter, sortBy, sortAsc]);

  // ── Current Research Context (memoized) ──
  const currentResearchProperty = useMemo(
    () => researchRunning && researchRunning !== "all" ? properties.find(p => p.id === researchRunning) : null,
    [researchRunning, properties]
  );

  const researchSummary = useMemo(() => ({
    oisOwner: researchEvents.find(e => e.phase === "ois_owner_set" || e.message?.includes("OIS officiel ejer"))?.message?.replace(/.*?:\s*/, "") || null,
    cvrCompany: researchEvents.find(e => e.phase === "cvr" && e.message?.includes("CVR fundet"))?.message || null,
    contactsFound: researchEvents.filter(e => e.phase === "contact_create").length,
    emailsFound: researchEvents.filter(e => e.phase === "email_hunt_found" || e.message?.includes("Email fundet")).length,
    totalSearches: researchEvents.filter(e => e.phase === "search_query").length,
    currentStep: researchEvents.length > 0 ? researchEvents[researchEvents.length - 1].message : null,
  }), [researchEvents]);

  // ── Loading State ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--background)" }}>
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
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--background)" }}>
      {/* ─── Sidebar ─── */}
      <aside className="w-[240px] gradient-sidebar text-white flex-shrink-0 flex flex-col">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <svg className="w-[18px] h-[18px] text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75" />
              </svg>
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-white">Ejendom AI</div>
              <div className="text-[10px] text-indigo-300/60 font-medium">Research Platform</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 overflow-y-auto scroll-slim">
          {/* Dashboard */}
          <button
            onClick={() => setActiveTab("home")}
            className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all group mb-1 ${
              activeTab === "home"
                ? "bg-white/[0.1] text-white"
                : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
            }`}
          >
            {activeTab === "home" && <div className="sidebar-active-indicator" />}
            <svg className={`w-[18px] h-[18px] shrink-0 ${activeTab === "home" ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={HOME_TAB.icon} />
            </svg>
            <span className="font-medium text-[13px]">Dashboard</span>
          </button>

          {/* Section renderer */}
          {([
            { label: "Pipeline", tabs: PIPELINE_TABS },
            { label: "Outreach", tabs: OUTREACH_TABS },
            { label: "System", tabs: SYSTEM_TABS },
          ] as const).map((section, si) => (
            <div key={section.label} className={si === 0 ? "mt-3" : "mt-5"}>
              <div className="px-3 mb-1.5">
                <span className="text-[9px] font-bold text-slate-500/80 uppercase tracking-[0.1em]">{section.label}</span>
              </div>
              <div className="space-y-0.5">
              {section.tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all group ${
                    activeTab === tab.id
                      ? "bg-white/[0.1] text-white"
                      : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                  }`}
                >
                  {activeTab === tab.id && <div className="sidebar-active-indicator" />}
                  <svg className={`w-[18px] h-[18px] shrink-0 ${
                    activeTab === tab.id ? "text-indigo-400" : "text-slate-500 group-hover:text-slate-300"
                  }`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  </svg>
                  <span className="font-medium text-[13px] flex-1 text-left">{tab.label}</span>
                  {tab.id === "properties" && properties.length > 0 && (
                    <span className="text-[10px] font-bold bg-white/[0.1] text-slate-300 px-1.5 py-0.5 rounded-md tabular-nums">{properties.length}</span>
                  )}
                  {tab.id === "staging" && (dashboard?.staging?.awaitingAction || 0) > 0 && (
                    <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded-md tabular-nums">{dashboard?.staging?.awaitingAction}</span>
                  )}
                  {tab.id === "discover" && discoveryRunning && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                  )}
                  {tab.id === "scaffolding" && scaffoldRunning && (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                  )}
                  {tab.id === "research" && researchRunning && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-glow-ring shrink-0" />
                  )}
                  {tab.id === "street_agent" && agentRunning && (
                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
                  )}
                </button>
              ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Stats Footer */}
        <div className="mx-3 mb-3 space-y-2">
          {/* System Health - compact */}
          {systemHealth && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03]">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                systemHealth.status === "healthy" ? "bg-emerald-400" :
                systemHealth.status === "degraded" ? "bg-amber-400" : "bg-red-400"
              }`} />
              <span className="text-[10px] text-slate-400 flex-1">
                {systemHealth.status === "healthy" ? "Alle systemer OK" :
                 systemHealth.status === "degraded" ? "Delvis nedsat" : "Problemer"}
              </span>
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-1 px-2 py-2.5 rounded-xl bg-white/[0.03]">
            {[
              { value: dashboard?.totalProperties || 0, label: "Total", color: "text-slate-200" },
              { value: dashboard?.readyToSend || 0, label: "Klar", color: "text-emerald-400" },
              { value: dashboard?.staging?.awaitingAction || 0, label: "Stage", color: "text-amber-400" },
              { value: dashboard?.mailsSent || 0, label: "Sendt", color: "text-indigo-400" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className={`text-sm font-bold tabular-nums ${s.color}`}>{s.value}</div>
                <div className="text-[8px] text-slate-600 uppercase tracking-wider">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-slate-500/80 px-3 pt-1.5 border-t border-white/[0.04] mt-2 pt-2">
            Tast <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[8px]">1</kbd>–<kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[8px]">9</kbd> eller <kbd className="px-1 py-0.5 rounded bg-white/10 font-mono text-[8px]">0</kbd> for at skifte fane
          </p>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 overflow-y-auto scroll-slim">
        {/* Error Banner */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-red-50 border border-red-200/40 rounded-xl flex items-center gap-3 text-sm animate-fade-in">
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
        {(discoveryRunning || scaffoldRunning || !!researchRunning || agentRunning) && (
          <div className="sticky top-0 z-30 mx-5 mt-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/95 glass rounded-xl border border-slate-700/40 shadow-2xl">
              <div className="relative w-4 h-4 shrink-0">
                <div className="absolute inset-0 rounded-full border-2 border-t-emerald-400 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                <div className="absolute inset-[4px] rounded-full bg-emerald-400" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap flex-1">
                {discoveryRunning && (
                  <button onClick={() => setActiveTab("discover")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-blue-500/15 text-blue-300 hover:bg-blue-500/25 transition-all">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    Discovery {progressPct > 0 && <span className="opacity-60">{progressPct}%</span>}
                  </button>
                )}
                {scaffoldRunning && (
                  <button onClick={() => setActiveTab("scaffolding")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 transition-all">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    Stilladser {scaffoldPct > 0 && <span className="opacity-60">{scaffoldPct}%</span>}
                  </button>
                )}
                {researchRunning && (
                  <button onClick={() => setActiveTab("research")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-all">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    {researchRunning === "all" ? "Batch research" : "Research"}
                  </button>
                )}
                {agentRunning && (
                  <button onClick={() => setActiveTab("street_agent")}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 transition-all">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                    Gade-agent
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="p-6">
          {/* ═══ DASHBOARD / HOME ═══ */}
          {activeTab === "home" && (
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
          )}

          {/* ═══ DISCOVER TAB ═══ */}
          {activeTab === "discover" && (
            <DiscoverTab
              discoverStreet={discoverStreet}
              setDiscoverStreet={setDiscoverStreet}
              discoverCity={discoverCity}
              setDiscoverCity={setDiscoverCity}
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
              stopDiscovery={stopDiscovery}
              setActiveTab={setActiveTab}
              addToast={addToast}
              fetchData={fetchData}
              ProgressBar={ProgressBar}
              LogPanel={LogPanel}
            />
          )}

          {/* ═══ SCAFFOLDING TAB ═══ */}
          {activeTab === "scaffolding" && (
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
              emailPreview={emailPreview}
              setEmailPreview={setEmailPreview}
              editingEmail={editingEmail}
              setEditingEmail={setEditingEmail}
              sendSingleEmail={sendSingleEmail}
              sendBatchEmails={sendBatchEmails}
              ResultStat={ResultStat}
            />
          )}

          {/* ═══ OOH PROPOSALS TAB ═══ */}
          {activeTab === "ooh" && (
            <OOHTab
              initialFrame={oohInitialFrame}
              initialClient={oohInitialClient}
              onToast={addToast}
            />
          )}

          {activeTab === "settings" && <SettingsTab />}
        </div>
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
      <div className="fixed bottom-6 right-6 z-50 space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id}
            className={`pointer-events-auto animate-slide-up flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border backdrop-blur-sm max-w-sm ${
              toast.type === "success" ? "bg-green-50/95 border-green-200/80 text-green-800" :
              toast.type === "error" ? "bg-red-50/95 border-red-200/80 text-red-800" :
              "bg-white/95 border-slate-200/60 text-slate-800"
            }`}>
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
            <button onClick={() => removeToast(toast.id)} className="flex-shrink-0 opacity-50 hover:opacity-100 p-0.5 rounded">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

