// ============================================================
// Property State Machine
// Formalizes the outreach lifecycle with allowed transitions,
// guard conditions, and action triggers.
// ============================================================

import type { OutreachStatus } from "@/types";

// ── Transition definitions ───────────────────────────────────

export interface StateTransition {
  from: OutreachStatus;
  to: OutreachStatus;
  action: string;
  /** Human-readable label */
  label: string;
  /** Whether this transition can be triggered automatically */
  automatic: boolean;
  /** Required conditions (checked at runtime) */
  requires?: string[];
}

/** All valid transitions in the outreach lifecycle */
export const TRANSITIONS: StateTransition[] = [
  // ── Research phase ──
  {
    from: "NY_KRAEVER_RESEARCH",
    to: "RESEARCH_IGANGSAT",
    action: "start_research",
    label: "Start AI research",
    automatic: true,
    requires: [],
  },
  {
    from: "RESEARCH_IGANGSAT",
    to: "RESEARCH_DONE_CONTACT_PENDING",
    action: "research_done_no_email",
    label: "Research done (no email found)",
    automatic: true,
  },
  {
    from: "RESEARCH_IGANGSAT",
    to: "KLAR_TIL_UDSENDELSE",
    action: "research_done_with_email",
    label: "Research done (email found, draft ready)",
    automatic: true,
    requires: ["has_contact_email", "has_email_draft"],
  },
  {
    from: "RESEARCH_IGANGSAT",
    to: "FEJL",
    action: "research_failed",
    label: "Research failed",
    automatic: true,
  },

  // ── Re-research ──
  {
    from: "RESEARCH_DONE_CONTACT_PENDING",
    to: "RESEARCH_IGANGSAT",
    action: "retry_research",
    label: "Retry research",
    automatic: false,
  },
  {
    from: "FEJL",
    to: "RESEARCH_IGANGSAT",
    action: "retry_research",
    label: "Retry after error",
    automatic: false,
  },
  {
    from: "KLAR_TIL_UDSENDELSE",
    to: "RESEARCH_IGANGSAT",
    action: "retry_research",
    label: "Re-research",
    automatic: false,
  },

  // ── Outreach phase ──
  {
    from: "KLAR_TIL_UDSENDELSE",
    to: "FOERSTE_MAIL_SENDT",
    action: "send_first_email",
    label: "Send first email",
    automatic: false, // Requires approval (autonomy level ≤ 1)
    requires: ["has_contact_email", "has_email_draft"],
  },
  {
    from: "FOERSTE_MAIL_SENDT",
    to: "OPFOELGNING_SENDT",
    action: "send_followup",
    label: "Send follow-up",
    automatic: false,
    requires: ["has_contact_email"],
  },
  {
    from: "FOERSTE_MAIL_SENDT",
    to: "SVAR_MODTAGET",
    action: "reply_received",
    label: "Reply received",
    automatic: false,
  },
  {
    from: "OPFOELGNING_SENDT",
    to: "SVAR_MODTAGET",
    action: "reply_received",
    label: "Reply received",
    automatic: false,
  },

  // ── Closing ──
  {
    from: "SVAR_MODTAGET",
    to: "LUKKET_VUNDET",
    action: "close_won",
    label: "Close as won",
    automatic: false,
  },
  {
    from: "SVAR_MODTAGET",
    to: "LUKKET_TABT",
    action: "close_lost",
    label: "Close as lost",
    automatic: false,
  },
  {
    from: "FOERSTE_MAIL_SENDT",
    to: "LUKKET_TABT",
    action: "close_lost",
    label: "No response – close",
    automatic: false,
  },
  {
    from: "OPFOELGNING_SENDT",
    to: "LUKKET_TABT",
    action: "close_lost",
    label: "No response – close",
    automatic: false,
  },

  // ── Manual override: reset to new ──
  {
    from: "LUKKET_TABT",
    to: "NY_KRAEVER_RESEARCH",
    action: "reopen",
    label: "Reopen for new attempt",
    automatic: false,
  },
];

// ── Status metadata ──────────────────────────────────────────

export interface StatusMeta {
  status: OutreachStatus;
  label: string;
  color: string;
  icon: string;
  phase: "discovery" | "research" | "outreach" | "closed" | "error";
  /** Whether auto-research rules should trigger from this state */
  autoResearchEligible: boolean;
}

export const STATUS_META: Record<OutreachStatus, StatusMeta> = {
  NY_KRAEVER_RESEARCH: {
    status: "NY_KRAEVER_RESEARCH",
    label: "Ny – kræver research",
    color: "slate",
    icon: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
    phase: "research",
    autoResearchEligible: true,
  },
  RESEARCH_IGANGSAT: {
    status: "RESEARCH_IGANGSAT",
    label: "Research i gang",
    color: "blue",
    icon: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182",
    phase: "research",
    autoResearchEligible: false,
  },
  RESEARCH_DONE_CONTACT_PENDING: {
    status: "RESEARCH_DONE_CONTACT_PENDING",
    label: "Researched – mangler kontakt",
    color: "amber",
    icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0",
    phase: "research",
    autoResearchEligible: true,
  },
  KLAR_TIL_UDSENDELSE: {
    status: "KLAR_TIL_UDSENDELSE",
    label: "Klar til udsendelse",
    color: "emerald",
    icon: "M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75",
    phase: "outreach",
    autoResearchEligible: false,
  },
  FOERSTE_MAIL_SENDT: {
    status: "FOERSTE_MAIL_SENDT",
    label: "Første mail sendt",
    color: "violet",
    icon: "M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5",
    phase: "outreach",
    autoResearchEligible: false,
  },
  OPFOELGNING_SENDT: {
    status: "OPFOELGNING_SENDT",
    label: "Opfølgning sendt",
    color: "purple",
    icon: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
    phase: "outreach",
    autoResearchEligible: false,
  },
  SVAR_MODTAGET: {
    status: "SVAR_MODTAGET",
    label: "Svar modtaget",
    color: "green",
    icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    phase: "outreach",
    autoResearchEligible: false,
  },
  LUKKET_VUNDET: {
    status: "LUKKET_VUNDET",
    label: "Lukket – vundet",
    color: "emerald",
    icon: "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0",
    phase: "closed",
    autoResearchEligible: false,
  },
  LUKKET_TABT: {
    status: "LUKKET_TABT",
    label: "Lukket – tabt",
    color: "red",
    icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
    phase: "closed",
    autoResearchEligible: false,
  },
  FEJL: {
    status: "FEJL",
    label: "Fejl",
    color: "red",
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    phase: "error",
    autoResearchEligible: true,
  },
};

// ── Core state machine functions ─────────────────────────────

/**
 * Get all valid transitions from a given status.
 */
export function getAvailableTransitions(
  currentStatus: OutreachStatus
): StateTransition[] {
  return TRANSITIONS.filter((t) => t.from === currentStatus);
}

/**
 * Get transitions that can be triggered automatically.
 */
export function getAutomaticTransitions(
  currentStatus: OutreachStatus
): StateTransition[] {
  return TRANSITIONS.filter(
    (t) => t.from === currentStatus && t.automatic
  );
}

/**
 * Check if a specific transition is valid.
 */
export function canTransition(
  from: OutreachStatus,
  to: OutreachStatus
): boolean {
  return TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * Get the transition object for a specific from→to pair.
 */
export function getTransition(
  from: OutreachStatus,
  to: OutreachStatus
): StateTransition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to);
}

/**
 * Validate a transition and return the action name, or null if invalid.
 */
export function validateTransition(
  from: OutreachStatus,
  to: OutreachStatus,
  context?: {
    hasContactEmail?: boolean;
    hasEmailDraft?: boolean;
  }
): { valid: boolean; action?: string; reason?: string } {
  const transition = getTransition(from, to);
  if (!transition) {
    return {
      valid: false,
      reason: `Transition from ${from} to ${to} is not allowed`,
    };
  }

  // Check guard conditions
  if (transition.requires?.includes("has_contact_email") && !context?.hasContactEmail) {
    return {
      valid: false,
      reason: "Requires a contact email address",
    };
  }
  if (transition.requires?.includes("has_email_draft") && !context?.hasEmailDraft) {
    return {
      valid: false,
      reason: "Requires an email draft",
    };
  }

  return { valid: true, action: transition.action };
}

// ── Autonomy levels ──────────────────────────────────────────

export type AutonomyLevel = 0 | 1 | 2 | 3;

export const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  0: "Kun forslag – intet automatisk",
  1: "Auto-research, godkend emails manuelt",
  2: "Auto-research + auto første mail, godkend opfølgning",
  3: "Fuld automat inkl. opfølgning",
};

/**
 * Check if an action is allowed at the given autonomy level.
 */
export function isActionAllowed(
  action: string,
  autonomyLevel: AutonomyLevel
): boolean {
  switch (action) {
    case "start_research":
    case "retry_research":
      return autonomyLevel >= 1;
    case "send_first_email":
      return autonomyLevel >= 2;
    case "send_followup":
      return autonomyLevel >= 3;
    // These always require manual action
    case "close_won":
    case "close_lost":
    case "reopen":
    case "reply_received":
      return false;
    // Research completion is always automatic (internal)
    case "research_done_no_email":
    case "research_done_with_email":
    case "research_failed":
      return true;
    default:
      return false;
  }
}

// ── Auto-research rules ──────────────────────────────────────

export interface AutoResearchRule {
  id: string;
  label: string;
  /** Statuses that trigger this rule */
  fromStatuses: OutreachStatus[];
  /** Minimum outdoor score required */
  minScore?: number;
  /** Minimum daily traffic required */
  minTraffic?: number;
  /** Max age in hours since property creation */
  maxAgeHours?: number;
  /** Whether this rule is currently active */
  active: boolean;
}

/** Default auto-research rules */
export const DEFAULT_AUTO_RULES: AutoResearchRule[] = [
  {
    id: "new-high-score",
    label: "Nye ejendomme med score ≥ 7 og trafik ≥ 15K",
    fromStatuses: ["NY_KRAEVER_RESEARCH"],
    minScore: 7,
    minTraffic: 15_000,
    active: false, // Disabled by default – user must enable
  },
  {
    id: "retry-contact-pending",
    label: "Genforsøg research for ejendomme uden kontakt (max 72t gamle)",
    fromStatuses: ["RESEARCH_DONE_CONTACT_PENDING"],
    maxAgeHours: 72,
    active: false,
  },
  {
    id: "retry-errors",
    label: "Genforsøg fejlede research-jobs",
    fromStatuses: ["FEJL"],
    active: false,
  },
];
