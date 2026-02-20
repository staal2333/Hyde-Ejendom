// ============================================================
// Staged Properties – Data Access Layer
// CRUD operations on the staged_properties table in Supabase.
// ============================================================

import { supabase, HAS_SUPABASE } from "../supabase";

// ── Types ─────────────────────────────────────────────────

export type StagedStage = "new" | "researching" | "researched" | "approved" | "rejected" | "pushed";
export type StagedSource = "discovery" | "street_agent" | "manual";

export interface StagedProperty {
  id: string;
  name: string;
  address: string;
  postalCode?: string;
  city?: string;
  outdoorScore?: number;
  outdoorNotes?: string;
  dailyTraffic?: number;
  trafficSource?: string;
  // Research data
  ownerCompany?: string;
  ownerCvr?: string;
  researchSummary?: string;
  researchLinks?: string;
  contactPerson?: string;
  contactEmail?: string;
  contactPhone?: string;
  emailDraftSubject?: string;
  emailDraftBody?: string;
  emailDraftNote?: string;
  // Metadata
  source: StagedSource;
  stage: StagedStage;
  hubspotId?: string;
  researchStartedAt?: string;
  researchCompletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStagedInput {
  name: string;
  address: string;
  postalCode?: string;
  city?: string;
  outdoorScore?: number;
  outdoorNotes?: string;
  dailyTraffic?: number;
  trafficSource?: string;
  source: StagedSource;
}

// ── Row <-> Object mapping ────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToStaged(r: any): StagedProperty {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    postalCode: r.postal_code ?? undefined,
    city: r.city ?? undefined,
    outdoorScore: r.outdoor_score != null ? Number(r.outdoor_score) : undefined,
    outdoorNotes: r.outdoor_notes ?? undefined,
    dailyTraffic: r.daily_traffic != null ? Number(r.daily_traffic) : undefined,
    trafficSource: r.traffic_source ?? undefined,
    ownerCompany: r.owner_company ?? undefined,
    ownerCvr: r.owner_cvr ?? undefined,
    researchSummary: r.research_summary ?? undefined,
    researchLinks: r.research_links ?? undefined,
    contactPerson: r.contact_person ?? undefined,
    contactEmail: r.contact_email ?? undefined,
    contactPhone: r.contact_phone ?? undefined,
    emailDraftSubject: r.email_draft_subject ?? undefined,
    emailDraftBody: r.email_draft_body ?? undefined,
    emailDraftNote: r.email_draft_note ?? undefined,
    source: r.source || "discovery",
    stage: r.stage || "new",
    hubspotId: r.hubspot_id ?? undefined,
    researchStartedAt: r.research_started_at ?? undefined,
    researchCompletedAt: r.research_completed_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ── CRUD Operations ───────────────────────────────────────

/** List staged properties with optional filters */
export async function listStagedProperties(opts?: {
  stage?: StagedStage;
  source?: StagedSource;
  city?: string;
  search?: string;
}): Promise<StagedProperty[]> {
  if (!HAS_SUPABASE) return [];

  let query = supabase!
    .from("staged_properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (opts?.stage) query = query.eq("stage", opts.stage);
  if (opts?.source) query = query.eq("source", opts.source);
  if (opts?.city) query = query.ilike("city", `%${opts.city}%`);
  if (opts?.search) query = query.or(`name.ilike.%${opts.search}%,address.ilike.%${opts.search}%`);

  const { data, error } = await query.limit(500);
  if (error) { console.error("[staging] list error:", error); return []; }
  return (data || []).map(rowToStaged);
}

/** Get a single staged property by ID */
export async function getStagedProperty(id: string): Promise<StagedProperty | null> {
  if (!HAS_SUPABASE) return null;

  const { data, error } = await supabase!
    .from("staged_properties")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return rowToStaged(data);
}

/** Check if an address already exists in staging */
export async function stagedExistsByAddress(address: string): Promise<boolean> {
  if (!HAS_SUPABASE) return false;

  const { data } = await supabase!
    .from("staged_properties")
    .select("id")
    .eq("address", address)
    .not("stage", "eq", "rejected")
    .limit(1);

  return (data?.length || 0) > 0;
}

/** Normalize string fields for storage */
function trim(s: string | undefined): string {
  return (s ?? "").trim();
}

/** Create a new staged property */
export async function insertStagedProperty(input: CreateStagedInput): Promise<StagedProperty> {
  if (!HAS_SUPABASE) throw new Error("Supabase not configured");

  const name = trim(input.name) || trim(input.address);
  const address = trim(input.address) || name;
  const postalCode = trim(input.postalCode) || undefined;
  const city = trim(input.city) || undefined;

  const { data, error } = await supabase!
    .from("staged_properties")
    .insert({
      name: name || address,
      address,
      postal_code: postalCode || null,
      city: city || null,
      outdoor_score: input.outdoorScore ?? null,
      outdoor_notes: input.outdoorNotes || null,
      daily_traffic: input.dailyTraffic ?? null,
      traffic_source: input.trafficSource || null,
      source: input.source,
      stage: "new",
    })
    .select()
    .single();

  if (error) throw new Error(`Insert staged property failed: ${error.message}`);
  return rowToStaged(data);
}

/** Update a staged property */
export async function updateStagedProperty(
  id: string,
  updates: Partial<{
    stage: StagedStage;
    ownerCompany: string;
    ownerCvr: string;
    researchSummary: string;
    researchLinks: string;
    contactPerson: string;
    contactEmail: string;
    contactPhone: string;
    emailDraftSubject: string;
    emailDraftBody: string;
    emailDraftNote: string;
    outdoorScore: number;
    hubspotId: string;
    researchStartedAt: string;
    researchCompletedAt: string;
  }>
): Promise<StagedProperty | null> {
  if (!HAS_SUPABASE) return null;

  // Map camelCase to snake_case
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.stage !== undefined) row.stage = updates.stage;
  if (updates.ownerCompany !== undefined) row.owner_company = updates.ownerCompany;
  if (updates.ownerCvr !== undefined) row.owner_cvr = updates.ownerCvr;
  if (updates.researchSummary !== undefined) row.research_summary = updates.researchSummary;
  if (updates.researchLinks !== undefined) row.research_links = updates.researchLinks;
  if (updates.contactPerson !== undefined) row.contact_person = updates.contactPerson;
  if (updates.contactEmail !== undefined) row.contact_email = updates.contactEmail;
  if (updates.contactPhone !== undefined) row.contact_phone = updates.contactPhone;
  if (updates.emailDraftSubject !== undefined) row.email_draft_subject = updates.emailDraftSubject;
  if (updates.emailDraftBody !== undefined) row.email_draft_body = updates.emailDraftBody;
  if (updates.emailDraftNote !== undefined) row.email_draft_note = updates.emailDraftNote;
  if (updates.outdoorScore !== undefined) row.outdoor_score = updates.outdoorScore;
  if (updates.hubspotId !== undefined) row.hubspot_id = updates.hubspotId;
  if (updates.researchStartedAt !== undefined) row.research_started_at = updates.researchStartedAt;
  if (updates.researchCompletedAt !== undefined) row.research_completed_at = updates.researchCompletedAt;

  const { data, error } = await supabase!
    .from("staged_properties")
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) { console.error("[staging] update error:", error); return null; }
  return rowToStaged(data);
}

/** Delete a staged property */
export async function deleteStagedProperty(id: string): Promise<boolean> {
  if (!HAS_SUPABASE) return false;

  const { error } = await supabase!
    .from("staged_properties")
    .delete()
    .eq("id", id);

  return !error;
}

/** Get counts by stage for dashboard – uses a single-column fetch for efficiency */
export async function getStagedCounts(): Promise<Record<StagedStage, number>> {
  const empty: Record<StagedStage, number> = { new: 0, researching: 0, researched: 0, approved: 0, rejected: 0, pushed: 0 };
  if (!HAS_SUPABASE) return empty;

  // Try RPC (GROUP BY) first – falls back to client-side counting
  try {
    const { data: rpcData } = await supabase!.rpc("staged_property_counts");
    if (rpcData && Array.isArray(rpcData)) {
      const counts = { ...empty };
      for (const row of rpcData) {
        if (row.stage in counts) counts[row.stage as StagedStage] = Number(row.count);
      }
      return counts;
    }
  } catch {
    // RPC not available – fallback below
  }

  // Fallback: fetch only the stage column and count client-side
  const { data } = await supabase!
    .from("staged_properties")
    .select("stage")
    .limit(5000);

  const counts = { ...empty };
  for (const row of data || []) {
    if (row.stage in counts) counts[row.stage as StagedStage]++;
  }
  return counts;
}
