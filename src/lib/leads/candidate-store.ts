// ============================================================
// Lead Candidates – persistent store via Vercel Blob
// ============================================================

import { put, head, del } from "@vercel/blob";

export type CandidateStatus = "needs_review" | "approved" | "rejected" | "synced";
export type MatchType = "none" | "domain" | "company_fuzzy" | "exact";

export interface LeadCandidate {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  domain: string | null;
  job_title: string | null;
  phone: string | null;
  thread_id: string;
  source_account: string;
  subject: string;
  first_seen_at: string;
  last_seen_at: string;
  hubspot_contact_found: boolean;
  hubspot_company_found: boolean;
  match_type: MatchType;
  lead_score: number;
  score_reasons: string[];
  status: CandidateStatus;
  rejected_reason: string | null;
  hubspot_contact_id: string | null;
  hubspot_company_id: string | null;
  approved_at: string | null;
  synced_at: string | null;
  scan_run_id: string;
}

const BLOB_KEY = "lead-candidates/candidates.json";

async function readAll(): Promise<LeadCandidate[]> {
  try {
    const info = await head(BLOB_KEY).catch(() => null);
    if (!info) return [];
    const res = await fetch(info.url);
    if (!res.ok) return [];
    return (await res.json()) as LeadCandidate[];
  } catch {
    return [];
  }
}

async function writeAll(candidates: LeadCandidate[]): Promise<void> {
  await put(BLOB_KEY, JSON.stringify(candidates), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
}

export async function getAllCandidates(): Promise<LeadCandidate[]> {
  return readAll();
}

export async function getCandidatesByStatus(status: CandidateStatus): Promise<LeadCandidate[]> {
  const all = await readAll();
  return all.filter((c) => c.status === status);
}

export async function getCandidateById(id: string): Promise<LeadCandidate | null> {
  const all = await readAll();
  return all.find((c) => c.id === id) ?? null;
}

export async function saveCandidates(newCandidates: LeadCandidate[]): Promise<void> {
  const all = await readAll();

  // Dedup by email — update existing, append new
  const byEmail = new Map(all.map((c) => [c.email, c]));
  for (const nc of newCandidates) {
    const existing = byEmail.get(nc.email);
    if (existing) {
      // Update last_seen_at and score if higher
      existing.last_seen_at = nc.last_seen_at;
      if (nc.lead_score > existing.lead_score) {
        existing.lead_score = nc.lead_score;
        existing.score_reasons = nc.score_reasons;
      }
    } else {
      byEmail.set(nc.email, nc);
    }
  }

  await writeAll([...byEmail.values()]);
}

export async function updateCandidate(
  id: string,
  patch: Partial<LeadCandidate>
): Promise<LeadCandidate | null> {
  const all = await readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch };
  await writeAll(all);
  return all[idx];
}

export async function clearAllCandidates(): Promise<void> {
  await del(BLOB_KEY).catch(() => {});
}
