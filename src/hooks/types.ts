// Shared types for SSE-based hooks

export interface ScoredCandidateData {
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

export interface DiscoveryResultData {
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

export interface ProgressEvent {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  candidates?: ScoredCandidateData[];
  result?: DiscoveryResultData;
  stats?: Record<string, number>;
  timestamp: number;
}

export interface AgentActivityRun {
  id: string;
  street: string;
  city: string;
  phase: string;
  progress: number;
  message?: string | null;
  buildings_found?: number | null;
  created_count?: number | null;
  research_completed?: number | null;
  research_total?: number | null;
  started_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface ScaffoldPermit {
  address: string;
  score: number;
  scoreReason: string;
  traffic: string;
  trafficNum: number;
  type: string;
  category: string;
  startDate: string;
  endDate: string;
  createdDate: string;
  applicant: string;
  contractor: string;
  lat: number;
  lng: number;
  durationWeeks: number;
  description: string;
  facadeArea: string;
  sagsnr: string;
  contactPerson: string;
  contactEmail: string;
}

export interface ScaffoldReport {
  total: number;
  qualified: number;
  skipped: number;
  sources: { name: string; count: number }[];
  byType: Record<string, number>;
  topPermits: ScaffoldPermit[];
  reportText: string;
}
