"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ─── Types (shared with tabs) ─────────────────────────────────

export type TabId =
  | "home"
  | "discover"
  | "street_agent"
  | "scaffolding"
  | "staging"
  | "properties"
  | "research"
  | "ooh"
  | "outreach"
  | "settings";

export interface DashboardData {
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
    emailQueue: {
      queued: number;
      sent: number;
      failed: number;
      sentThisHour: number;
      rateLimitPerHour: number;
    };
    ooh: {
      totalSent: number;
      opened: number;
      clicked: number;
      replied: number;
      meetings: number;
      sold: number;
    };
    funnel: {
      discovered: number;
      staged: number;
      approved: number;
      inHubSpot: number;
      ready: number;
      sent: number;
    };
  };
}

export interface WorkflowRun {
  propertyId: string;
  propertyName: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  steps: WorkflowStep[];
  error?: string;
}

export interface WorkflowStep {
  stepId: string;
  stepName: string;
  status: string;
  details?: string;
  error?: string;
}

export interface PropertyItem {
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

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  detail?: string;
}

export interface ScaffoldPeriodCounts {
  daily: number;
  weekly: number;
  monthly: number;
  at: string;
}

export type OOHInitialFrame = {
  address: string;
  city: string;
  traffic: number;
  imageUrl?: string;
  type: "scaffolding" | "facade" | "gable" | "other";
};

export type OOHInitialClient = {
  company: string;
  contactName: string;
  email: string;
};

// ─── Context value ───────────────────────────────────────────

export interface DashboardContextValue {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  dashboard: DashboardData | null;
  properties: PropertyItem[];
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  fetchDashboard: () => Promise<void>;
  fetchProperties: () => Promise<void>;
  fetchData: () => Promise<void>;
  systemHealth: {
    status: string;
    pings: Record<string, { ok: boolean; service?: string; latencyMs?: number }>;
  } | null;
  toasts: Toast[];
  addToast: (message: string, type: Toast["type"], detail?: string) => void;
  removeToast: (id: string) => void;
  scaffoldPeriodCounts: ScaffoldPeriodCounts | null;
  setScaffoldPeriodCounts: (v: ScaffoldPeriodCounts | null) => void;
  oohInitialFrame: OOHInitialFrame | undefined;
  setOohInitialFrame: (v: OOHInitialFrame | undefined) => void;
  oohInitialClient: OOHInitialClient | undefined;
  setOohInitialClient: (v: OOHInitialClient | undefined) => void;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<TabId>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "") as TabId;
      const valid: TabId[] = [
        "home", "discover", "street_agent", "scaffolding", "staging",
        "properties", "research", "ooh", "outreach", "settings",
      ];
      if (valid.includes(hash)) return hash;
    }
    return "home";
  });
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [properties, setProperties] = useState<PropertyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<DashboardContextValue["systemHealth"]>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [scaffoldPeriodCounts, setScaffoldPeriodCounts] = useState<ScaffoldPeriodCounts | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("ejendom-scaffold-period");
      if (!raw) return null;
      const data = JSON.parse(raw) as ScaffoldPeriodCounts;
      return data.at && data.daily !== undefined ? data : null;
    } catch {
      return null;
    }
  });
  const [oohInitialFrame, setOohInitialFrame] = useState<OOHInitialFrame | undefined>();
  const [oohInitialClient, setOohInitialClient] = useState<OOHInitialClient | undefined>();

  const addToast = useCallback((message: string, type: Toast["type"] = "info", detail?: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type, detail }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setActiveTab = useCallback((tab: TabId) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      window.location.hash = tab;
    }
  }, []);

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

  useEffect(() => {
    fetchDashboard();
    setLoading(false);
  }, [fetchDashboard]);

  useEffect(() => {
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  useEffect(() => {
    const fetchHealth = () =>
      fetch("/api/status")
        .then((r) => r.json())
        .then((d) => setSystemHealth(d))
        .catch(() => {});
    fetchHealth();
    const id = setInterval(fetchHealth, 120_000);
    return () => clearInterval(id);
  }, []);

  const needsProperties = ["home", "properties", "outreach", "research"].includes(activeTab);
  useEffect(() => {
    if (needsProperties && properties.length === 0 && !loading) {
      fetchProperties();
    }
  }, [needsProperties, activeTab, properties.length, loading, fetchProperties]);

  const value: DashboardContextValue = {
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
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
