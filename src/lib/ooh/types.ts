// ============================================================
// OOH Proposal Types – Shared type definitions
// ============================================================

/** A 2D point in image pixel coordinates */
export interface Point2D {
  x: number;
  y: number;
}

export interface PlacementConfig {
  x: number;         // pixels from left (bounding box)
  y: number;         // pixels from top (bounding box)
  width: number;     // target width in pixels (bounding box)
  height: number;    // target height in pixels (bounding box)
  rotation?: number; // degrees (legacy)
  perspective?: {
    skewX?: number;
    skewY?: number;
    scale?: number;
  };
  /**
   * 4-point perspective quad: top-left, top-right, bottom-right, bottom-left.
   * Coordinates are in image pixels (same coordinate space as frameWidth/frameHeight).
   * When present, the creative is perspective-warped to fill this quad.
   * The x/y/width/height fields become the bounding box of the quad.
   */
  quadPoints?: [Point2D, Point2D, Point2D, Point2D];
  /** Human-readable label for this placement, e.g. "Front", "Venstre side" */
  label?: string;
}

export interface Frame {
  id: string;
  name: string;                   // e.g., "Gammel Kongevej 49"
  locationAddress?: string;
  locationCity?: string;
  frameType: "scaffolding" | "facade" | "gable" | "other";

  // Frame image (transparent PNG with ad space marked)
  driveFileId?: string;
  frameImageUrl: string;          // URL or local path

  // Placement coordinates (where creative goes)
  placement: PlacementConfig;           // primary placement (= placements[0])
  /** All placements on this frame. When empty, falls back to [placement]. */
  placements: PlacementConfig[];

  // Frame dimensions
  frameWidth: number;
  frameHeight: number;

  // Metadata
  dailyTraffic?: number;
  listPrice?: number;             // DKK
  isActive: boolean;

  createdAt: string;
  updatedAt: string;
}

export interface Creative {
  id: string;
  filename: string;
  driveFileId?: string;
  driveFolderId?: string;

  // Company/campaign info
  companyName: string;
  companyId?: string;
  campaignName?: string;

  // File metadata
  mimeType?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;

  // Content classification
  tags: string[];
  category?: string;
  colorProfile?: "light" | "dark" | "colorful";

  // Usage tracking
  usageCount: number;
  lastUsedAt?: string;

  createdAt: string;
  updatedAt: string;
}

export type ProposalStatus =
  | "pending"
  | "processing"
  | "mockup_ready"
  | "slides_ready"
  | "pdf_ready"
  | "sent"
  | "error";

export interface Proposal {
  id: string;

  // Relationships
  frameId: string;
  creativeId: string;
  /** Link back to HubSpot property (enables full-circle flow) */
  propertyId?: string;

  // Client info
  clientEmail: string;
  clientCompany: string;
  clientContactName?: string;

  // Generated assets
  mockupDriveId?: string;
  mockupUrl?: string;
  mockupBuffer?: string;           // base64 data URL for preview

  // Proposal document
  slidesId?: string;
  slidesUrl?: string;
  pdfDriveId?: string;
  pdfUrl?: string;
  pdfFilename?: string;

  // Status tracking
  status: ProposalStatus;
  errorMessage?: string;

  // Processing metrics
  startedAt?: string;
  completedAt?: string;
  processingDurationMs?: number;

  // User tracking
  createdBy?: string;
  sentAt?: string;

  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  name: string;
  driveFileId: string;
  totalSlides: number;
  mockupPlacements: MockupPlacement[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MockupPlacement {
  slideIndex: number;
  pageElementName: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

/**
 * A Network is a named group of frames (preset).
 * E.g. "Aarhus Netværk" = 4 specific frames that are always sold together.
 */
export interface Network {
  id: string;
  name: string;
  description?: string;
  frameIds: string[];          // ordered list of frame IDs in this network
  createdAt: string;
  updatedAt: string;
}

// ── Presentation Templates ────────────────────────────────

/**
 * An image slot on a presentation page – defines where a mockup image
 * should be inserted. Coordinates are in PDF points (1 pt = 1/72 inch)
 * with origin at top-left (screen coords). Converted to bottom-left
 * origin for pdf-lib on the server.
 */
export interface ImageSlot {
  id: string;
  label: string;              // e.g. "Nordre Ringgade mockup"
  x: number;                  // PDF points from left
  y: number;                  // PDF points from top (screen coordinates)
  width: number;              // PDF points
  height: number;             // PDF points
  pageWidth: number;          // page width in PDF points (for scaling)
  pageHeight: number;         // page height in PDF points (for scaling)
  linkedFrameId?: string;     // optional: pre-linked to a specific frame
  /** How the mockup image fills the slot area */
  objectFit?: "cover" | "contain" | "fill";
}

/**
 * A text slot on a presentation page – defines where dynamic text
 * is injected. Supports placeholders like {{CLIENT_NAME}}, {{DATE}}, etc.
 */
export interface TextSlot {
  id: string;
  label: string;              // e.g. "Kundenavn"
  x: number;                  // PDF points from left
  y: number;                  // PDF points from top (screen coordinates)
  width: number;              // PDF points
  height: number;             // PDF points
  fontSize: number;           // points (default 14)
  fontWeight: "normal" | "bold";
  color: string;              // hex color, e.g. "#000000"
  /** Placeholder key, e.g. "{{CLIENT_NAME}}", "{{DATE}}", "{{PRICE}}", "{{ADDRESS}}" */
  placeholder: string;
  /** Text alignment */
  align?: "left" | "center" | "right";
}

export interface PresentationPage {
  pageIndex: number;          // 0-based page index
  thumbnailUrl?: string;      // client-rendered preview (base64 data URL)
  imageSlots: ImageSlot[];
  textSlots?: TextSlot[];
}

/**
 * A presentation template – wraps an uploaded PDF with page-level
 * image slot definitions. Used to auto-generate final proposals by
 * inserting mockup images into the correct positions.
 */
export interface PresentationTemplate {
  id: string;
  name: string;
  pdfFileUrl: string;         // stored uploaded PDF (relative to public/)
  pageCount: number;
  pages: PresentationPage[];
  createdAt: string;
  updatedAt: string;
}

// ── OOH Outreach Types ───────────────────────────────────

export interface OOHContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company: string;
  industry?: string;
  city?: string;
  notes?: string;
  tags: string[];
  lastContactedAt?: string;
  totalProposalsSent: number;
  createdAt: string;
  updatedAt: string;
}

export type CampaignStatus = "draft" | "active" | "completed" | "cancelled";

export interface OOHCampaign {
  id: string;
  name: string;
  status: CampaignStatus;
  networkId?: string;
  frameIds: string[];
  creativeId?: string;
  templateId?: string;
  contactIds: string[];
  emailSubject: string;
  emailBody: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}

export type SendStatus =
  | "queued"
  | "sending"
  | "sent"
  | "opened"
  | "replied"
  | "meeting"
  | "sold"
  | "rejected"
  | "error";

export interface OOHSend {
  id: string;
  campaignId: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  contactCompany?: string;
  proposalPdfUrl?: string;
  status: SendStatus;
  sentAt?: string;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  followUpCount: number;
  nextFollowUpAt?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

// ── API request/response types ────────────────────────────

export interface GenerateProposalInput {
  frameId: string;
  creativeId: string;
  clientEmail: string;
  clientCompany: string;
  clientContactName?: string;
  /** Link back to HubSpot property for full-circle tracking */
  propertyId?: string;
  templateId?: string;
  /** Optional per-placement creative assignments (placement index → creativeId) */
  creativeAssignments?: Record<number, string>;
  /** Client-provided placements (takes priority over DB for pre-migration compat) */
  framePlacements?: PlacementConfig[];
}

export interface ProposalStatusResponse {
  proposalId: string;
  status: ProposalStatus;
  progress: number;       // 0-100
  mockupUrl?: string;
  slidesUrl?: string;
  pdfUrl?: string;
  error?: string;
}
