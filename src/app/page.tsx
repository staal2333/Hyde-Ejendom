"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import ScaffoldingMap from "../components/ScaffoldingMapDynamic";
import type { MapPermit } from "../components/ScaffoldingMapDynamic";
import type { OOHPanelProps } from "../components/OOHPanel";

// Lazy-load heavy tab components – only loaded when their tab is active
const OOHPanel = dynamic(() => import("../components/OOHPanel"), {
  ssr: false,
  loading: () => <div className="animate-pulse rounded-2xl bg-white/[0.03] h-96" />,
});
const StagingQueue = dynamic(() => import("../components/StagingQueue"), {
  ssr: false,
  loading: () => <div className="animate-pulse rounded-2xl bg-white/[0.03] h-96" />,
});
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

function formatTraffic(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : String(n);
}

function formatNumber(n: number): string {
  return n.toLocaleString("da-DK");
}

// ─── Tabs ───────────────────────────────────────────────────
type TabId = "home" | "discover" | "street_agent" | "scaffolding" | "staging" | "properties" | "research" | "ooh" | "outreach" | "settings";

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

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    // Check URL hash for initial tab (e.g. /#ooh)
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "") as TabId;
      if (TABS.some(t => t.id === hash)) return hash;
    }
    return "home";
  });
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // System health
  const [systemHealth, setSystemHealth] = useState<{ status: string; pings: Record<string, { ok: boolean; service: string; latencyMs?: number }> } | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((message: string, type: Toast["type"] = "info", detail?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, detail }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Discovery
  const [discoverStreet, setDiscoverStreet] = useState("");
  const [discoverCity, setDiscoverCity] = useState("København");
  const [discoverMinScore, setDiscoverMinScore] = useState(6);
  const [discoverMinTraffic, setDiscoverMinTraffic] = useState(10000);
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

  // OOH Panel – data bridges from scaffolding/properties
  const [oohInitialFrame, setOohInitialFrame] = useState<OOHPanelProps["initialFrame"]>();
  const [oohInitialClient, setOohInitialClient] = useState<OOHPanelProps["initialClient"]>();

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

  // Fetch dashboard stats (lightweight – counts only)
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();
      setDashboard(data);
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente dashboard data");
    }
  }, []);

  // Fetch full property list (heavier – only when needed)
  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch("/api/properties");
      const data = await res.json();
      setProperties(data.properties || []);
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente ejendomme");
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      await Promise.all([fetchDashboard(), fetchProperties()]);
    } finally {
      setLoading(false);
    }
  }, [fetchDashboard, fetchProperties]);

  // Track which tabs need properties data
  const needsProperties = activeTab === "properties" || activeTab === "home" || activeTab === "outreach" || activeTab === "research";

  useEffect(() => {
    // Always fetch dashboard on mount
    fetchDashboard();
    // Only fetch properties if the current tab needs them
    if (needsProperties) fetchProperties();
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll: dashboard every 30s, properties only when active tab needs them
  useEffect(() => {
    const dashInterval = setInterval(fetchDashboard, 30000);
    const propInterval = needsProperties ? setInterval(fetchProperties, 30000) : undefined;
    return () => {
      clearInterval(dashInterval);
      if (propInterval) clearInterval(propInterval);
    };
  }, [fetchDashboard, fetchProperties, needsProperties]);

  // Fetch system health on load + every 2 min
  useEffect(() => {
    const fetchHealth = () => fetch("/api/status").then(r => r.json()).then(d => setSystemHealth(d)).catch(() => {});
    fetchHealth();
    const healthInterval = setInterval(fetchHealth, 120_000);
    return () => clearInterval(healthInterval);
  }, []);

  // Fetch properties when switching to a tab that needs them (if not already loaded)
  useEffect(() => {
    if (needsProperties && properties.length === 0 && !loading) {
      fetchProperties();
    }
  }, [needsProperties, properties.length, loading, fetchProperties]);

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
      { street: discoverStreet.trim(), city: discoverCity.trim(), minScore: discoverMinScore, minTraffic: discoverMinTraffic },
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
              <span className="text-red-700 text-xs font-semibold">{error}</span>
              <p className="text-[10px] text-red-500/80 mt-0.5">Tjek API-noegler under Indstillinger</p>
            </div>
            <button onClick={() => { setError(null); fetchData(); }}
              className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-200 shrink-0">Proev igen</button>
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
            <div className="animate-fade-in">
              {/* Header with mesh gradient */}
              <div className="relative mb-8 -mx-8 -mt-8 px-8 pt-8 pb-6 gradient-mesh">
                <div className="flex items-end justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
                    <p className="text-sm text-slate-500 mt-1">Overblik over pipeline, research og outreach</p>
                  </div>
                  <button onClick={() => setFullCircleOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 hover:scale-[1.02] transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
                    </svg>
                    Full Circle Pipeline
                  </button>
                </div>
              </div>

              {/* ── KPI Cards ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Ejendomme", value: dashboard?.totalProperties || 0, icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75", gradient: "from-indigo-500 to-blue-600", ring: "ring-indigo-100", textColor: "text-indigo-700", bgColor: "bg-indigo-50/80" },
                  { label: "Afventer research", value: dashboard?.pendingResearch || 0, icon: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z", gradient: "from-amber-500 to-orange-500", ring: "ring-amber-100", textColor: "text-amber-700", bgColor: "bg-amber-50/80" },
                  { label: "Klar til udsendelse", value: dashboard?.readyToSend || 0, icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z", gradient: "from-emerald-500 to-green-600", ring: "ring-emerald-100", textColor: "text-emerald-700", bgColor: "bg-emerald-50/80" },
                  { label: "Mails sendt", value: dashboard?.mailsSent || 0, icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5", gradient: "from-violet-500 to-purple-600", ring: "ring-violet-100", textColor: "text-violet-700", bgColor: "bg-violet-50/80" },
                ].map((kpi, ki) => (
                  <div key={kpi.label} className={`relative ${kpi.bgColor} rounded-2xl p-5 overflow-hidden card-hover border border-white/60 ring-1 ${kpi.ring}`} style={{ animationDelay: `${ki * 80}ms` }}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-slate-500/80 uppercase tracking-wider">{kpi.label}</p>
                        <p className={`text-3xl font-extrabold tabular-nums mt-2 tracking-tight ${kpi.textColor}`}>{kpi.value}</p>
                      </div>
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${kpi.gradient} flex items-center justify-center shadow-lg`}>
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d={kpi.icon} />
                        </svg>
                      </div>
                    </div>
                    {/* Decorative glow */}
                    <div className={`absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-gradient-to-br ${kpi.gradient} opacity-[0.07] blur-2xl`} />
                  </div>
                ))}
              </div>

              {/* ── Staging Alert ── */}
              {(dashboard?.staging?.awaitingAction || 0) > 0 && (
                <button
                  onClick={() => setActiveTab("staging")}
                  className="w-full flex items-center gap-4 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200/50 px-5 py-4 mb-6 hover:shadow-lg transition-all group card-hover"
                >
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/20">
                    <span className="text-lg font-bold text-white">{dashboard?.staging?.awaitingAction || 0}</span>
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-bold text-amber-900">
                      Ejendom{(dashboard?.staging?.awaitingAction || 0) !== 1 ? "me" : ""} afventer godkendelse
                    </p>
                    <p className="text-xs text-amber-600/80 mt-0.5">
                      {(dashboard?.staging?.new || 0) > 0 && `${dashboard?.staging?.new} nye`}
                      {(dashboard?.staging?.researched || 0) > 0 && ` · ${dashboard?.staging?.researched} klar`}
                      {(dashboard?.staging?.researching || 0) > 0 && ` · ${dashboard?.staging?.researching} researching`}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              )}

              {/* ── Visual Pipeline ── */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6 mb-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm font-bold text-slate-900">Pipeline</h2>
                  <span className="text-[10px] text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">Discovery → Research → Approve → Send</span>
                </div>
                {(() => {
                  const statusCounts: Record<string, number> = {};
                  properties.forEach(p => { statusCounts[p.outreachStatus] = (statusCounts[p.outreachStatus] || 0) + 1; });
                  const stagingNew = dashboard?.staging?.new || 0;
                  const stagingResearched = dashboard?.staging?.researched || 0;
                  const stagingPushed = dashboard?.staging?.pushed || 0;

                  const pipelineStages = [
                    { key: "discovery", label: "Discovery", count: stagingNew, desc: "Nye leads", gradient: "from-blue-500 to-cyan-500", iconBg: "bg-blue-500", text: "text-blue-600", tab: "discover" as TabId, filter: null },
                    { key: "staging", label: "Staging", count: stagingNew + stagingResearched, desc: "Afventer", gradient: "from-amber-500 to-orange-500", iconBg: "bg-amber-500", text: "text-amber-600", tab: "staging" as TabId, filter: null },
                    { key: "research", label: "Research", count: (statusCounts["NY_KRAEVER_RESEARCH"] || 0) + (statusCounts["RESEARCH_IGANGSAT"] || 0), desc: "Analyserer", gradient: "from-indigo-500 to-blue-500", iconBg: "bg-indigo-500", text: "text-indigo-600", tab: "research" as TabId, filter: null },
                    { key: "approved", label: "HubSpot", count: stagingPushed + (dashboard?.totalProperties || 0), desc: "I CRM", gradient: "from-violet-500 to-purple-500", iconBg: "bg-violet-500", text: "text-violet-600", tab: "properties" as TabId, filter: null },
                    { key: "ready", label: "Klar", count: statusCounts["KLAR_TIL_UDSENDELSE"] || 0, desc: "Til sending", gradient: "from-green-500 to-emerald-500", iconBg: "bg-emerald-500", text: "text-emerald-600", tab: "outreach" as TabId, filter: "ready" },
                    { key: "sent", label: "Sendt", count: statusCounts["FOERSTE_MAIL_SENDT"] || 0, desc: "Afsendt", gradient: "from-emerald-500 to-teal-500", iconBg: "bg-teal-500", text: "text-teal-600", tab: "outreach" as TabId, filter: "sent" },
                  ];
                  const maxCount = Math.max(1, ...pipelineStages.map(s => s.count));

                  return (
                    <div className="flex items-center gap-1">
                      {pipelineStages.map((stage, i) => (
                        <div key={stage.key} className="flex-1 flex items-center">
                          <button onClick={() => { setActiveTab(stage.tab); if (stage.filter) setStatusFilter(stage.filter); }}
                            className="flex-1 text-center group">
                            <div className="relative mx-auto mb-2">
                              {/* Circular progress ring */}
                              <div className="w-14 h-14 mx-auto relative">
                                <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                                  <circle cx="28" cy="28" r="24" fill="none" stroke="currentColor" className="text-slate-100" strokeWidth="3" />
                                  <circle cx="28" cy="28" r="24" fill="none" stroke="url(#grad)" strokeWidth="3" strokeLinecap="round"
                                    strokeDasharray={`${Math.max(5, (stage.count / maxCount) * 150)} 150`} />
                                  <defs><linearGradient id={`grad-${stage.key}`}><stop offset="0%" className={stage.text} /><stop offset="100%" className={stage.text} /></linearGradient></defs>
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className={`text-lg font-extrabold tabular-nums ${stage.text}`}>{stage.count}</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-[11px] font-bold text-slate-800 group-hover:text-slate-900">{stage.label}</div>
                            <div className="text-[9px] text-slate-400">{stage.desc}</div>
                          </button>
                          {i < pipelineStages.length - 1 && (
                            <svg className="w-4 h-4 text-slate-200 shrink-0 -mt-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Conversion rates */}
                {properties.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-center gap-8 text-[10px] text-slate-500">
                    {(() => {
                      const total = properties.length || 1;
                      const ready = properties.filter(p => p.outreachStatus === "KLAR_TIL_UDSENDELSE").length;
                      const sent = properties.filter(p => p.outreachStatus === "FOERSTE_MAIL_SENDT").length;
                      return (
                        <>
                          <span>Research → Klar <strong className="text-slate-700 ml-1">{Math.round((ready / total) * 100)}%</strong></span>
                          <span className="w-px h-3 bg-slate-200" />
                          <span>Klar → Sendt <strong className="text-slate-700 ml-1">{ready > 0 ? Math.round((sent / ready) * 100) : 0}%</strong></span>
                          <span className="w-px h-3 bg-slate-200" />
                          <span>Total <strong className="text-slate-700 ml-1">{Math.round((sent / total) * 100)}%</strong></span>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* ── Status Breakdown + Quick Actions (stacked 2-col) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
                {/* HubSpot Status */}
                <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5">
                  <h2 className="text-xs font-bold text-slate-900 mb-4 uppercase tracking-wide">HubSpot Status</h2>
                  <div className="space-y-2.5">
                    {(() => {
                      const statusCounts: Record<string, number> = {};
                      properties.forEach(p => { statusCounts[p.outreachStatus] = (statusCounts[p.outreachStatus] || 0) + 1; });
                      const total = properties.length || 1;
                      const stages = [
                        { key: "NY_KRAEVER_RESEARCH", label: "Ny", color: "bg-amber-500", textColor: "text-amber-600", light: "bg-amber-50" },
                        { key: "RESEARCH_IGANGSAT", label: "Researching", color: "bg-blue-500", textColor: "text-blue-600", light: "bg-blue-50" },
                        { key: "RESEARCH_DONE_CONTACT_PENDING", label: "Researched", color: "bg-indigo-500", textColor: "text-indigo-600", light: "bg-indigo-50" },
                        { key: "KLAR_TIL_UDSENDELSE", label: "Klar", color: "bg-emerald-500", textColor: "text-emerald-600", light: "bg-emerald-50" },
                        { key: "FOERSTE_MAIL_SENDT", label: "Sendt", color: "bg-teal-500", textColor: "text-teal-600", light: "bg-teal-50" },
                        { key: "FEJL", label: "Fejl", color: "bg-red-500", textColor: "text-red-600", light: "bg-red-50" },
                      ];
                      return stages.map(s => {
                        const count = statusCounts[s.key] || 0;
                        const pct = Math.round((count / total) * 100);
                        return (
                          <button key={s.key} onClick={() => { setActiveTab("properties"); setStatusFilter(getStatusConfig(s.key).filterKey); }}
                            className="w-full flex items-center gap-3 group">
                            <span className={`w-2 h-2 rounded-full ${s.color} shrink-0`} />
                            <span className="text-xs text-slate-600 group-hover:text-slate-900 w-24 text-left truncate">{s.label}</span>
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                              <div className={`${s.color} h-full rounded-full transition-all duration-700`} style={{ width: `${Math.max(pct, count > 0 ? 3 : 0)}%` }} />
                            </div>
                            <span className={`text-xs font-bold tabular-nums ${s.textColor} w-8 text-right`}>{count}</span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                  {properties.length === 0 && (
                    <div className="text-center py-6">
                      <p className="text-xs text-slate-400">Ingen ejendomme i pipeline endnu</p>
                      <button onClick={() => setActiveTab("discover")} className="text-xs text-indigo-600 hover:underline mt-1.5 font-semibold">Start discovery</button>
                    </div>
                  )}
                </div>

                {/* Quick Actions — stacked grid */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5">
                  <h2 className="text-xs font-bold text-slate-900 mb-3 uppercase tracking-wide">Genveje</h2>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Discovery", icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z", tab: "discover" as TabId, color: "text-blue-600", bg: "bg-blue-50 hover:bg-blue-100/80" },
                      { label: "Stilladser", icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18", tab: "scaffolding" as TabId, color: "text-cyan-600", bg: "bg-cyan-50 hover:bg-cyan-100/80" },
                      { label: "Staging", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z", tab: "staging" as TabId, color: "text-amber-600", bg: "bg-amber-50 hover:bg-amber-100/80" },
                      { label: "Ejendomme", icon: "M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21", tab: "properties" as TabId, color: "text-indigo-600", bg: "bg-indigo-50 hover:bg-indigo-100/80" },
                      { label: "Research", icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5", tab: "research" as TabId, color: "text-violet-600", bg: "bg-violet-50 hover:bg-violet-100/80" },
                      { label: "OOH", icon: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159", tab: "ooh" as TabId, color: "text-purple-600", bg: "bg-purple-50 hover:bg-purple-100/80" },
                      { label: "Email Koe", icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75", tab: "outreach" as TabId, color: "text-rose-600", bg: "bg-rose-50 hover:bg-rose-100/80" },
                      { label: "Settings", icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z", tab: "settings" as TabId, color: "text-slate-600", bg: "bg-slate-50 hover:bg-slate-100/80" },
                    ].map(a => (
                      <button key={a.label} onClick={() => setActiveTab(a.tab)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl ${a.bg} transition-all text-left group`}>
                        <svg className={`w-4 h-4 ${a.color} shrink-0`} fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
                        </svg>
                        <span className="text-[11px] font-semibold text-slate-700">{a.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Analytics Overview ── */}
              {dashboard?.analytics && (
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-6">
                  <h2 className="text-xs font-bold text-slate-900 mb-4 uppercase tracking-wide">Analytics</h2>

                  {/* OOH metrics in a clean row */}
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                    {[
                      { label: "Sendt", value: dashboard.analytics.ooh.totalSent, color: "text-blue-600", dot: "bg-blue-500" },
                      { label: "Aabnet", value: dashboard.analytics.ooh.opened, color: "text-violet-600", dot: "bg-violet-500" },
                      { label: "Klikket", value: dashboard.analytics.ooh.clicked, color: "text-cyan-600", dot: "bg-cyan-500" },
                      { label: "Svar", value: dashboard.analytics.ooh.replied, color: "text-green-600", dot: "bg-green-500" },
                      { label: "Moeder", value: dashboard.analytics.ooh.meetings, color: "text-amber-600", dot: "bg-amber-500" },
                      { label: "Solgt", value: dashboard.analytics.ooh.sold, color: "text-emerald-600", dot: "bg-emerald-500" },
                    ].map(m => (
                      <div key={m.label} className="text-center py-3 px-2 rounded-xl bg-slate-50/80">
                        <div className={`text-xl font-extrabold tabular-nums ${m.color}`}>{m.value}</div>
                        <div className="flex items-center justify-center gap-1.5 mt-1">
                          <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                          <span className="text-[10px] font-medium text-slate-500">{m.label}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Conversion rate bars */}
                  {dashboard.analytics.ooh.totalSent > 0 && (
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: "Open", pct: Math.round((dashboard.analytics.ooh.opened / Math.max(1, dashboard.analytics.ooh.totalSent)) * 100), color: "bg-violet-500" },
                        { label: "Click", pct: Math.round((dashboard.analytics.ooh.clicked / Math.max(1, dashboard.analytics.ooh.totalSent)) * 100), color: "bg-cyan-500" },
                        { label: "Reply", pct: Math.round((dashboard.analytics.ooh.replied / Math.max(1, dashboard.analytics.ooh.totalSent)) * 100), color: "bg-green-500" },
                        { label: "Meeting", pct: Math.round((dashboard.analytics.ooh.meetings / Math.max(1, dashboard.analytics.ooh.totalSent)) * 100), color: "bg-amber-500" },
                      ].map(r => (
                        <div key={r.label}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-500">{r.label}</span>
                            <span className="text-[10px] font-bold text-slate-700">{r.pct}%</span>
                          </div>
                          <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className={`${r.color} h-full rounded-full transition-all`} style={{ width: `${Math.max(r.pct, r.pct > 0 ? 3 : 0)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Email queue compact */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-4 text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${dashboard.analytics.emailQueue.queued > 0 ? "bg-amber-500 animate-pulse" : "bg-slate-300"}`} />
                      <span className="text-slate-500">Email-koe: <strong className="text-slate-700">{dashboard.analytics.emailQueue.queued}</strong></span>
                    </div>
                    <span className="text-slate-200">|</span>
                    <span className="text-slate-500">Sendt: <strong className="text-slate-700">{dashboard.analytics.emailQueue.sentThisHour}/{dashboard.analytics.emailQueue.rateLimitPerHour}/t</strong></span>
                    {dashboard.analytics.emailQueue.failed > 0 && (
                      <>
                        <span className="text-slate-200">|</span>
                        <span className="text-red-500 font-semibold">Fejlet: {dashboard.analytics.emailQueue.failed}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Recent Activity + System Health ── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Properties */}
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-slate-900">Seneste ejendomme</h2>
                    <button onClick={() => setActiveTab("properties")} className="text-[10px] font-semibold text-brand-600 hover:underline">Se alle</button>
                  </div>
                  {properties.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-6">Ingen ejendomme endnu. Koer en discovery scan for at komme i gang.</p>
                  ) : (
                    <div className="space-y-2">
                      {properties.slice(0, 5).map(p => {
                        const sc = getStatusConfig(p.outreachStatus);
                        return (
                          <button key={p.id} onClick={() => { setActiveTab("properties"); setExpandedProperty(p.id); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors text-left group">
                            <div className={`w-2 h-2 rounded-full ${sc.dot} shrink-0`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 truncate">{p.name || p.address}</p>
                              <p className="text-[10px] text-slate-400 truncate">{p.city} · {sc.label}</p>
                            </div>
                            {p.outdoorScore != null && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${p.outdoorScore >= 7 ? "bg-green-100 text-green-700" : p.outdoorScore >= 4 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{p.outdoorScore}/10</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* System Status */}
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-slate-900">System Status</h2>
                    {systemHealth && (
                      <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${
                        systemHealth.status === "healthy" ? "text-emerald-600" :
                        systemHealth.status === "degraded" ? "text-amber-600" : "text-red-600"
                      }`}>
                        <span className={`w-2 h-2 rounded-full animate-pulse ${
                          systemHealth.status === "healthy" ? "bg-emerald-500" :
                          systemHealth.status === "degraded" ? "bg-amber-500" : "bg-red-500"
                        }`} />
                        {systemHealth.status === "healthy" ? "Alle systemer OK" :
                         systemHealth.status === "degraded" ? "Delvis nedsat" : "Problemer"}
                      </div>
                    )}
                  </div>
                  {systemHealth ? (
                    <div className="space-y-3">
                      {Object.entries(systemHealth.pings || {}).map(([key, ping]) => {
                        const p = ping as { ok: boolean; service?: string; latencyMs?: number };
                        return (
                          <div key={key} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-50">
                            <div className="flex items-center gap-2.5">
                              <span className={`w-2 h-2 rounded-full ${p.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                              <span className="text-xs font-medium text-slate-700">{p.service || key}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {p.latencyMs != null && (
                                <span className={`text-[10px] font-mono ${p.latencyMs < 200 ? "text-emerald-600" : p.latencyMs < 500 ? "text-amber-600" : "text-red-600"}`}>{p.latencyMs}ms</span>
                              )}
                              <span className={`text-[10px] font-semibold ${p.ok ? "text-emerald-600" : "text-red-600"}`}>{p.ok ? "OK" : "Fejl"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-200 border-t-slate-500" />
                    </div>
                  )}

                  {/* Activity indicators */}
                  <div className="mt-5 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Aktive processer</p>
                    <div className="flex flex-wrap gap-2">
                      {discoveryRunning && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded-lg"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />Discovery koerer</span>}
                      {scaffoldRunning && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-cyan-50 text-cyan-700 text-[10px] font-semibold rounded-lg"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />Stilladser scanner</span>}
                      {researchRunning && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded-lg"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />Research aktiv</span>}
                      {agentRunning && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-50 text-violet-700 text-[10px] font-semibold rounded-lg"><span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />Gade-agent aktiv</span>}
                      {!discoveryRunning && !scaffoldRunning && !researchRunning && !agentRunning && (
                        <span className="text-[10px] text-slate-400">Ingen aktive processer</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ DISCOVER TAB ═══ */}
          {activeTab === "discover" && (
            <div className="animate-fade-in">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Street Discovery</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Scan en vej og find ejendomme med outdoor reklame-potentiale</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-5">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">Vejnavn</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                      </div>
                      <input type="text" value={discoverStreet} onChange={(e) => setDiscoverStreet(e.target.value)}
                        placeholder="fx Jagtvej, Vesterbrogade..."
                        onKeyDown={(e) => e.key === "Enter" && triggerDiscovery()}
                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300 placeholder:text-slate-400" />
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">By</label>
                    <input type="text" value={discoverCity} onChange={(e) => setDiscoverCity(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
                      Min. score <span className="text-brand-600 font-bold">{discoverMinScore}/10</span>
                    </label>
                    <div className="relative pt-1">
                      <input type="range" min={1} max={10} value={discoverMinScore} onChange={(e) => setDiscoverMinScore(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-600" />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">
                      {discoverMinScore <= 3 ? "Lavt: Inkluderer de fleste bygninger, mange irrelevante" :
                       discoverMinScore <= 5 ? "Middel: God balance mellem volumen og relevans" :
                       discoverMinScore <= 7 ? "Hoejt: Kun bygninger med tydeligt outdoor-potentiale" :
                       "Meget hoejt: Kun de allerbedste lokationer (faa resultater)"}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">
                      Min. trafik <span className="text-brand-600 font-bold">{formatTraffic(discoverMinTraffic)}/dag</span>
                    </label>
                    <div className="relative pt-1">
                      <input type="range" min={0} max={30000} step={1000} value={discoverMinTraffic} onChange={(e) => setDiscoverMinTraffic(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-brand-600" />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">
                      {discoverMinTraffic === 0 ? "Ingen filtrering paa trafik — alle gader inkluderes" :
                       discoverMinTraffic <= 5000 ? "Lav: Sidegader og rolige kvarterer" :
                       discoverMinTraffic <= 15000 ? "Middel: Typiske bystroeget og mellembygader" :
                       "Hoejt: Kun hovedveje og stoerre stroeget med mange forbipasserende"}
                    </p>
                  </div>
                  <div className="md:col-span-2 flex gap-2">
                    {discoveryRunning ? (
                      <>
                        <button disabled className="flex-1 inline-flex items-center justify-center gap-2.5 px-5 py-3 gradient-brand text-white text-sm font-semibold rounded-xl opacity-70 cursor-not-allowed">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />Scanner...
                        </button>
                        <button onClick={stopDiscovery} className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                          Stop
                        </button>
                      </>
                    ) : (
                      <button onClick={triggerDiscovery} disabled={!discoverStreet.trim()}
                        className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 gradient-brand text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" /></svg>Scan vej
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {(discoveryRunning || progressEvents.length > 0) && (
                <div className="mb-6 animate-fade-in">
                  <ProgressBar pct={progressPct} running={discoveryRunning} phase={currentPhase} />
                  <LogPanel logRef={progressLogRef} events={progressEvents} running={discoveryRunning} />
                </div>
              )}

              {discoveryResult && !discoveryRunning && discoveryResult.candidates?.length > 0 && (
                <div className="animate-fade-in">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <ResultStat label="Scannet" value={discoveryResult.totalAddresses} icon="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                    <ResultStat label="Filtreret" value={discoveryResult.afterPreFilter} icon="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                    <ResultStat label="AI Scoret" value={discoveryResult.afterScoring} icon="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" color="brand" />
                    <ResultStat label="Oprettet" value={discoveryResult.created} icon="M12 4.5v15m7.5-7.5h-15" color="green" />
                    {discoveryResult.estimatedTraffic && (
                      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Estimeret trafik</div>
                        <div className="flex items-baseline gap-1">
                          <span className={`text-xl font-extrabold tabular-nums ${discoveryResult.estimatedTraffic >= 10000 ? "text-green-600" : "text-amber-600"}`}>
                            {formatTraffic(discoveryResult.estimatedTraffic)}
                          </span>
                          <span className="text-xs text-slate-400">/dag</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
                          <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
                          </svg>
                        </div>
                        <div>
                          <span className="font-bold text-sm text-slate-900">{discoveryResult.street}, {discoveryResult.city}</span>
                          <span className="text-xs text-slate-400 ml-2">{discoveryResult.candidates.filter(c => c.outdoorScore >= discoverMinScore).length} kandidater</span>
                        </div>
                      </div>
                    </div>
                    <CandidateTable candidates={discoveryResult.candidates} minScore={discoverMinScore} />
                  </div>
                </div>
              )}

              {!discoveryRunning && !discoveryResult && progressEvents.length === 0 && (
                <EmptyState
                  icon="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z"
                  title="Klar til at scanne"
                  description="Indtast et vejnavn ovenfor for at finde ejendomme med outdoor reklame-potentiale. AI-agenten scanner automatisk alle adresser og vurderer potentialet."
                />
              )}
            </div>
          )}

          {/* ═══ SCAFFOLDING TAB ═══ */}
          {activeTab === "scaffolding" && (
            <div className="animate-fade-in">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Stilladser &amp; Reklamer</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aktive tilladelser fra kommunale WFS-datakilder
                  </p>
                </div>
                <button onClick={() => setFullCircleOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
                  </svg>
                  Full Circle
                </button>
              </div>

              {/* ── Info pills ── */}
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-50 text-[10px] font-semibold text-violet-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  Kun aktive tilladelser
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-[10px] font-semibold text-amber-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Rapport-visning
                </span>
              </div>

              {/* ── Search Controls ── */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-5">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="w-48">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">By</label>
                    <div className="relative">
                      <select value={scaffoldCity} onChange={(e) => setScaffoldCity(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300 appearance-none pr-10">
                        <option value="København">København</option>
                        <option value="Aarhus">Aarhus</option>
                        <option value="Odense">Odense</option>
                        <option value="Aalborg">Aalborg</option>
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-400 mb-1">
                      {scaffoldCity === "København"
                        ? "Kun aktive stilladser + stilladsreklamer fra kbhkort.kk.dk WFS."
                        : scaffoldCity === "Aarhus"
                          ? "Aarhus WebKort WFS + Open Data DK portalen"
                          : "Web-soegning (ingen direkte API for denne by endnu)"}
                    </p>
                  </div>
                  {scaffoldRunning ? (
                    <div className="flex gap-2">
                      <button disabled className="inline-flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-xl opacity-70 cursor-not-allowed">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />Scanner...
                      </button>
                      <button onClick={stopScaffolding} className="inline-flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                        Stop
                      </button>
                    </div>
                  ) : (
                    <button onClick={triggerScaffolding}
                      className="inline-flex items-center gap-2.5 px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all active:scale-[0.98]">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" /></svg>
                      Start daglig scanning
                    </button>
                  )}
                </div>
              </div>

              {/* ── Progress + Log ── */}
              {(scaffoldRunning || scaffoldEvents.length > 0) && (
                <div className="mb-6 animate-fade-in">
                  <ProgressBar pct={scaffoldPct} running={scaffoldRunning} phase="" />
                  <LogPanel logRef={scaffoldLogRef} events={scaffoldEvents} running={scaffoldRunning} />
                </div>
              )}

              {/* ── Daily Report Dashboard ── */}
              {scaffoldReport && !scaffoldRunning && (() => {
                const CATEGORY_STYLE: Record<string, { gradient: string; bg: string; text: string; dot: string; icon: string }> = {
                  Stilladsreklamer: { gradient: "from-violet-500 to-purple-600", bg: "bg-violet-100", text: "text-violet-700", dot: "bg-violet-500", icon: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" },
                  Stilladser:      { gradient: "from-indigo-500 to-violet-600", bg: "bg-indigo-100", text: "text-indigo-700", dot: "bg-indigo-500", icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15" },
                };
                const ALL_CATS = ["Stilladsreklamer", "Stilladser"];

                // Counts
                const groupTotals: Record<string, number> = {};
                for (const [type, count] of Object.entries(scaffoldReport.byType)) {
                  const group = type.split(" / ")[0] || type;
                  groupTotals[group] = (groupTotals[group] || 0) + count;
                }

                // Filter & sort
                const filtered = scaffoldReport.topPermits.filter((p) => scaffoldFilter.has(p.type));
                const sorted = [...filtered].sort((a, b) => {
                  const dir = scaffoldSort.dir === "asc" ? 1 : -1;
                  switch (scaffoldSort.col) {
                    case "address": return dir * a.address.localeCompare(b.address, "da");
                    case "score": return dir * (a.score - b.score);
                    case "traffic": return dir * (a.trafficNum - b.trafficNum);
                    case "type": return dir * a.type.localeCompare(b.type, "da");
                    case "start": return dir * a.startDate.localeCompare(b.startDate);
                    case "end": return dir * a.endDate.localeCompare(b.endDate);
                    case "duration": return dir * (a.durationWeeks - b.durationWeeks);
                    case "applicant": return dir * (a.applicant || a.contractor || "").localeCompare(b.applicant || b.contractor || "", "da");
                    default: return dir * (a.score - b.score);
                  }
                });

                // Helpers: date calculations
                const daysSince = (dateStr: string) => {
                  if (!dateStr || dateStr === "?") return null;
                  const d = Math.round((Date.now() - new Date(dateStr).getTime()) / 86400000);
                  return d >= 0 ? d : null;
                };
                const daysUntil = (dateStr: string): number | null => {
                  if (!dateStr || dateStr === "?") return null;
                  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86400000);
                };

                // Map permits (enriched with timeline data)
                const mapPermits: MapPermit[] = scaffoldReport.topPermits
                  .filter((p) => p.lat && p.lng)
                  .map((p) => ({
                    address: p.address, type: p.type, category: p.category, score: p.score,
                    lat: p.lat, lng: p.lng, applicant: p.applicant || p.contractor,
                    period: `${p.startDate} → ${p.endDate}`,
                    createdDate: p.createdDate, durationWeeks: p.durationWeeks,
                    traffic: p.traffic,
                    daysLeft: daysUntil(p.endDate) ?? undefined,
                  }));

                const toggleCat = (cat: string) => {
                  setScaffoldFilter((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
                };

                const SortHeader = ({ col, label, align }: { col: string; label: string; align?: string }) => (
                  <th
                    className={`px-3 py-2.5 font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none transition-colors text-[10px] ${align === "center" ? "text-center" : "text-left"}`}
                    onClick={() => setScaffoldSort((prev) => ({ col, dir: prev.col === col && prev.dir === "desc" ? "asc" : "desc" }))}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {scaffoldSort.col === col && (
                        <svg className={`w-3 h-3 transition-transform ${scaffoldSort.dir === "asc" ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                      )}
                    </span>
                  </th>
                );

                return (
                <div className="animate-fade-in space-y-5">
                  {/* ── Header ── */}
                  <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
                          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15" /></svg>
                        </div>
                        <div>
                          <h2 className="text-lg font-bold">Aktive Stilladser &amp; Reklamer</h2>
                          <p className="text-sm text-white/70">{scaffoldCity} &mdash; kun aktive tilladelser &mdash; {new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" })}</p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          const top = sorted.filter(p => p.score >= 7).slice(0, 15);
                          if (top.length === 0) { addToast("Ingen lokationer med score >= 7", "info"); return; }
                          addToast(`Opretter ${top.length} ejendomme i pipeline...`, "info");
                          let created = 0; let skipped = 0;
                          for (const p of top) {
                            try {
                              const res = await fetch("/api/scaffold-to-pipeline", { method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ address: p.address, city: scaffoldCity, score: p.score, source: "scaffolding", category: p.category, applicant: p.applicant || p.contractor }) });
                              const data = await res.json();
                              if (data.success) created++;
                              else if (data.reason === "already_exists") skipped++;
                            } catch { /* skip */ }
                          }
                          addToast(`${created} oprettet, ${skipped} fandtes allerede`, created > 0 ? "success" : "info");
                          fetchData();
                        }}
                        className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white text-xs font-semibold rounded-xl transition-colors backdrop-blur-sm"
                      >
                        <span className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                          Send top til pipeline
                        </span>
                      </button>
                    </div>
                    {/* Two big category cards */}
                    <div className="grid grid-cols-2 gap-3">
                      {ALL_CATS.map((cat) => {
                        const count = groupTotals[cat] || 0;
                        const style = CATEGORY_STYLE[cat];
                        const isActive = scaffoldFilter.has(cat);
                        return (
                          <button key={cat} onClick={() => toggleCat(cat)} className={`rounded-xl px-4 py-3 text-left transition-all ${isActive ? "bg-white/20 ring-2 ring-white/40" : "bg-white/5 opacity-60"}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={style.icon} /></svg>
                              <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">{cat}</span>
                            </div>
                            <div className="text-3xl font-bold">{count}</div>
                            <div className="text-[10px] text-white/50">aktive tilladelser</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Score breakdown + Summary ── */}
                  {(() => {
                    const highScore = filtered.filter(p => p.score >= 8).length;
                    const midScore = filtered.filter(p => p.score >= 5 && p.score < 8).length;
                    const lowScore = filtered.filter(p => p.score < 5).length;
                    const endingSoon = filtered.filter(p => { const d = daysUntil(p.endDate); return d !== null && d > 0 && d <= 30; }).length;
                    const expired = filtered.filter(p => { const d = daysUntil(p.endDate); return d !== null && d <= 0; }).length;
                    return (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[10px] text-slate-500">Score 8-10:</span>
                          <span className="text-xs font-bold text-emerald-700">{highScore}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="text-[10px] text-slate-500">Score 5-7:</span>
                          <span className="text-xs font-bold text-blue-700">{midScore}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                          <div className="w-2 h-2 rounded-full bg-amber-500" />
                          <span className="text-[10px] text-slate-500">Score &lt;5:</span>
                          <span className="text-xs font-bold text-amber-700">{lowScore}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                          <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                          <span className="text-[10px] text-slate-500">Slutter snart:</span>
                          <span className="text-xs font-bold text-red-600">{endingSoon}</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200/60">
                          <div className="w-2 h-2 rounded-full bg-slate-400" />
                          <span className="text-[10px] text-slate-500">Udloebet:</span>
                          <span className="text-xs font-bold text-slate-600">{expired}</span>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-4">
                    <span>Viser <b className="text-slate-700">{filtered.length}</b> af {scaffoldReport.topPermits.length}</span>
                    <span className="text-slate-300">|</span>
                    <span>{mapPermits.filter((p) => scaffoldFilter.has(p.type)).length} med koordinater</span>
                    <span className="text-slate-300">|</span>
                    <span>Kilde: kbhkort.kk.dk (kun aktive)</span>
                    <div className="flex-1" />
                    <div className="inline-flex bg-slate-100 rounded-lg p-0.5">
                      {(["split", "map", "table"] as const).map((v) => (
                        <button key={v} onClick={() => setScaffoldView(v)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${scaffoldView === v ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                          {v === "split" ? "Kort + Tabel" : v === "map" ? "Kun kort" : "Kun tabel"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Map + Table ── */}
                  {scaffoldReport.topPermits.length > 0 && (
                    <div className={scaffoldView === "split" ? "grid grid-cols-1 xl:grid-cols-2 gap-4" : ""}>
                      {(scaffoldView === "map" || scaffoldView === "split") && (
                        <div>
                          <ScaffoldingMap
                            permits={mapPermits}
                            activeCategories={scaffoldFilter}
                            selectedIdx={scaffoldSelectedIdx}
                            onSelect={setScaffoldSelectedIdx}
                            height={scaffoldView === "map" ? 600 : 520}
                          />
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
                            {ALL_CATS.filter((c) => scaffoldFilter.has(c) && (groupTotals[c] || 0) > 0).map((cat) => (
                              <div key={cat} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                                <span className={`w-2.5 h-2.5 rounded-full ${CATEGORY_STYLE[cat].dot}`} />
                                {cat} ({groupTotals[cat]})
                              </div>
                            ))}
                            <span className="text-slate-300 mx-1">|</span>
                            {[{ label: "Score 8+", color: "bg-emerald-500" }, { label: "6-7", color: "bg-blue-500" }, { label: "4-5", color: "bg-amber-500" }, { label: "<4", color: "bg-red-500" }].map((s) => (
                              <div key={s.label} className="flex items-center gap-1 text-[10px] text-slate-400">
                                <span className={`w-2 h-2 rounded-full ${s.color}`} />
                                {s.label}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(scaffoldView === "table" || scaffoldView === "split") && (
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden">
                          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: scaffoldView === "split" ? 560 : 700 }}>
                            <table className="w-full text-xs">
                              <thead className="sticky top-0 z-10">
                                <tr className="bg-slate-50/95 backdrop-blur-sm">
                                  <th className="px-2 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider w-6 text-[10px]">#</th>
                                  <SortHeader col="address" label="Adresse" />
                                  <SortHeader col="type" label="Type" />
                                  <SortHeader col="score" label="Score" align="center" />
                                  <SortHeader col="traffic" label="Trafik" align="center" />
                                  <th className="px-3 py-2.5 text-left font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Tidslinje</th>
                                  <SortHeader col="applicant" label="Entrepr." />
                                  <th className="px-2 py-2.5 w-16" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {sorted.map((p, i) => {
                                  const origIdx = scaffoldReport.topPermits.indexOf(p);
                                  const isSelected = origIdx === scaffoldSelectedIdx;
                                  const style = CATEGORY_STYLE[p.type] || CATEGORY_STYLE["Stilladser"];
                                  const dSince = daysSince(p.startDate);
                                  const dLeft = daysUntil(p.endDate);
                                  const totalDays = (p.durationWeeks || 0) * 7;
                                  const elapsed = totalDays > 0 && dSince != null ? Math.min(dSince, totalDays) : 0;
                                  const pctElapsed = totalDays > 0 ? Math.min(100, Math.round((elapsed / totalDays) * 100)) : 0;
                                  const timelineColor = dLeft != null && dLeft <= 14 ? "bg-red-400" : dLeft != null && dLeft <= 60 ? "bg-amber-400" : "bg-emerald-400";

                                  return (
                                    <tr key={i}
                                      onClick={() => setScaffoldSelectedIdx(isSelected ? null : origIdx)}
                                      className={`cursor-pointer transition-colors ${isSelected ? "bg-violet-50/70" : "hover:bg-violet-50/30"}`}>
                                      <td className="px-2 py-2.5 text-slate-400 font-mono text-[10px]">{i + 1}</td>
                                      <td className="px-3 py-2.5 max-w-[180px]">
                                        <div className="font-semibold text-slate-800 truncate text-[11px]">{p.address}</div>
                                        {p.createdDate && p.createdDate !== "?" && (
                                          <div className="text-[9px] text-slate-400 mt-0.5 flex items-center gap-1">
                                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            Oprettet {p.createdDate}
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${style.bg} ${style.text}`}>
                                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                          {p.type === "Stilladsreklamer" ? "Reklame" : "Stillads"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-[10px] font-bold ${
                                          p.score >= 8 ? "bg-emerald-100 text-emerald-700" :
                                          p.score >= 6 ? "bg-blue-100 text-blue-700" :
                                          p.score >= 4 ? "bg-amber-100 text-amber-700" :
                                          "bg-slate-100 text-slate-500"
                                        }`}>{p.score}</span>
                                      </td>
                                      <td className="px-3 py-2.5 text-center">
                                        <span className={`text-[10px] font-semibold ${p.trafficNum >= 20000 ? "text-emerald-600" : p.trafficNum >= 10000 ? "text-blue-600" : "text-slate-400"}`}>
                                          {p.traffic}/d
                                        </span>
                                      </td>
                                      {/* Timeline column */}
                                      <td className="px-3 py-2.5 min-w-[160px]">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">{p.startDate || "?"}</span>
                                          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div className={`${timelineColor} h-full rounded-full transition-all`} style={{ width: `${Math.max(pctElapsed, pctElapsed > 0 ? 3 : 0)}%` }} />
                                          </div>
                                          <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">{p.endDate || "?"}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                          {dSince !== null && <span className="text-[9px] text-slate-400">{dSince}d siden start</span>}
                                          {dLeft !== null && (
                                            <span className={`text-[9px] font-semibold ${dLeft <= 0 ? "text-red-500" : dLeft <= 14 ? "text-red-500" : dLeft <= 60 ? "text-amber-500" : "text-emerald-600"}`}>
                                              {dLeft > 0 ? `${dLeft}d tilbage` : dLeft === 0 ? "Slutter i dag" : `Udloebet ${Math.abs(dLeft)}d`}
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 text-slate-600 max-w-[100px] truncate text-[11px]">{p.applicant || p.contractor || "-"}</td>
                                      <td className="px-2 py-2.5">
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setOohInitialFrame({ address: p.address, city: scaffoldCity, traffic: p.trafficNum || 0, type: "scaffolding" });
                                              setActiveTab("ooh");
                                              addToast(`Frame oprettet fra ${p.address}`, "success");
                                            }}
                                            className="px-2 py-1 text-[9px] font-semibold text-violet-600 bg-violet-50 border border-violet-200/60 rounded-md hover:bg-violet-100 whitespace-nowrap"
                                            title="Opret OOH Frame"
                                          >OOH</button>
                                          <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isSelected ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                          </svg>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* ── Expanded Detail Panel (below table) ── */}
                          {scaffoldSelectedIdx !== null && (() => {
                            const sel = scaffoldReport.topPermits[scaffoldSelectedIdx];
                            if (!sel) return null;
                            const dSince = daysSince(sel.startDate);
                            const dLeft = daysUntil(sel.endDate);
                            return (
                              <div className="border-t border-slate-200 bg-gradient-to-r from-violet-50/50 to-indigo-50/30 p-5 animate-fade-in">
                                <div className="flex items-start justify-between mb-4">
                                  <div>
                                    <h3 className="text-sm font-bold text-slate-900">{sel.address}</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">{sel.category} &middot; {sel.type === "Stilladsreklamer" ? "Stilladsreklame" : "Stillads"}</p>
                                  </div>
                                  <button onClick={() => setScaffoldSelectedIdx(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-white">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                  <div className="bg-white rounded-lg p-2.5 border border-slate-200/60">
                                    <div className="text-[9px] font-semibold text-slate-400 uppercase">Score</div>
                                    <div className={`text-lg font-bold ${sel.score >= 8 ? "text-emerald-600" : sel.score >= 6 ? "text-blue-600" : "text-amber-600"}`}>{sel.score}/10</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2.5 border border-slate-200/60">
                                    <div className="text-[9px] font-semibold text-slate-400 uppercase">Daglig trafik</div>
                                    <div className="text-lg font-bold text-slate-800">{sel.traffic}/d</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2.5 border border-slate-200/60">
                                    <div className="text-[9px] font-semibold text-slate-400 uppercase">Varighed</div>
                                    <div className="text-lg font-bold text-slate-800">{sel.durationWeeks || "?"} uger</div>
                                  </div>
                                  <div className="bg-white rounded-lg p-2.5 border border-slate-200/60">
                                    <div className="text-[9px] font-semibold text-slate-400 uppercase">Status</div>
                                    <div className={`text-sm font-bold ${dLeft != null && dLeft <= 0 ? "text-red-600" : dLeft != null && dLeft <= 14 ? "text-red-500" : dLeft != null && dLeft <= 60 ? "text-amber-600" : "text-emerald-600"}`}>
                                      {dLeft != null && dLeft <= 0 ? "Udloebet" : dLeft != null && dLeft <= 14 ? `${dLeft}d (snart slut)` : dLeft != null ? `${dLeft}d tilbage` : "Ukendt"}
                                    </div>
                                  </div>
                                </div>
                                {/* Dates row */}
                                <div className="grid grid-cols-3 gap-3 mb-4">
                                  {sel.createdDate && sel.createdDate !== "?" && (
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                      <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center shrink-0">
                                        <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                      </div>
                                      <div><div className="text-[9px] text-slate-400 font-semibold">OPRETTET</div><div className="font-mono text-[11px]">{sel.createdDate}</div></div>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 text-xs text-slate-600">
                                    <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
                                      <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>
                                    </div>
                                    <div><div className="text-[9px] text-slate-400 font-semibold">START</div><div className="font-mono text-[11px]">{sel.startDate || "?"}{dSince != null ? ` (${dSince}d)` : ""}</div></div>
                                  </div>
                                  <div className="flex items-center gap-2 text-xs text-slate-600">
                                    <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${dLeft != null && dLeft <= 14 ? "bg-red-50" : "bg-slate-100"}`}>
                                      <svg className={`w-3 h-3 ${dLeft != null && dLeft <= 14 ? "text-red-500" : "text-slate-500"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                                    </div>
                                    <div><div className="text-[9px] text-slate-400 font-semibold">SLUT</div><div className="font-mono text-[11px]">{sel.endDate || "?"}</div></div>
                                  </div>
                                </div>
                                {/* Extra info */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {(sel.applicant || sel.contractor) && (
                                    <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                                      <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Entrepr. / Ansoeger</div>
                                      <div className="text-xs text-slate-700">{sel.applicant || sel.contractor}</div>
                                    </div>
                                  )}
                                  {sel.description && (
                                    <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                                      <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Beskrivelse</div>
                                      <div className="text-xs text-slate-600">{sel.description}</div>
                                    </div>
                                  )}
                                  {sel.facadeArea && (
                                    <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                                      <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Facadeareal</div>
                                      <div className="text-xs text-slate-700">{sel.facadeArea} m&sup2;</div>
                                    </div>
                                  )}
                                  {sel.sagsnr && (
                                    <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                                      <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Sagsnr.</div>
                                      <div className="text-xs font-mono text-slate-700">{sel.sagsnr}</div>
                                    </div>
                                  )}
                                  {sel.scoreReason && (
                                    <div className="bg-white rounded-lg p-3 border border-slate-200/60 md:col-span-2">
                                      <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Score-begrundelse</div>
                                      <div className="text-xs text-slate-600 leading-relaxed">{sel.scoreReason}</div>
                                    </div>
                                  )}
                                  {(sel.contactPerson || sel.contactEmail) && (
                                    <div className="bg-white rounded-lg p-3 border border-slate-200/60">
                                      <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Kontaktinfo</div>
                                      {sel.contactPerson && <div className="text-xs text-slate-700">{sel.contactPerson}</div>}
                                      {sel.contactEmail && <div className="text-xs text-brand-600 mt-0.5">{sel.contactEmail}</div>}
                                    </div>
                                  )}
                                </div>
                                {/* Actions */}
                                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200/60">
                                  <button
                                    onClick={() => { setOohInitialFrame({ address: sel.address, city: scaffoldCity, traffic: sel.trafficNum || 0, type: "scaffolding" }); setActiveTab("ooh"); addToast(`Frame oprettet fra ${sel.address}`, "success"); }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-200 rounded-lg hover:bg-violet-100"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159" /></svg>
                                    Opret OOH Frame
                                  </button>
                                  <button
                                    onClick={async () => {
                                      try {
                                        const res = await fetch("/api/scaffold-to-pipeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: sel.address, city: scaffoldCity, score: sel.score, source: "scaffolding", category: sel.category, applicant: sel.applicant || sel.contractor }) });
                                        const data = await res.json();
                                        if (data.success) { addToast(`${sel.address} oprettet i pipeline`, "success"); fetchData(); }
                                        else addToast(data.message || "Fejl", "info");
                                      } catch { addToast("Fejl ved oprettelse", "error"); }
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                                    Send til pipeline
                                  </button>
                                  {sel.lat && sel.lng && (
                                    <a href={`https://www.google.com/maps?q=${sel.lat},${sel.lng}`} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                                    >
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                                      Google Maps
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })()}

              {/* ── Empty state ── */}
              {!scaffoldRunning && scaffoldEvents.length === 0 && !scaffoldReport && (
                <EmptyState
                  icon="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15"
                  title="Aktive stilladser & reklamer"
                  description="Henter kun aktive stillads-tilladelser og stilladsreklamer fra kbhkort.kk.dk. Viser startdato, slutdato og hvor lang tid der er tilbage. Visualiser på kort eller i tabel."
                />
              )}
            </div>
          )}

          {/* ═══ STAGING QUEUE TAB ═══ */}
          {activeTab === "staging" && (
            <div className="animate-fade-in">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">Staging Queue</h1>
                  <p className="text-sm text-slate-400 mt-0.5">Gennemgå og godkend ejendomme inden de pushes til HubSpot</p>
                </div>
              </div>
              <StagingQueue />
            </div>
          )}

          {/* ═══ PROPERTIES TAB ═══ */}
          {activeTab === "properties" && (
            <div className="animate-fade-in">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">Ejendomme</h1>
                  <p className="text-xs text-slate-500 mt-0.5">{properties.length} ejendomme i pipeline</p>
                </div>
                <div className="flex items-center gap-2">
                  {researchRunning ? (
                    <button onClick={stopResearch}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl shadow-sm transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                      Stop research
                    </button>
                  ) : (
                    <button onClick={() => triggerResearch()} disabled={!!researchRunning}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" /></svg>
                      Koer al research
                    </button>
                  )}
                </div>
              </div>

              {/* Quick-add */}
              <div className="mb-5 bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </div>
                    <input type="text" value={quickAddAddress} onChange={(e) => setQuickAddAddress(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && quickAddAddress.trim()) quickAddProperty(true); }}
                      placeholder="Tilfoej ejendom — fx Jagtvej 43, 2200 Koebenhavn"
                      className="w-full pl-9 pr-4 py-2.5 border border-slate-200/60 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300 placeholder:text-slate-400"
                      disabled={quickAddLoading} />
                  </div>
                  <button onClick={() => quickAddProperty(false)} disabled={!quickAddAddress.trim() || quickAddLoading}
                    className="px-3.5 py-2.5 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap transition-colors">
                    {quickAddLoading ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-slate-300/30 border-t-slate-600" /> : "Tilfoej"}
                  </button>
                  <button onClick={() => quickAddProperty(true)} disabled={!quickAddAddress.trim() || quickAddLoading}
                    className="px-3.5 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/15 disabled:opacity-40 whitespace-nowrap transition-all">
                    {quickAddLoading ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white" /> : "+ Research"}
                  </button>
                </div>
              </div>

              {/* Approval Queue – shown when there are properties ready to send */}
              {properties.filter(p => p.outreachStatus === "KLAR_TIL_UDSENDELSE").length > 0 && (
                <div className="mb-6 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200/60 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-emerald-800">Godkendelseskoe</h3>
                        <p className="text-[10px] text-emerald-600">{properties.filter(p => p.outreachStatus === "KLAR_TIL_UDSENDELSE").length} ejendomme klar til udsendelse</p>
                      </div>
                    </div>
                    <button onClick={() => setStatusFilter(statusFilter === "ready" ? null : "ready")}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition-colors">
                      {statusFilter === "ready" ? "Vis alle" : "Vis kun klar"}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {properties.filter(p => p.outreachStatus === "KLAR_TIL_UDSENDELSE").slice(0, 5).map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-white/70 rounded-xl px-4 py-2.5 border border-emerald-100">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">{p.name || p.address}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                            {p.primaryContact?.email && <span className="text-emerald-600">{p.primaryContact.email}</span>}
                            {p.emailDraftSubject && <span className="truncate max-w-[200px]">Emne: {p.emailDraftSubject}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-3">
                          <button onClick={() => { setExpandedProperty(p.id); setStatusFilter("ready"); }}
                            className="px-2.5 py-1 text-[10px] font-semibold text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50">
                            Se udkast
                          </button>
                          <button onClick={() => sendSingleEmail(p.id)}
                            className="px-2.5 py-1 text-[10px] font-semibold text-white bg-emerald-500 rounded-md hover:bg-emerald-600">
                            Send
                          </button>
                          <button onClick={() => submitFeedback(p.id, "irrelevant")}
                            className="px-2 py-1 text-[10px] font-semibold text-red-500 border border-red-200 rounded-md hover:bg-red-50">
                            Afvis
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pipeline Stats (Clickable!) */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                <PipelineStat label="Total" value={dashboard?.totalProperties || 0} color="slate" icon="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21" active={!statusFilter} onClick={() => setStatusFilter(null)} />
                <PipelineStat label="Afventer" value={dashboard?.pendingResearch || 0} color="amber" icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" active={statusFilter === "pending"} onClick={() => setStatusFilter(statusFilter === "pending" ? null : "pending")} />
                <PipelineStat label="Researching" value={dashboard?.researchInProgress || 0} color="blue" icon="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5" active={statusFilter === "researching"} onClick={() => setStatusFilter(statusFilter === "researching" ? null : "researching")} />
                <PipelineStat label="Researched" value={dashboard?.researchDone || 0} color="indigo" icon="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" active={statusFilter === "researched"} onClick={() => setStatusFilter(statusFilter === "researched" ? null : "researched")} />
                <PipelineStat label="Klar" value={dashboard?.readyToSend || 0} color="green" icon="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" active={statusFilter === "ready"} onClick={() => setStatusFilter(statusFilter === "ready" ? null : "ready")} />
                <PipelineStat label="Sendt" value={dashboard?.mailsSent || 0} color="emerald" icon="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859" active={statusFilter === "sent"} onClick={() => setStatusFilter(statusFilter === "sent" ? null : "sent")} />
              </div>

              {/* Filter/Sort Bar */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-3 mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[140px] max-w-[200px]">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607Z" />
                      </svg>
                    </div>
                    <input type="text" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}
                      placeholder="Soeg adresse/ejer..."
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:border-indigo-300 placeholder:text-slate-400" />
                  </div>

                  {/* City filter */}
                  {availableCities.length > 1 && (
                    <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:border-indigo-300">
                      <option value="">Alle byer</option>
                      {availableCities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}

                  {/* Score filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase">Score</span>
                    <select value={scoreFilter[0]} onChange={(e) => setScoreFilter([parseInt(e.target.value), scoreFilter[1]])}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white w-12 text-center">
                      {[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                    <span className="text-[10px] text-slate-400">-</span>
                    <select value={scoreFilter[1]} onChange={(e) => setScoreFilter([scoreFilter[0], parseInt(e.target.value)])}
                      className="text-xs border border-slate-200 rounded-md px-1.5 py-1 bg-white w-12 text-center">
                      {[0,1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>

                  {/* Active filter badges */}
                  {(statusFilter || cityFilter || scoreFilter[0] > 0 || scoreFilter[1] < 10) && (
                    <button onClick={() => { setStatusFilter(null); setCityFilter(""); setScoreFilter([0, 10]); setPropertyFilter(""); }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-brand-50 text-brand-700 text-[10px] font-semibold rounded-lg border border-brand-200/60 hover:bg-brand-100">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Nulstil
                    </button>
                  )}

                  <div className="flex-1" />

                  <span className="text-[10px] text-slate-400">{filteredProperties.length}/{properties.length}</span>

                  {/* Sort */}
                  <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                    {SORT_OPTIONS.map((opt) => (
                      <button key={opt.key}
                        onClick={() => { if (sortBy === opt.key) setSortAsc(!sortAsc); else { setSortBy(opt.key); setSortAsc(true); } }}
                        className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-colors ${
                          sortBy === opt.key ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        }`}>
                        {opt.label}
                        {sortBy === opt.key && (
                          <svg className={`inline w-3 h-3 ml-0.5 transition-transform ${sortAsc ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Property Cards */}
              <div className="space-y-3">
                {filteredProperties.length === 0 ? (
                  <EmptyState
                    icon="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75"
                    title={propertyFilter || statusFilter ? "Ingen resultater" : "Ingen ejendomme endnu"}
                    description={propertyFilter || statusFilter ? "Proev et andet sogeord eller nulstil filteret" : "Brug Discovery-fanen til at scanne veje og finde ejendomme."}
                  />
                ) : (
                  filteredProperties.map((p) => (
                    <PropertyCard
                      key={p.id}
                      property={p}
                      expanded={expandedProperty === p.id}
                      onToggle={() => setExpandedProperty(expandedProperty === p.id ? null : p.id)}
                      onResearch={() => triggerResearch(p.id)}
                      researchRunning={researchRunning === p.id}
                      onFeedback={(fb) => submitFeedback(p.id, fb)}
                      onCreateProposal={() => {
                        setOohInitialClient({
                          company: p.ownerCompanyName || p.name || "",
                          contactName: p.primaryContact?.name || p.contactPerson || "",
                          email: p.primaryContact?.email || p.contactEmail || "",
                        });
                        setOohInitialFrame({
                          address: p.address || p.name || "",
                          city: p.city || "",
                          traffic: 0,
                          type: "facade",
                        });
                        setActiveTab("ooh");
                        addToast(`OOH Proposal startet for ${p.name || p.address} – frame oprettes automatisk`, "success");
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* ═══ RESEARCH TAB ═══ */}
          {activeTab === "research" && (
            <div className="animate-fade-in">
              <div className="mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">Research Live</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Se AI-agenten researche ejendomme i realtid</p>
                  </div>
                  {researchRunning && (
                    <button onClick={stopResearch}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                      Stop
                    </button>
                  )}
                </div>
              </div>

              {researchEvents.length === 0 && !researchRunning && (
                <div className="mb-6">
                  <EmptyState
                    icon="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3"
                    title="Ingen aktiv research"
                    description="Start research for at se AI-agenten arbejde i realtid -- websogning, kontaktfinding, og email-generering."
                    action={
                      <button onClick={() => triggerResearch()}
                        className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 gradient-brand text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-indigo-500/20">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                        </svg>
                        Koer research for alle ventende
                      </button>
                    }
                  />
                </div>
              )}

              {(researchRunning || researchEvents.length > 0) && (
                <div className="space-y-4">
                  {/* Research Context Cards */}
                  {(currentResearchProperty || researchSummary.oisOwner) && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 animate-fade-in">
                      {currentResearchProperty && (
                        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Ejendom</div>
                          <div className="text-sm font-bold text-slate-900">{currentResearchProperty.name || currentResearchProperty.address}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{currentResearchProperty.postalCode} {currentResearchProperty.city}</div>
                        </div>
                      )}
                      {researchSummary.oisOwner && (
                        <div className="bg-white rounded-2xl border border-green-200/60 shadow-[var(--card-shadow)] p-4">
                          <div className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-1">OIS Ejer</div>
                          <div className="text-sm font-bold text-slate-900">{researchSummary.oisOwner}</div>
                          <div className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Officiel kilde
                          </div>
                        </div>
                      )}
                      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Soegninger</div>
                        <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{researchSummary.totalSearches}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">websogninger gennemfoert</div>
                      </div>
                      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Fundet</div>
                        <div className="flex items-baseline gap-3">
                          <div>
                            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">{researchSummary.contactsFound}</span>
                            <span className="text-[10px] text-slate-400 ml-1">kontakter</span>
                          </div>
                          <div>
                            <span className="text-2xl font-extrabold text-brand-600 tabular-nums">{researchSummary.emailsFound}</span>
                            <span className="text-[10px] text-slate-400 ml-1">emails</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <ProgressBar pct={researchPct} running={!!researchRunning} phase="" />
                  <LogPanel logRef={researchLogRef} events={researchEvents} running={!!researchRunning} maxHeight="max-h-[550px]" />
                </div>
              )}
            </div>
          )}

          {/* ═══ STREET AGENT TAB ═══ */}
          {activeTab === "street_agent" && (
            <div className="animate-fade-in">
              <div className="mb-5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Gade-Agent</h1>
                <p className="text-xs text-slate-500 mt-0.5">Auto-pipeline: Scan &rarr; Research &rarr; Email</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5 mb-5">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Vejnavn</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                      </div>
                      <input type="text" value={agentStreet} onChange={(e) => setAgentStreet(e.target.value)}
                        placeholder="fx Vesterbrogade, Noerrebrogade, Amagerbrogade..."
                        onKeyDown={(e) => e.key === "Enter" && triggerStreetAgent()}
                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300 placeholder:text-slate-400" />
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">By</label>
                    <select value={agentCity} onChange={(e) => setAgentCity(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm bg-slate-50/50 focus:bg-white focus:border-indigo-300">
                      <option value="København">Koebenhavn</option>
                      <option value="Aarhus">Aarhus</option>
                      <option value="Odense">Odense</option>
                      <option value="Aalborg">Aalborg</option>
                      <option value="Frederiksberg">Frederiksberg</option>
                    </select>
                  </div>
                  <div className="md:col-span-4 flex gap-2">
                    {agentRunning ? (
                      <>
                        <button disabled className="flex-1 inline-flex items-center justify-center gap-2.5 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold rounded-xl opacity-70 cursor-not-allowed">
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />Agent koerer...
                        </button>
                        <button onClick={stopStreetAgent} className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" /></svg>
                          Stop
                        </button>
                      </>
                    ) : (
                      <button onClick={triggerStreetAgent} disabled={!agentStreet.trim()}
                        className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-amber-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                        Start Agent
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200/60">
                  <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <span className="font-semibold">Fuld automatisering:</span> Agenten finder alle bygninger pa vejen, opretter dem i HubSpot,
                      koerer dyb research (OIS/CVR/web), og genererer personlige email-udkast. Du godkender mails under{" "}
                      <button onClick={() => setActiveTab("outreach")} className="underline font-semibold hover:text-amber-900">Outreach-fanen</button>.
                    </p>
                  </div>
                </div>
              </div>

              {(agentRunning || agentEvents.length > 0) && (
                <div className="mb-6 animate-fade-in">
                  {/* Agent phase indicator */}
                  <div className="flex items-center gap-3 mb-4">
                    {["discovery", "research", "done"].map((phase, i) => {
                      const isActive = agentPhaseLabel === phase || (phase === "done" && agentStats);
                      const isDone = (phase === "discovery" && (agentPhaseLabel === "research" || !!agentStats)) ||
                                     (phase === "research" && !!agentStats) ||
                                     (phase === "done" && !!agentStats && !agentRunning);
                      return (
                        <div key={phase} className="flex items-center gap-2">
                          {i > 0 && <div className={`w-8 h-0.5 ${isDone ? "bg-green-400" : isActive ? "bg-amber-400" : "bg-slate-200"}`} />}
                          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
                            isDone ? "bg-green-100 text-green-700" :
                            isActive ? "bg-amber-100 text-amber-700" :
                            "bg-slate-100 text-slate-400"
                          }`}>
                            {isDone && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>}
                            {isActive && !isDone && <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                            {phase === "discovery" ? "Find bygninger" : phase === "research" ? "Research ejere" : "Faerdig"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <ProgressBar pct={agentPct} running={agentRunning} phase={agentPhaseLabel} />
                  <LogPanel logRef={agentLogRef} events={agentEvents} running={agentRunning} maxHeight="max-h-[500px]" />
                </div>
              )}

              {agentStats && !agentRunning && (
                <div className="animate-fade-in">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                    <ResultStat label="Bygninger fundet" value={agentStats.totalBuildings || 0} icon="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />
                    <ResultStat label="Nye ejendomme" value={agentStats.created || 0} icon="M12 4.5v15m7.5-7.5h-15" color="green" />
                    <ResultStat label="Research OK" value={agentStats.researchCompleted || 0} icon="M4.5 12.75l6 6 9-13.5" color="brand" />
                    <ResultStat label="Email-udkast" value={agentStats.emailDraftsGenerated || 0} icon="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" color="green" />
                    <ResultStat label="Fejlet" value={agentStats.researchFailed || 0} icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" color={agentStats.researchFailed ? "red" : undefined} />
                  </div>

                  {(agentStats.emailDraftsGenerated || 0) > 0 && (
                    <div className="bg-green-50 border border-green-200/80 rounded-2xl p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-green-900">{agentStats.emailDraftsGenerated} email-udkast klar til godkendelse</h3>
                          <p className="text-sm text-green-700 mt-0.5">Ga til Outreach-fanen for at gennemga og sende mails</p>
                        </div>
                        <button onClick={() => { setActiveTab("outreach"); fetchOutreachData(); }}
                          className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors">
                          Ga til Outreach &rarr;
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!agentRunning && agentEvents.length === 0 && (
                <EmptyState
                  icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
                  title="Klar til at koere"
                  description="Indtast et vejnavn og vaelg by. Agenten finder alle ejendomme, researcher ejere via OIS/CVR/web, og genererer personlige email-udkast. Du godkender mails inden afsendelse."
                />
              )}
            </div>
          )}

          {/* ═══ OUTREACH TAB ═══ */}
          {activeTab === "outreach" && (
            <div className="animate-fade-in">
              <div className="mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">Outreach</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Godkend, rediger og send emails</p>
                  </div>
                  <div>
                    <button onClick={fetchOutreachData} disabled={outreachLoading}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      <svg className={`w-4 h-4 ${outreachLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                      </svg>
                      Opdater
                    </button>
                  </div>
                </div>
              </div>

              {/* Gmail Status */}
              {outreachData && (
                <div className={`mb-6 p-4 rounded-2xl border ${
                  outreachData.gmail.working ? "bg-green-50 border-green-200/80" :
                  outreachData.gmail.configured ? "bg-amber-50 border-amber-200/80" :
                  "bg-red-50 border-red-200/80"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${outreachData.gmail.working ? "bg-green-500" : outreachData.gmail.configured ? "bg-amber-500 animate-pulse" : "bg-red-500"}`} />
                    <span className={`text-sm font-semibold ${outreachData.gmail.working ? "text-green-800" : outreachData.gmail.configured ? "text-amber-800" : "text-red-800"}`}>
                      {outreachData.gmail.working ? `Gmail API tilsluttet: ${outreachData.gmail.email}` :
                       outreachData.gmail.configured ? `Gmail konfigureret, men fejl: ${outreachData.gmail.error}` :
                       "Gmail API ikke konfigureret"}
                    </span>
                    {outreachData.gmail.working && (
                      <span className="ml-auto text-xs font-medium text-green-600 bg-green-100 px-2.5 py-1 rounded-full">
                        {outreachData.stats.sentThisHour}/{outreachData.stats.rateLimitPerHour} sendt denne time
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Queue Stats */}
              {outreachData && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <ResultStat label="Klar til afsendelse" value={readyToSend.length} icon="M4.5 12.75l6 6 9-13.5" color="brand" />
                  <ResultStat label="I koe" value={outreachData.stats.queued} icon="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75" />
                  <ResultStat label="Sendt i dag" value={outreachData.stats.sent} icon="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" color="green" />
                  <ResultStat label="Fejlet" value={outreachData.stats.failed} icon="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0z" color={outreachData.stats.failed > 0 ? "red" : undefined} />
                  <ResultStat label="Sender nu" value={outreachData.stats.sending} icon="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" color={outreachData.stats.sending > 0 ? "brand" : undefined} />
                </div>
              )}

              {/* Ready to Send – Approval Queue */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <span className="font-bold text-sm text-slate-900">Klar til godkendelse</span>
                      <span className="text-xs text-slate-400 ml-2">{readyToSend.length} ejendomme</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {readyToSend.length > 0 && (
                      <>
                        <button onClick={() => {
                          if (selectedForSend.size === readyToSend.length) {
                            setSelectedForSend(new Set());
                          } else {
                            setSelectedForSend(new Set(readyToSend.map(p => p.id)));
                          }
                        }}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50">
                          {selectedForSend.size === readyToSend.length ? "Fravaalg alle" : "Vaalg alle"}
                        </button>
                        <button onClick={sendBatchEmails} disabled={selectedForSend.size === 0}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                          </svg>
                          Send {selectedForSend.size} valgte
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {readyToSend.length === 0 ? (
                  <div className="p-12 text-center">
                    <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" />
                    </svg>
                    <p className="text-sm text-slate-500">Ingen ejendomme klar til udsendelse endnu</p>
                    <p className="text-xs text-slate-400 mt-1">Koer Gade-Agenten eller Research for at generere email-udkast</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {readyToSend.map((prop) => (
                      <div key={prop.id} className="px-6 py-4 flex items-start gap-4 hover:bg-slate-50/50 transition-colors">
                        <input type="checkbox" checked={selectedForSend.has(prop.id)}
                          onChange={(e) => {
                            setSelectedForSend(prev => {
                              const next = new Set(prev);
                              e.target.checked ? next.add(prop.id) : next.delete(prop.id);
                              return next;
                            });
                          }}
                          className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="font-semibold text-sm text-slate-900 truncate">{prop.address}</span>
                            {prop.ownerCompanyName && (
                              <span className="text-xs text-slate-500 truncate">{prop.ownerCompanyName}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span>Til: <span className="font-medium text-slate-700">{prop.contactEmail || "?"}</span></span>
                            <span>Kontakt: {prop.contactPerson || "?"}</span>
                            {prop.emailDraftSubject && (
                              <span className="truncate max-w-xs text-slate-400">Emne: {prop.emailDraftSubject}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => {
                            setEmailPreview({
                              propertyId: prop.id,
                              to: prop.contactEmail || "",
                              subject: prop.emailDraftSubject || "",
                              body: prop.emailDraftBody || "",
                              contactName: prop.contactPerson || undefined,
                            });
                            setEditingEmail({ subject: prop.emailDraftSubject || "", body: prop.emailDraftBody || "" });
                          }}
                            className="text-xs font-medium text-brand-600 hover:text-brand-700 px-3 py-1.5 rounded-lg hover:bg-brand-50">
                            Se / Rediger
                          </button>
                          <button onClick={() => sendSingleEmail(prop.id)}
                            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 px-3 py-1.5 rounded-lg hover:bg-emerald-50">
                            Send
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Email Preview / Edit Modal */}
              {emailPreview && editingEmail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setEmailPreview(null)}>
                  <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900">Email-udkast</h3>
                      <button onClick={() => setEmailPreview(null)} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">TIL</label>
                        <div className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">{emailPreview.contactName ? `${emailPreview.contactName} <${emailPreview.to}>` : emailPreview.to}</div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">FRA</label>
                        <div className="text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded-lg">mads.ejendomme@hydemedia.dk</div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">EMNE</label>
                        <input type="text" value={editingEmail.subject} onChange={(e) => setEditingEmail(prev => prev ? { ...prev, subject: e.target.value } : prev)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-300" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">INDHOLD</label>
                        <textarea value={editingEmail.body} onChange={(e) => setEditingEmail(prev => prev ? { ...prev, body: e.target.value } : prev)}
                          rows={12}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-300 resize-y" />
                      </div>
                      {/* Attachment toggle */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">BILAG (valgfrit)</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            placeholder="/api/ooh/generate-pdf?proposalId=... eller tomt"
                            value={editingEmail.attachmentUrl || ""}
                            onChange={(e) => setEditingEmail(prev => prev ? { ...prev, attachmentUrl: e.target.value || undefined } : prev)}
                            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-indigo-300"
                          />
                          {editingEmail.attachmentUrl && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 text-violet-700 text-[10px] font-semibold rounded-lg border border-violet-200">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
                              PDF vedhæftet
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
                      <button onClick={() => setEmailPreview(null)}
                        className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg">Annuller</button>
                      <button onClick={() => {
                        sendSingleEmail(emailPreview.propertyId, editingEmail.attachmentUrl);
                        setEmailPreview(null);
                      }}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                        {editingEmail.attachmentUrl ? "Send med PDF" : "Godkend & Send"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Queue Activity */}
              {outreachData && outreachData.items.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <span className="font-bold text-sm text-slate-900">Seneste aktivitet</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                    {outreachData.items.slice(0, 30).map((item) => (
                      <div key={item.id} className="px-6 py-3 flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${
                          item.status === "sent" ? "bg-green-500" :
                          item.status === "sending" ? "bg-amber-500 animate-pulse" :
                          item.status === "queued" ? "bg-blue-400" :
                          "bg-red-500"
                        }`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-slate-700 truncate block">{item.to}</span>
                          <span className="text-[10px] text-slate-400 truncate block">{item.subject}</span>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          item.status === "sent" ? "bg-green-100 text-green-700" :
                          item.status === "sending" ? "bg-amber-100 text-amber-700" :
                          item.status === "queued" ? "bg-blue-100 text-blue-700" :
                          "bg-red-100 text-red-700"
                        }`}>
                          {item.status === "sent" ? "Sendt" : item.status === "sending" ? "Sender..." : item.status === "queued" ? "I koe" : "Fejlet"}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">{new Date(item.queuedAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!outreachData && (
                <div className="text-center py-12">
                  <button onClick={fetchOutreachData}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors">
                    Hent outreach-data
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ═══ OOH PROPOSALS TAB ═══ */}
          {activeTab === "ooh" && (
            <div className="animate-fade-in">
              <div className="mb-5">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">OOH Proposals</h1>
                <p className="text-xs text-slate-500 mt-0.5">Generer mockups, Slides og PDF — send direkte til klienter</p>
              </div>
              <OOHPanel
                initialFrame={oohInitialFrame}
                initialClient={oohInitialClient}
                onToast={addToast}
              />
            </div>
          )}

          {/* ═══ SETTINGS TAB ═══ */}
          {activeTab === "settings" && (
            <div className="animate-fade-in space-y-6">
              {/* Header */}
              <div className="mb-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Indstillinger</h1>
                <p className="text-xs text-slate-500 mt-0.5">Konfigurer autonomi, regler og system-status</p>
              </div>

              {/* Autonomy Level */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Autonomi-niveau</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">Bestem hvor meget systemet maa goere automatisk. Hoejere niveau = mere automation.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { level: 0, label: "Kun forslag", desc: "Ingen automatik. Alt skal godkendes manuelt.", color: "border-slate-200 bg-slate-50 text-slate-700" },
                    { level: 1, label: "Auto-research", desc: "Research koeres automatisk naar regler matcher. Du godkender emails.", color: "border-blue-200 bg-blue-50 text-blue-700" },
                    { level: 2, label: "Auto + foerste mail", desc: "Research + foerste mail sendes automatisk. Du godkender opfoelgning.", color: "border-violet-200 bg-violet-50 text-violet-700" },
                    { level: 3, label: "Fuld automat", desc: "Alt inkl. opfoelgning koeres automatisk. Kun manuelt close/reopen.", color: "border-emerald-200 bg-emerald-50 text-emerald-700" },
                  ] as const).map((opt) => (
                    <div key={opt.level}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${opt.color} ${opt.level === 0 ? "ring-2 ring-brand-300 ring-offset-2" : "hover:shadow-md opacity-70"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold uppercase">{opt.label}</span>
                        <span className="text-lg font-bold">{opt.level}</span>
                      </div>
                      <p className="text-[10px] leading-snug">{opt.desc}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-3">Autonomi-niveau er sat til 0 (Kun forslag). Du kan skrue op efterhaanden som du stoler mere paa systemet.</p>
              </div>

              {/* Auto-Research Rules */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Auto-Research Regler</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">Definer regler for automatisk research af nye ejendomme. Reglerne koeres som cron-job.</p>
                <div className="space-y-3">
                  {[
                    { id: "new-high-score", label: "Nye ejendomme med score >= 7 og trafik >= 15K", active: false, detail: "Koerer automatisk research paa nye ejendomme der scorer hoejt" },
                    { id: "retry-contact-pending", label: "Genforsog research for ejendomme uden kontakt (max 72t)", active: false, detail: "Proever igen for ejendomme hvor kontakt mangler" },
                    { id: "retry-errors", label: "Genforsog fejlede research-jobs", active: false, detail: "Automatisk retry paa ejendomme med fejl-status" },
                  ].map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-700">{rule.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{rule.detail}</div>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${rule.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                          {rule.active ? "Aktiv" : "Inaktiv"}
                        </span>
                        <div className={`w-8 h-4.5 rounded-full relative cursor-pointer transition-colors ${rule.active ? "bg-emerald-500" : "bg-slate-300"}`}
                          onClick={() => addToast("Auto-research regler kan aktiveres naar autonomi-niveau >= 1", "info")}>
                          <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-transform ${rule.active ? "left-4" : "left-0.5"}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200/60 rounded-xl">
                  <p className="text-[10px] text-amber-700">
                    <strong>Cron-endpoint:</strong> <code className="bg-amber-100 px-1 rounded text-[9px]">GET /api/auto-research?secret=DIN_CRON_SECRET</code><br />
                    Kald dette endpoint fra en scheduler (f.eks. cron-job.org) for at aktivere reglerne. Saet CRON_SECRET i env vars.
                  </p>
                </div>
              </div>

              {/* System Health (detailed) */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Systemstatus</h3>
                  </div>
                  {systemHealth && (
                    <span className={`px-2.5 py-1 text-[10px] font-bold rounded-lg ${
                      systemHealth.status === "healthy" ? "bg-emerald-100 text-emerald-700" :
                      systemHealth.status === "degraded" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                    }`}>
                      {systemHealth.status === "healthy" ? "Alle systemer OK" :
                       systemHealth.status === "degraded" ? "Delvist nedsat" : "Problemer"}
                    </span>
                  )}
                </div>
                {systemHealth ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(systemHealth.pings || {}).map(([key, rawPing]) => {
                      const ping = rawPing as { ok: boolean; service: string; latencyMs?: number; error?: string };
                      return (
                        <div key={key} className={`p-3 rounded-xl border ${ping.ok ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-slate-700">{ping.service}</span>
                            <span className={`w-2 h-2 rounded-full ${ping.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                          </div>
                          <div className="flex items-center gap-2">
                            {ping.latencyMs != null && (
                              <span className="text-[10px] text-slate-500 font-mono">{ping.latencyMs}ms</span>
                            )}
                            <span className={`text-[10px] font-semibold ${ping.ok ? "text-emerald-600" : "text-red-600"}`}>
                              {ping.ok ? "Online" : "Offline"}
                            </span>
                          </div>
                          {ping.error && <p className="text-[9px] text-red-500 mt-1 truncate">{ping.error}</p>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-400">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-slate-300/30 border-t-slate-600 mx-auto mb-2" />
                    <p className="text-xs">Henter systemstatus...</p>
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400">
                  <span>API Endpoint:</span>
                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[9px] font-mono">GET /api/status</code>
                  <span className="ml-auto">Opdateres hvert 2. minut</span>
                </div>
              </div>

              {/* API Integrations */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" /></svg>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">API Integrationer</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">Status for konfigurerede API-forbindelser. Saet env vars i <code className="bg-slate-100 px-1 rounded text-[9px]">.env.local</code></p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(() => {
                    const apis = [
                      { name: "HubSpot CRM", envKey: "HUBSPOT_ACCESS_TOKEN", desc: "Ejendomme, kontakter, pipeline", check: "hubspot" },
                      { name: "OpenAI / GPT", envKey: "OPENAI_API_KEY", desc: "AI analyse, email-udkast", check: "openai" },
                      { name: "Gmail API", envKey: "GMAIL_CLIENT_ID", desc: "Email-afsendelse", check: "gmail" },
                      { name: "Supabase", envKey: "NEXT_PUBLIC_SUPABASE_URL", desc: "Database, staging, OOH data", check: "supabase" },
                      { name: "DAWA / Adresse", envKey: null, desc: "Adresseopslag (gratis)", check: "dawa" },
                      { name: "CVR API", envKey: "CVR_API_USER", desc: "Virksomhedsopslag", check: "cvr" },
                    ];
                    return apis.map(api => {
                      const ping = systemHealth?.pings?.[api.check] as { ok: boolean; latencyMs?: number; error?: string } | undefined;
                      const isOk = ping?.ok ?? null;
                      return (
                        <div key={api.name} className={`p-3 rounded-xl border ${isOk === true ? "border-emerald-200/60 bg-emerald-50/30" : isOk === false ? "border-red-200/60 bg-red-50/30" : "border-slate-200 bg-slate-50/30"}`}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-800">{api.name}</span>
                            <div className="flex items-center gap-1.5">
                              {ping?.latencyMs != null && <span className="text-[9px] font-mono text-slate-400">{ping.latencyMs}ms</span>}
                              <span className={`w-2.5 h-2.5 rounded-full ${isOk === true ? "bg-emerald-500" : isOk === false ? "bg-red-500" : "bg-slate-300"}`} />
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500">{api.desc}</p>
                          {api.envKey && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <code className="text-[8px] font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-500">{api.envKey}</code>
                              <span className={`text-[9px] font-semibold ${isOk === true ? "text-emerald-600" : isOk === false ? "text-red-500" : "text-slate-400"}`}>
                                {isOk === true ? "Forbundet" : isOk === false ? "Fejl" : "Ukendt"}
                              </span>
                            </div>
                          )}
                          {ping?.error && <p className="text-[9px] text-red-500 mt-1 truncate">{ping.error}</p>}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* State Machine Overview */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Ejendom State Machine</h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">Livscyklus for en ejendom i pipeline. Defineret i <code className="bg-slate-100 px-1 rounded text-[9px]">src/lib/state-machine.ts</code></p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {[
                    { status: "NY_KRAEVER_RESEARCH", label: "Ny", color: "bg-slate-100 text-slate-700 border-slate-200" },
                    { status: "RESEARCH_IGANGSAT", label: "Research", color: "bg-blue-50 text-blue-700 border-blue-200" },
                    { status: "RESEARCH_DONE_CONTACT_PENDING", label: "Mangler kontakt", color: "bg-amber-50 text-amber-700 border-amber-200" },
                    { status: "KLAR_TIL_UDSENDELSE", label: "Klar til mail", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                    { status: "FOERSTE_MAIL_SENDT", label: "Mail sendt", color: "bg-violet-50 text-violet-700 border-violet-200" },
                    { status: "OPFOELGNING_SENDT", label: "Opfoelgning", color: "bg-purple-50 text-purple-700 border-purple-200" },
                    { status: "SVAR_MODTAGET", label: "Svar", color: "bg-green-50 text-green-700 border-green-200" },
                    { status: "LUKKET_VUNDET", label: "Vundet", color: "bg-emerald-100 text-emerald-800 border-emerald-300" },
                    { status: "LUKKET_TABT", label: "Tabt", color: "bg-red-50 text-red-700 border-red-200" },
                    { status: "FEJL", label: "Fejl", color: "bg-red-100 text-red-800 border-red-300" },
                  ].map(s => (
                    <div key={s.status} className={`p-2 rounded-lg border text-center ${s.color}`}>
                      <div className="text-[10px] font-bold">{s.label}</div>
                      <div className="text-[8px] font-mono mt-0.5 opacity-60">{s.status}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-3">
                  Hvert status-skifte valideres af state-machine modulet. Automatiske handlinger (start research, generer email) styres af autonomi-niveauet.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ─── Full Circle Wizard ─── */}
      <FullCircleWizard
        isOpen={fullCircleOpen}
        onClose={() => setFullCircleOpen(false)}
        city={scaffoldCity}
        onComplete={() => { fetchData(); addToast("Full Circle Pipeline afsluttet!", "success"); }}
      />

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

// ─── Sub-Components ─────────────────────────────────────────

function ProgressBar({ pct, running, phase }: { pct: number; running: boolean; phase: string }) {
  const isError = phase === "error";
  const isDone = pct >= 100;
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {running && <div className="w-2 h-2 rounded-full bg-brand-500 animate-gentle-pulse" />}
          <span className="text-xs font-semibold text-slate-600">
            {running ? "Koerer..." : isDone ? "Afsluttet" : "Stoppet"}
          </span>
        </div>
        <span className="text-xs font-mono font-bold text-slate-400 tabular-nums">{pct}%</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            isError ? "bg-gradient-to-r from-red-500 to-rose-500"
            : isDone ? "bg-gradient-to-r from-green-500 to-emerald-500"
            : "bg-gradient-to-r from-brand-500 to-brand-400"
          } ${running && !isDone ? "progress-stripe" : ""}`}
          style={{ width: `${Math.max(pct, running ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

function LogPanel({ logRef, events, running, maxHeight = "max-h-80" }: {
  logRef: React.RefObject<HTMLDivElement | null>;
  events: ProgressEvent[];
  running: boolean;
  maxHeight?: string;
}) {
  return (
    <div className="bg-[#0c1222] rounded-2xl overflow-hidden shadow-xl border border-white/[0.04]">
      <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider ml-2">AI Agent Log</span>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-gentle-pulse" />
              <span className="text-[10px] text-green-400 font-medium">LIVE</span>
            </div>
          )}
          <span className="text-[10px] text-slate-600 font-mono">{events.length} events</span>
        </div>
      </div>
      <div ref={logRef} className={`px-5 py-4 ${maxHeight} overflow-y-auto log-scroll space-y-1 font-mono text-[12px] leading-relaxed`}>
        {events.map((evt, i) => {
          const icon = getPhaseIcon(evt.phase);
          const color = getPhaseColor(evt.phase);
          const time = new Date(evt.timestamp).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

          return (
            <div key={i} className={`${color} animate-fade-in`} style={{ animationDelay: `${Math.min(i * 10, 100)}ms` }}>
              <span className="text-slate-600 mr-2 select-none tabular-nums">{time}</span>
              <span className="mr-1.5">{icon}</span>
              <span>{evt.message}</span>
              {evt.detail && (
                <div className="ml-[7rem] text-slate-500/80 mt-0.5 whitespace-pre-wrap text-[11px]">{evt.detail}</div>
              )}
            </div>
          );
        })}
        {running && (
          <div className="text-slate-600 mt-2 flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-1 h-1 rounded-full bg-slate-600 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-[11px]">Venter paa naeste trin...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TrafficBadge({ traffic, source }: { traffic: number; source?: string }) {
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

function ScoreRing({ score }: { score: number }) {
  const color = score >= 8 ? "from-green-500 to-emerald-500"
    : score >= 6 ? "from-brand-500 to-blue-500"
    : score >= 4 ? "from-amber-500 to-orange-500"
    : "from-red-400 to-rose-400";
  const bgColor = score >= 8 ? "bg-green-50"
    : score >= 6 ? "bg-brand-50"
    : score >= 4 ? "bg-amber-50"
    : "bg-red-50";

  return (
    <div className={`score-ring ${bgColor}`}>
      <div className={`w-full h-full rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-extrabold text-xs shadow-sm`}>
        {score}
      </div>
    </div>
  );
}

function CandidateTable({ candidates, minScore }: { candidates: ScoredCandidateData[]; minScore: number }) {
  const filtered = candidates.filter((c) => c.outdoorScore >= minScore).slice(0, 40);
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-6 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Adresse</th>
            <th className="px-4 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bygning</th>
            <th className="px-4 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trafik</th>
            <th className="px-4 py-3.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Score</th>
            <th className="px-4 py-3.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Vurdering</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {filtered.map((c, i) => (
            <tr key={i} className="group hover:bg-brand-50/30 transition-colors">
              <td className="px-6 py-4">
                <div className="font-semibold text-sm text-slate-900">{c.address}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{c.postalCode} {c.city}</div>
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-1.5">
                  {c.area && <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">{c.area}m2</span>}
                  {c.floors && <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">{c.floors} etg.</span>}
                  {c.usageText && <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-medium text-slate-600">{c.usageText}</span>}
                </div>
              </td>
              <td className="px-4 py-4">
                {c.estimatedDailyTraffic ? (
                  <TrafficBadge traffic={c.estimatedDailyTraffic} source={c.trafficSource} />
                ) : (
                  <span className="text-xs text-slate-300">--</span>
                )}
              </td>
              <td className="px-4 py-4">
                <div className="flex justify-center">
                  <ScoreRing score={c.outdoorScore} />
                </div>
              </td>
              <td className="px-4 py-4">
                <p className="text-[12px] text-slate-500 leading-relaxed max-w-xs">{c.scoreReason}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PropertyCard({ property: p, expanded, onToggle, onResearch, researchRunning, onFeedback, onCreateProposal }: {
  property: PropertyItem;
  expanded: boolean;
  onToggle: () => void;
  onResearch: () => void;
  researchRunning: boolean;
  onFeedback?: (feedback: string) => void;
  onCreateProposal?: () => void;
}) {
  const status = getStatusConfig(p.outreachStatus);
  const hasContact = p.primaryContact?.email;
  const hasOwner = p.ownerCompanyName && p.ownerCompanyName !== "Ukendt";

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden transition-all duration-200 group/card ${
      expanded ? "border-indigo-200/60 shadow-[var(--card-shadow-hover)]" : "border-slate-200/50 shadow-[var(--card-shadow)] hover:shadow-[var(--card-shadow-hover)] hover:border-slate-200"
    }`}>
      <div className="flex">
        {/* Status stripe */}
        <div className={`w-1 flex-shrink-0 ${status.stripe}`} />
        <div className="flex-1 min-w-0">
          {/* Card Header */}
          <div className="px-4 py-3.5 flex items-center gap-3 cursor-pointer" onClick={onToggle}>
            {/* Score ring - now first */}
            {p.outdoorScore != null && <ScoreRing score={p.outdoorScore} />}
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[13px] text-slate-900 truncate">{p.name || "Unavngivet"}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-md font-bold ${status.bg} ${status.color}`}>{status.label}</span>
                {hasOwner && <span className="hidden sm:inline text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold">Ejer</span>}
                {hasContact && <span className="hidden sm:inline text-[9px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-semibold">Email</span>}
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                <span className="truncate">{p.address}, {p.postalCode} {p.city}</span>
                {p.ownerCompanyName && <span className="hidden md:inline text-slate-400">· {p.ownerCompanyName}</span>}
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {(p.outreachStatus === "NY_KRAEVER_RESEARCH" || p.outreachStatus === "FEJL") ? (
                <button onClick={(e) => { e.stopPropagation(); onResearch(); }} disabled={researchRunning}
                  className="text-[10px] px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg shadow-sm disabled:opacity-40 font-bold whitespace-nowrap">
                  {researchRunning ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-white/30 border-t-white" /> : "Research"}
                </button>
              ) : (p.outreachStatus !== "RESEARCH_IGANGSAT") && (
                <button onClick={(e) => { e.stopPropagation(); onResearch(); }} disabled={researchRunning}
                  className="text-[10px] px-2.5 py-1.5 border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-40 font-semibold whitespace-nowrap">
                  {researchRunning ? <div className="animate-spin rounded-full h-3 w-3 border-2 border-indigo-200 border-t-indigo-600" /> : "Re-research"}
                </button>
              )}
              {onCreateProposal && (
                <button onClick={(e) => { e.stopPropagation(); onCreateProposal(); }}
                  className="text-[10px] px-2.5 py-1.5 border border-violet-200 text-violet-600 rounded-lg hover:bg-violet-50 font-semibold whitespace-nowrap">OOH</button>
              )}
              <svg className={`w-4 h-4 text-slate-300 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>

          {/* Expanded Content */}
          {expanded && (
            <div className="border-t border-slate-100 animate-slide-down">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                {/* Research Summary */}
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-cyan-50 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-cyan-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Research</h4>
                  </div>
                  {p.researchSummary ? (
                    <p className="text-[13px] text-slate-600 leading-relaxed">{p.researchSummary}</p>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                      </svg>
                      <p className="text-sm italic">Ingen research endnu</p>
                    </div>
                  )}
                </div>

                {/* Contact */}
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-purple-50 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Kontakt</h4>
                  </div>
                  {p.primaryContact ? (
                    <div className="space-y-2">
                      <div className="font-semibold text-sm text-slate-800">{p.primaryContact.name || "Ukendt"}</div>
                      {p.primaryContact.role && (
                        <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-50 text-[10px] font-semibold text-purple-700">{p.primaryContact.role}</div>
                      )}
                      {p.primaryContact.email ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                          </svg>
                          <span className="text-[12px] text-brand-600 font-medium">{p.primaryContact.email}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-1 text-amber-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                          </svg>
                          <span className="text-[12px] font-medium">Email mangler</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                      </svg>
                      <p className="text-sm italic">Ingen kontakt fundet</p>
                    </div>
                  )}
                </div>

                {/* Email Draft */}
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Email-udkast</h4>
                  </div>
                  {p.emailDraftSubject ? (
                    <div>
                      <div className="text-sm font-semibold text-slate-800 mb-2">{p.emailDraftSubject}</div>
                      <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[12px] text-slate-500 leading-relaxed line-clamp-5">{p.emailDraftBody}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75" />
                      </svg>
                      <p className="text-sm italic">Intet udkast endnu</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Feedback Bar */}
              {onFeedback && (
                <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between bg-slate-50/50">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Feedback</span>
                  <div className="flex items-center gap-1.5">
                    {[
                      { key: "good_lead", label: "God lead", color: "text-emerald-600 hover:bg-emerald-50 border-emerald-200", icon: "M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V2.75a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904m10.598-9.75H14.25M5.904 18.5c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 9.953 4.167 9.5 5 9.5h1.053c.472 0 .745.556.5.96a8.958 8.958 0 00-1.302 4.665c0 1.194.232 2.333.654 3.375z" },
                      { key: "irrelevant", label: "Irrelevant", color: "text-slate-500 hover:bg-slate-100 border-slate-200", icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" },
                      { key: "too_small", label: "For lille", color: "text-amber-600 hover:bg-amber-50 border-amber-200", icon: "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" },
                      { key: "wrong_owner", label: "Forkert ejer", color: "text-red-500 hover:bg-red-50 border-red-200", icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" },
                      { key: "needs_reresearch", label: "Re-research", color: "text-blue-500 hover:bg-blue-50 border-blue-200", icon: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" },
                    ].map(fb => (
                      <button key={fb.key} onClick={(e) => { e.stopPropagation(); onFeedback(fb.key); }}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold border rounded-lg transition-colors ${fb.color}`}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={fb.icon} /></svg>
                        {fb.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PipelineStat({ label, value, color, icon, active, onClick }: {
  label: string; value: number; color: string; icon: string; active?: boolean; onClick?: () => void;
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

function ResultStat({ label, value, icon, color = "slate" }: { label: string; value: number; icon: string; color?: string }) {
  const textColor = color === "green" ? "text-green-600" : color === "brand" ? "text-brand-600" : "text-slate-900";
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 shadow-[var(--card-shadow)] p-4">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-extrabold tabular-nums ${textColor}`}>{formatNumber(value)}</div>
    </div>
  );
}

function EmptyState({ icon, title, description, action }: {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300/80 p-12 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-slate-700 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-md mx-auto leading-relaxed">{description}</p>
      {action}
    </div>
  );
}

// ─── Phase Icon/Color Helpers ───────────────────────────────

function getPhaseIcon(phase: string): string {
  const map: Record<string, string> = {
    traffic_check: "\u{1F6A6}", traffic_ok: "\u2705", traffic_rejected: "\u{1F6AB}", traffic_warning: "\u26A0\uFE0F",
    scan: "\u{1F50D}", scan_done: "\u{1F3D7}\uFE0F",
    scoring: "\u{1F9E0}", scoring_batch: "\u{1F9E0}", scoring_done: "\u2728",
    hubspot: "\u{1F4E6}", hubspot_created: "\u{1F4E6}", hubspot_skip: "\u23ED\uFE0F", hubspot_error: "\u274C",
    search: "\u{1F50D}", search_done: "\u{1F50D}", search_backup: "\u{1F310}", search_backup_done: "\u{1F310}",
    done: "\u2705", complete: "\u2705", error: "\u274C",
    start: "\u{1F680}", fetch_done: "\u{1F4CB}",
    property_start: "\u{1F3E0}", property_done: "\u2705",
    step: "\u25B6\uFE0F", research_start: "\u{1F50E}", research_step: "\u{1F50D}", research_done: "\u{1F4CA}",
    llm_start: "\u{1F9E0}", llm_done: "\u{1F4A1}",
    hubspot_updated: "\u2601\uFE0F", contact_create: "\u{1F464}", contacts_done: "\u{1F465}",
    email_start: "\u270D\uFE0F", email_done: "\u{1F4E7}", email_skipped: "\u23ED\uFE0F",
    draft_saved: "\u{1F4BE}", status_updated: "\u{1F3F7}\uFE0F",
    cvr: "\u{1F3E2}", bbr: "\u{1F3D7}\uFE0F", scrape: "\u{1F578}\uFE0F",
    search_query: "\u{1F50D}", search_result: "\u{1F4C4}", scrape_site: "\u{1F310}", scrape_result: "\u{1F4E7}", scrape_done: "\u{1F4CB}",
    ois_contact_inject: "\u{1F3DB}\uFE0F", ois_owner_set: "\u{1F3DB}\uFE0F", ois_contact_added: "\u{1F3DB}\uFE0F",
    cvr_contact_inject: "\u{1F3E2}", cvr_contact_added: "\u{1F3E2}",
    email_hunt_start: "\u{1F3AF}", email_hunt_person: "\u{1F575}\uFE0F",
    email_hunt_step: "\u{1F50E}", email_hunt_found: "\u{1F389}",
    email_hunt_fallback: "\u{1F504}", email_hunt_done: "\u{1F4EC}",
    email_hunt_skip: "\u23ED\uFE0F",
    stopped: "\u23F9\uFE0F",
  };
  return map[phase] || "\u25B6\uFE0F";
}

function getPhaseColor(phase: string): string {
  if (phase === "error" || phase === "hubspot_error" || phase === "traffic_rejected") return "text-red-400";
  if (phase === "done" || phase === "complete" || phase === "traffic_ok" || phase === "property_done") return "text-green-400";
  if (phase === "email_hunt_found") return "text-green-400";
  if (phase === "hubspot_created" || phase === "draft_saved") return "text-emerald-400";
  if (phase === "hubspot_skip" || phase === "email_skipped" || phase === "email_hunt_skip" || phase === "stopped") return "text-slate-500";
  if (phase === "scoring_done" || phase === "llm_done") return "text-amber-300";
  if (phase === "traffic_warning") return "text-amber-400";
  if (phase.includes("ois")) return "text-teal-300";
  if (phase.includes("email_hunt")) return "text-orange-300";
  if (phase.includes("research") || phase.includes("search") || phase.includes("scrape")) return "text-cyan-300";
  if (phase.includes("email") || phase.includes("contact")) return "text-purple-300";
  return "text-slate-300";
}
