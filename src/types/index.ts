// ============================================================
// Core domain types for Ejendom AI Research Agent v1
// ============================================================

/** Outreach status lifecycle */
export type OutreachStatus =
  | "NY_KRAEVER_RESEARCH"
  | "RESEARCH_IGANGSAT"
  | "RESEARCH_DONE_CONTACT_PENDING"
  | "KLAR_TIL_UDSENDELSE"
  | "FOERSTE_MAIL_SENDT"
  | "OPFOELGNING_SENDT"
  | "SVAR_MODTAGET"
  | "LUKKET_VUNDET"
  | "LUKKET_TABT"
  | "FEJL";

/** A property (ejendom) as stored in HubSpot custom object 0-420 */
export interface Property {
  id: string;
  name: string;
  address: string;
  postalCode: string;
  city: string;
  outreachStatus: OutreachStatus;
  outdoorScore?: number;
  ownerCompanyName?: string;
  ownerCompanyCvr?: string;
  researchSummary?: string;
  researchLinks?: string;
  outdoorPotentialNotes?: string;
  createdAt?: string;
  updatedAt?: string;
  // Fields from HubSpot Ejendomme object
  neighborhood?: string;
  listingType?: string;
  yearBuilt?: number;
  squareFootage?: number;
  lotSize?: number;
  price?: number;
  // Contact info stored directly on the ejendom
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  companyName?: string;
  // Email draft stored on the ejendom
  emailDraftSubject?: string;
  emailDraftBody?: string;
  emailDraftNote?: string;
}

/** Contact role */
export type ContactRole = "ejer" | "administrator" | "advokat" | "direktor" | "anden";

/** A contact person associated with a property */
export interface Contact {
  id?: string;
  fullName: string | null;
  firstName?: string;
  lastName?: string;
  email: string | null;
  phone?: string | null;
  role: ContactRole | string | null;
  source: string;
  confidence: number; // 0.0 – 1.0
  propertyId?: string;
  /** "direct" = proven connection to this specific property, "indirect" = general administrator */
  relevance?: "direct" | "indirect";
  /** Explanation of why this contact is relevant to this specific property */
  relevanceReason?: string;
}

/** OIS.dk lookup result – official property ownership data */
export interface OisResult {
  bfe: number;
  address: string;
  owners: { name: string; isPrimary: boolean }[];
  administrators: { name: string; isPrimary: boolean }[];
  propertyType?: string;
  ejerforholdskode?: string;
  ejerforholdstekst?: string;
  kommune?: string;
}

/** Research data gathered from public sources */
export interface ResearchData {
  oisData: OisResult | null;
  cvrData: CvrResult | null;
  bbrData: BbrResult | null;
  companySearchResults: WebSearchResult[];
  websiteContent: WebsiteContent | null;
}

/** CVR lookup result */
export interface CvrResult {
  cvr: string;
  companyName: string;
  address: string;
  status: string;
  type: string;
  owners?: string[];
  industry?: string;
  employees?: string;
  /** Company email from CVR registry */
  email?: string;
  /** Company phone from CVR registry */
  phone?: string;
  /** Company website from CVR registry */
  website?: string;
  rawData?: Record<string, unknown>;
}

/** BBR lookup result */
export interface BbrResult {
  address: string;
  buildingYear?: number;
  area?: number;
  usage?: string;
  floors?: number;
  units?: number;
  rawData?: Record<string, unknown>;
}

/** Web search result */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Scraped website content */
export interface WebsiteContent {
  url: string;
  title: string;
  contactPageText?: string;
  aboutPageText?: string;
  emails: string[];
  phones: string[];
  /** Person names found on the website (used for contact validation) */
  names?: string[];
  relevantSnippets: string[];
}

/** LLM analysis result for research summarization */
export interface ResearchAnalysis {
  ownerCompanyName: string;
  ownerCompanyCvr: string | null;
  companyDomain: string | null;
  companyWebsite: string | null;
  recommendedContacts: Contact[];
  outdoorPotentialScore: number;
  keyInsights: string;
  /** Data quality assessment from LLM */
  dataQuality: "high" | "medium" | "low";
  dataQualityReason: string;
}

/** LLM email draft result */
export interface EmailDraft {
  subject: string;
  bodyText: string;
  shortInternalNote: string;
}

/** Workflow run log entry */
export interface WorkflowRunLog {
  propertyId: string;
  propertyName: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  steps: WorkflowStepLog[];
  error?: string;
}

export interface WorkflowStepLog {
  stepId: string;
  stepName: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  details?: string;
  error?: string;
}

/** Dashboard stats */
export interface DashboardStats {
  totalProperties: number;
  pendingResearch: number;
  researchDone: number;
  readyToSend: number;
  mailsSent: number;
  lastRunAt: string | null;
  recentRuns: WorkflowRunLog[];
}

// ============================================================
// Discovery Pipeline Types
// ============================================================

/** Raw address from DAWA adgangsadresser API */
export interface DawaAddress {
  id: string;
  vejnavn: string;
  husnr: string;
  postnr: string;
  postnrnavn: string;
  kommunekode: string;
  x: number;
  y: number;
  betegnelse: string;
}

/** Building candidate with BBR data attached */
export interface BuildingCandidate {
  dawaId: string;
  address: string;
  streetName: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  lat: number;
  lng: number;
  // BBR data
  buildingYear?: number;
  area?: number;
  floors?: number;
  units?: number;
  usageCode?: string;
  usageText?: string;
  // Traffic data
  estimatedDailyTraffic?: number;
  trafficSource?: "vejdirektoratet" | "kommune" | "estimate";
  trafficConfidence?: number;
}

/** Building candidate after LLM scoring */
export interface ScoredCandidate extends BuildingCandidate {
  outdoorScore: number;       // 1-10
  scoreReason: string;        // Short explanation from LLM
}

/** Result of a street discovery run */
export interface DiscoveryResult {
  street: string;
  city: string;
  totalAddresses: number;
  afterPreFilter: number;
  afterScoring: number;
  afterTrafficFilter: number;
  created: number;
  skipped: number;
  alreadyExists: number;
  candidates: ScoredCandidate[];
  estimatedTraffic?: number;
  trafficSource?: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ============================================================
// Scaffolding / Stillads Types
// ============================================================

/** Active scaffolding / road permit */
export interface ScaffoldingPermit {
  id: string;
  address: string;
  streetName: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  permitType: string;           // "stilladsreklame" | "stillads" | "byggeplads" | "gravetilladelse" | etc.
  category: string;             // Original category from API (e.g. "Stillads", "Byggeplads/materialeplads")
  sagstype: string;             // "Stilladsreklamer" | "Midlertidig råden over veje" | "Gravetilladelser"
  description?: string;
  createdDate?: string;         // when permit was created/registered (oprettet / sagmodtaget / projekt_start)
  startDate?: string;
  endDate?: string;
  durationWeeks?: number;
  applicant?: string;
  contractor?: string;          // entreprenør
  contactPerson?: string;
  contactPhone?: string;
  contactEmail?: string;
  facadeArea?: string;          // facadeareal_m2
  sourceUrl?: string;
  sourceLayer?: string;         // WFS layer name
  sagsnr?: number;              // KK case number
  lat?: number;
  lng?: number;
}

/** Scored scaffolding candidate */
export interface ScoredScaffolding extends ScaffoldingPermit {
  outdoorScore: number;
  scoreReason: string;
  estimatedDailyTraffic?: number;
  trafficSource?: string;
}

/** Result of a scaffolding discovery run */
export interface ScaffoldingResult {
  city: string;
  totalPermits: number;
  afterFilter: number;
  created: number;
  skipped: number;
  alreadyExists: number;
  permits: ScoredScaffolding[];
  /** Breakdown by source */
  sources: { name: string; count: number }[];
  /** Breakdown by permit type */
  byType: Record<string, number>;
  startedAt: string;
  completedAt?: string;
  error?: string;
}
