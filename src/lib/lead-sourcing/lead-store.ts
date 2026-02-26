// ============================================================
// Lead Store – CRUD for persistent lead pipeline (Supabase)
// ============================================================

import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import type { LeadCompany } from "./companies";

export type LeadStatus = "new" | "qualified" | "contacted" | "customer" | "lost";

export interface LeadRow {
  id: string;
  name: string;
  cvr: string | null;
  address: string | null;
  industry: string | null;
  website: string | null;
  domain: string | null;
  egenkapital: number | null;
  resultat: number | null;
  omsaetning: number | null;
  page_category: string | null;
  page_likes: number | null;
  ad_count: number;
  platforms: string[];
  ooh_score: number;
  ooh_reason: string | null;
  source_platform: string;
  status: LeadStatus;
  hubspot_company_id: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contacts: LeadContactEntry[];
  ooh_pitch: string | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  notes: NoteEntry[];
  discovered_at: string;
  updated_at: string;
}

export interface NoteEntry {
  text: string;
  created_at: string;
  author?: string;
}

export interface LeadContactEntry {
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  source: string;
  confidence?: number;
}

export interface LeadFilters {
  status?: LeadStatus;
  statuses?: LeadStatus[];
  sourcePlatform?: string;
  minScore?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

function rowToLead(row: Record<string, unknown>): LeadRow {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    cvr: row.cvr ? String(row.cvr) : null,
    address: row.address ? String(row.address) : null,
    industry: row.industry ? String(row.industry) : null,
    website: row.website ? String(row.website) : null,
    domain: row.domain ? String(row.domain) : null,
    egenkapital: row.egenkapital != null ? Number(row.egenkapital) : null,
    resultat: row.resultat != null ? Number(row.resultat) : null,
    omsaetning: row.omsaetning != null ? Number(row.omsaetning) : null,
    page_category: row.page_category ? String(row.page_category) : null,
    page_likes: row.page_likes != null ? Number(row.page_likes) : null,
    ad_count: Number(row.ad_count) || 0,
    platforms: Array.isArray(row.platforms) ? row.platforms.map(String) : [],
    ooh_score: Number(row.ooh_score) || 0,
    ooh_reason: row.ooh_reason ? String(row.ooh_reason) : null,
    source_platform: String(row.source_platform || "meta"),
    status: (row.status as LeadStatus) || "new",
    hubspot_company_id: row.hubspot_company_id ? String(row.hubspot_company_id) : null,
    contact_email: row.contact_email ? String(row.contact_email) : null,
    contact_phone: row.contact_phone ? String(row.contact_phone) : null,
    contacts: Array.isArray(row.contacts) ? row.contacts as LeadContactEntry[] : [],
    ooh_pitch: row.ooh_pitch ? String(row.ooh_pitch) : null,
    last_contacted_at: row.last_contacted_at ? String(row.last_contacted_at) : null,
    next_followup_at: row.next_followup_at ? String(row.next_followup_at) : null,
    notes: Array.isArray(row.notes) ? row.notes as NoteEntry[] : [],
    discovered_at: String(row.discovered_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

export async function saveLeads(companies: LeadCompany[]): Promise<{ saved: number; skipped: number }> {
  if (!HAS_SUPABASE || !supabase) {
    logger.warn("[lead-store] Supabase not configured", { service: "lead-sourcing" });
    return { saved: 0, skipped: 0 };
  }

  let saved = 0;
  let skipped = 0;

  for (const c of companies) {
    const { error } = await supabase.from("leads").upsert(
      {
        name: c.name,
        cvr: c.cvr || null,
        address: c.address || null,
        industry: c.industry || null,
        website: c.website || null,
        domain: c.domain,
        egenkapital: c.egenkapital,
        resultat: c.resultat,
        omsaetning: c.omsaetning,
        page_category: c.pageCategory,
        page_likes: c.pageLikes,
        ad_count: c.adCount,
        platforms: c.platforms,
        ooh_score: c.oohScore,
        ooh_reason: c.oohReason,
        source_platform: c.sourcePlatform || "meta",
      },
      { onConflict: "name", ignoreDuplicates: false }
    );

    if (error) {
      logger.warn(`[lead-store] Upsert failed for "${c.name}": ${error.message}`, { service: "lead-sourcing" });
      skipped++;
    } else {
      saved++;
    }
  }

  logger.info(`[lead-store] Saved ${saved}, skipped ${skipped}`, { service: "lead-sourcing" });
  return { saved, skipped };
}

export async function getLeads(filters: LeadFilters = {}): Promise<LeadRow[]> {
  if (!HAS_SUPABASE || !supabase) return [];

  let query = supabase.from("leads").select("*");

  if (filters.status) {
    query = query.eq("status", filters.status);
  } else if (filters.statuses?.length) {
    query = query.in("status", filters.statuses);
  }

  if (filters.sourcePlatform) {
    query = query.eq("source_platform", filters.sourcePlatform);
  }

  if (filters.minScore != null) {
    query = query.gte("ooh_score", filters.minScore);
  }

  if (filters.search) {
    query = query.ilike("name", `%${filters.search}%`);
  }

  query = query.order("ooh_score", { ascending: false });

  if (filters.limit) query = query.limit(filters.limit);
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);

  const { data, error } = await query;
  if (error) {
    logger.warn(`[lead-store] getLeads failed: ${error.message}`, { service: "lead-sourcing" });
    return [];
  }

  return (data || []).map(rowToLead);
}

export async function getLeadById(id: string): Promise<LeadRow | null> {
  if (!HAS_SUPABASE || !supabase) return null;

  const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
  if (error || !data) return null;
  return rowToLead(data);
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<LeadRow | null> {
  if (!HAS_SUPABASE || !supabase) return null;

  const updates: Record<string, unknown> = { status };
  if (status === "contacted") {
    updates.last_contacted_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from("leads").update(updates).eq("id", id).select("*").single();
  if (error) {
    logger.warn(`[lead-store] updateStatus failed: ${error.message}`, { service: "lead-sourcing" });
    return null;
  }
  return data ? rowToLead(data) : null;
}

export async function updateLead(id: string, fields: Record<string, unknown>): Promise<LeadRow | null> {
  if (!HAS_SUPABASE || !supabase) return null;

  const { data, error } = await supabase.from("leads").update(fields).eq("id", id).select("*").single();
  if (error) {
    logger.warn(`[lead-store] updateLead failed: ${error.message}`, { service: "lead-sourcing" });
    return null;
  }
  return data ? rowToLead(data) : null;
}

export async function addNote(id: string, text: string, author?: string): Promise<LeadRow | null> {
  if (!HAS_SUPABASE || !supabase) return null;

  const lead = await getLeadById(id);
  if (!lead) return null;

  const notes = [...lead.notes, { text, created_at: new Date().toISOString(), author }];
  const { data, error } = await supabase.from("leads").update({ notes }).eq("id", id).select("*").single();
  if (error) {
    logger.warn(`[lead-store] addNote failed: ${error.message}`, { service: "lead-sourcing" });
    return null;
  }
  return data ? rowToLead(data) : null;
}

export async function setFollowup(id: string, date: string): Promise<LeadRow | null> {
  if (!HAS_SUPABASE || !supabase) return null;

  const { data, error } = await supabase
    .from("leads")
    .update({ next_followup_at: date })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    logger.warn(`[lead-store] setFollowup failed: ${error.message}`, { service: "lead-sourcing" });
    return null;
  }
  return data ? rowToLead(data) : null;
}

export async function getLeadCounts(): Promise<Record<LeadStatus, number>> {
  const counts: Record<LeadStatus, number> = { new: 0, qualified: 0, contacted: 0, customer: 0, lost: 0 };
  if (!HAS_SUPABASE || !supabase) return counts;

  const leads = await getLeads({ limit: 10000 });
  for (const l of leads) counts[l.status]++;
  return counts;
}

export interface LeadSummary {
  counts: Record<LeadStatus, number>;
  overdueFollowups: number;
  todayFollowups: number;
  topNewLeads: Pick<LeadRow, "id" | "name" | "ooh_score" | "contact_email" | "source_platform" | "discovered_at">[];
}

export async function getLeadSummary(): Promise<LeadSummary> {
  const counts: Record<LeadStatus, number> = { new: 0, qualified: 0, contacted: 0, customer: 0, lost: 0 };
  const summary: LeadSummary = { counts, overdueFollowups: 0, todayFollowups: 0, topNewLeads: [] };
  if (!HAS_SUPABASE || !supabase) return summary;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  const { data: allLeads } = await supabase
    .from("leads")
    .select("id, name, status, ooh_score, contact_email, source_platform, discovered_at, next_followup_at")
    .order("ooh_score", { ascending: false });

  if (!allLeads) return summary;

  for (const l of allLeads) {
    const st = (l.status as LeadStatus) || "new";
    counts[st] = (counts[st] || 0) + 1;

    if (l.next_followup_at) {
      const fDate = String(l.next_followup_at).slice(0, 10);
      if (fDate < todayStr) summary.overdueFollowups++;
      else if (fDate === todayStr) summary.todayFollowups++;
    }
  }

  summary.counts = counts;
  summary.topNewLeads = allLeads
    .filter(l => l.status === "new")
    .slice(0, 5)
    .map(l => ({
      id: String(l.id),
      name: String(l.name),
      ooh_score: Number(l.ooh_score) || 0,
      contact_email: l.contact_email ? String(l.contact_email) : null,
      source_platform: String(l.source_platform || "meta"),
      discovered_at: String(l.discovered_at),
    }));

  return summary;
}

export async function deleteLead(id: string): Promise<boolean> {
  if (!HAS_SUPABASE || !supabase) return false;

  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) {
    logger.warn(`[lead-store] deleteLead failed: ${error.message}`, { service: "lead-sourcing" });
    return false;
  }
  return true;
}
