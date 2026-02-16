// ============================================================
// OOH Store – Supabase Postgres data layer
//
// All data is stored in Supabase Postgres when configured.
// Falls back to in-memory Maps + .ooh-store.json for local dev
// when NEXT_PUBLIC_SUPABASE_URL is not set.
// ============================================================

import type {
  Frame,
  Creative,
  Proposal,
  Template,
  Network,
  PresentationTemplate,
  OOHContact,
  OOHCampaign,
  OOHSend,
} from "./types";

import { supabase, HAS_SUPABASE } from "../supabase";

/* ================================================================
   SUPABASE POSTGRES IMPLEMENTATION
   ================================================================ */

// ── Row → Type mappers ──────────────────────────────────────

function rowToFrame(r: Record<string, unknown>): Frame {
  const rawPlacement = r.placement as (Frame["placement"] & { _allPlacements?: Frame["placements"] });
  // Extract embedded placements from inside the placement JSONB (works without schema migration)
  const embeddedPlacements = rawPlacement?._allPlacements;
  // Also check the dedicated placements column (works after migration)
  const columnPlacements = r.placements as Frame["placements"] | undefined | null;

  // Priority: dedicated column > embedded in placement JSONB > [placement]
  const placements =
    (Array.isArray(columnPlacements) && columnPlacements.length > 0)
      ? columnPlacements
      : (Array.isArray(embeddedPlacements) && embeddedPlacements.length > 0)
        ? embeddedPlacements
        : [rawPlacement];

  // Clean placement (remove _allPlacements meta key for the primary placement)
  const { _allPlacements: _, ...cleanPlacement } = rawPlacement || {} as Record<string, unknown>;
  const placement = (cleanPlacement as Frame["placement"]) || placements[0];

  return {
    id: r.id as string,
    name: r.name as string,
    locationAddress: r.location_address as string | undefined,
    locationCity: r.location_city as string | undefined,
    frameType: (r.frame_type as Frame["frameType"]) || "other",
    driveFileId: r.drive_file_id as string | undefined,
    frameImageUrl: r.frame_image_url as string,
    placement,
    placements,
    frameWidth: r.frame_width as number,
    frameHeight: r.frame_height as number,
    dailyTraffic: r.daily_traffic as number | undefined,
    listPrice: r.list_price != null ? Number(r.list_price) : undefined,
    isActive: r.is_active as boolean,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToCreative(r: Record<string, unknown>): Creative {
  return {
    id: r.id as string,
    filename: r.filename as string,
    driveFileId: r.drive_file_id as string | undefined,
    driveFolderId: r.drive_folder_id as string | undefined,
    companyName: (r.company_name as string) || "",
    companyId: r.company_id as string | undefined,
    campaignName: r.campaign_name as string | undefined,
    mimeType: r.mime_type as string | undefined,
    fileSize: r.file_size as number | undefined,
    width: r.width as number | undefined,
    height: r.height as number | undefined,
    thumbnailUrl: r.thumbnail_url as string | undefined,
    tags: (r.tags as string[]) || [],
    category: r.category as string | undefined,
    colorProfile: r.color_profile as Creative["colorProfile"],
    usageCount: (r.usage_count as number) || 0,
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : undefined,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToPresentationTemplate(
  r: Record<string, unknown>
): PresentationTemplate {
  return {
    id: r.id as string,
    name: r.name as string,
    pdfFileUrl: r.pdf_file_url as string,
    pageCount: r.page_count as number,
    pages: (r.pages as PresentationTemplate["pages"]) || [],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToNetwork(r: Record<string, unknown>): Network {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | undefined,
    frameIds: (r.frame_ids as string[]) || [],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

// ── Supabase: Frames ────────────────────────────────────────

async function sb_getFrames(filters?: {
  city?: string;
  type?: string;
  search?: string;
}): Promise<Frame[]> {
  let query = supabase!
    .from("frames")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (filters?.city) {
    query = query.ilike("location_city", `%${filters.city}%`);
  }
  if (filters?.type) {
    query = query.eq("frame_type", filters.type);
  }
  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,location_address.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToFrame);
}

async function sb_getFrame(id: string): Promise<Frame | undefined> {
  const { data, error } = await supabase!
    .from("frames")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
  return data ? rowToFrame(data) : undefined;
}

async function sb_upsertFrame(frame: Frame): Promise<Frame> {
  const now = new Date().toISOString();
  // Ensure placements array is populated; sync placement = placements[0]
  const placements =
    Array.isArray(frame.placements) && frame.placements.length > 0
      ? frame.placements
      : [frame.placement];
  frame = { ...frame, updatedAt: now, placements, placement: placements[0] };

  // Embed all placements inside the placement JSONB so it works without
  // the dedicated placements column (pre-migration compatibility)
  const placementWithEmbedded = { ...frame.placement, _allPlacements: frame.placements };

  const row: Record<string, unknown> = {
    id: frame.id,
    name: frame.name,
    location_address: frame.locationAddress ?? null,
    location_city: frame.locationCity ?? null,
    frame_type: frame.frameType,
    drive_file_id: frame.driveFileId ?? null,
    frame_image_url: frame.frameImageUrl,
    placement: placementWithEmbedded,
    placements: frame.placements,
    frame_width: frame.frameWidth,
    frame_height: frame.frameHeight,
    daily_traffic: frame.dailyTraffic ?? null,
    list_price: frame.listPrice ?? null,
    is_active: frame.isActive,
    created_at: frame.createdAt,
    updated_at: now,
  };

  // Try with placements column; fall back without if column doesn't exist yet
  let { error } = await supabase!
    .from("frames")
    .upsert(row, { onConflict: "id" });

  if (error && error.message?.includes("placements")) {
    // Column doesn't exist yet – retry without it
    delete row.placements;
    const retry = await supabase!
      .from("frames")
      .upsert(row, { onConflict: "id" });
    error = retry.error;
  }
  if (error) throw error;
  return frame;
}

async function sb_deleteFrame(id: string): Promise<boolean> {
  const { error, count } = await supabase!
    .from("frames")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── Supabase: Creatives ─────────────────────────────────────

async function sb_getCreatives(filters?: {
  q?: string;
  company?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<{ items: Creative[]; total: number; hasMore: boolean }> {
  const limit = filters?.limit || 20;
  const offset = filters?.offset || 0;

  let countQuery = supabase!
    .from("creatives")
    .select("*", { count: "exact", head: true });
  let dataQuery = supabase!
    .from("creatives")
    .select("*")
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters?.q) {
    const like = `%${filters.q}%`;
    const filter = `company_name.ilike.${like},campaign_name.ilike.${like},filename.ilike.${like}`;
    countQuery = countQuery.or(filter);
    dataQuery = dataQuery.or(filter);
  }
  if (filters?.company) {
    countQuery = countQuery.ilike("company_name", `%${filters.company}%`);
    dataQuery = dataQuery.ilike("company_name", `%${filters.company}%`);
  }

  const [{ count }, { data, error }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);
  if (error) throw error;

  const total = count ?? 0;
  return {
    items: (data || []).map(rowToCreative),
    total,
    hasMore: offset + limit < total,
  };
}

async function sb_getCreative(id: string): Promise<Creative | undefined> {
  const { data, error } = await supabase!
    .from("creatives")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? rowToCreative(data) : undefined;
}

async function sb_upsertCreative(creative: Creative): Promise<Creative> {
  const now = new Date().toISOString();
  creative = { ...creative, updatedAt: now };

  const row = {
    id: creative.id,
    filename: creative.filename,
    drive_file_id: creative.driveFileId ?? null,
    drive_folder_id: creative.driveFolderId ?? null,
    company_name: creative.companyName,
    company_id: creative.companyId ?? null,
    campaign_name: creative.campaignName ?? null,
    mime_type: creative.mimeType ?? null,
    file_size: creative.fileSize ?? null,
    width: creative.width ?? null,
    height: creative.height ?? null,
    thumbnail_url: creative.thumbnailUrl ?? null,
    tags: creative.tags,
    category: creative.category ?? null,
    color_profile: creative.colorProfile ?? null,
    usage_count: creative.usageCount,
    last_used_at: creative.lastUsedAt ?? null,
    created_at: creative.createdAt,
    updated_at: now,
  };

  const { error } = await supabase!
    .from("creatives")
    .upsert(row, { onConflict: "id" });
  if (error) throw error;
  return creative;
}

async function sb_deleteCreative(id: string): Promise<boolean> {
  const { error, count } = await supabase!
    .from("creatives")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── Supabase: Presentation Templates ────────────────────────

async function sb_getPresentationTemplates(): Promise<PresentationTemplate[]> {
  const { data, error } = await supabase!
    .from("presentation_templates")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToPresentationTemplate);
}

async function sb_getPresentationTemplate(
  id: string
): Promise<PresentationTemplate | undefined> {
  const { data, error } = await supabase!
    .from("presentation_templates")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? rowToPresentationTemplate(data) : undefined;
}

async function sb_upsertPresentationTemplate(
  inputT: PresentationTemplate
): Promise<PresentationTemplate> {
  const now = new Date().toISOString();
  const t = { ...inputT, updatedAt: now };

  const row = {
    id: t.id,
    name: t.name,
    pdf_file_url: t.pdfFileUrl,
    page_count: t.pageCount,
    pages: t.pages,
    created_at: t.createdAt,
    updated_at: now,
  };

  const { error } = await supabase!
    .from("presentation_templates")
    .upsert(row, { onConflict: "id" });
  if (error) throw error;
  return t;
}

async function sb_deletePresentationTemplate(id: string): Promise<boolean> {
  const { error, count } = await supabase!
    .from("presentation_templates")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── Supabase: Networks ──────────────────────────────────────

async function sb_getNetworks(): Promise<Network[]> {
  const { data, error } = await supabase!
    .from("networks")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToNetwork);
}

async function sb_getNetwork(id: string): Promise<Network | undefined> {
  const { data, error } = await supabase!
    .from("networks")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? rowToNetwork(data) : undefined;
}

async function sb_upsertNetwork(network: Network): Promise<Network> {
  const now = new Date().toISOString();
  network = { ...network, updatedAt: now };

  const row = {
    id: network.id,
    name: network.name,
    description: network.description ?? null,
    frame_ids: network.frameIds,
    created_at: network.createdAt,
    updated_at: now,
  };

  const { error } = await supabase!
    .from("networks")
    .upsert(row, { onConflict: "id" });
  if (error) throw error;
  return network;
}

async function sb_deleteNetwork(id: string): Promise<boolean> {
  const { error, count } = await supabase!
    .from("networks")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── Row → Type mappers for Outreach entities ────────────────

function rowToContact(r: Record<string, unknown>): OOHContact {
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    phone: r.phone as string | undefined,
    company: (r.company as string) || "",
    industry: r.industry as string | undefined,
    city: r.city as string | undefined,
    notes: r.notes as string | undefined,
    tags: (r.tags as string[]) || [],
    lastContactedAt: r.last_contacted_at ? String(r.last_contacted_at) : undefined,
    totalProposalsSent: (r.total_proposals_sent as number) || 0,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function rowToCampaign(r: Record<string, unknown>): OOHCampaign {
  return {
    id: r.id as string,
    name: r.name as string,
    status: (r.status as OOHCampaign["status"]) || "draft",
    networkId: r.network_id as string | undefined,
    frameIds: (r.frame_ids as string[]) || [],
    creativeId: r.creative_id as string | undefined,
    templateId: r.template_id as string | undefined,
    contactIds: (r.contact_ids as string[]) || [],
    emailSubject: (r.email_subject as string) || "",
    emailBody: (r.email_body as string) || "",
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    sentAt: r.sent_at ? String(r.sent_at) : undefined,
  };
}

function rowToSend(r: Record<string, unknown>): OOHSend {
  return {
    id: r.id as string,
    campaignId: r.campaign_id as string,
    contactId: r.contact_id as string,
    contactName: r.contact_name as string | undefined,
    contactEmail: r.contact_email as string | undefined,
    contactCompany: r.contact_company as string | undefined,
    proposalPdfUrl: r.proposal_pdf_url as string | undefined,
    status: (r.status as OOHSend["status"]) || "queued",
    sentAt: r.sent_at ? String(r.sent_at) : undefined,
    openedAt: r.opened_at ? String(r.opened_at) : undefined,
    clickedAt: r.clicked_at ? String(r.clicked_at) : undefined,
    repliedAt: r.replied_at ? String(r.replied_at) : undefined,
    followUpCount: (r.follow_up_count as number) || 0,
    nextFollowUpAt: r.next_follow_up_at ? String(r.next_follow_up_at) : undefined,
    gmailMessageId: r.gmail_message_id as string | undefined,
    gmailThreadId: r.gmail_thread_id as string | undefined,
    errorMessage: r.error_message as string | undefined,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

// ── Supabase: Contacts ──────────────────────────────────────

async function sb_getContacts(filters?: {
  search?: string;
  city?: string;
  industry?: string;
  tags?: string[];
}): Promise<OOHContact[]> {
  let query = supabase!
    .from("ooh_contacts")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filters?.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company.ilike.%${filters.search}%`
    );
  }
  if (filters?.city) {
    query = query.ilike("city", `%${filters.city}%`);
  }
  if (filters?.industry) {
    query = query.ilike("industry", `%${filters.industry}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToContact);
}

async function sb_getContact(id: string): Promise<OOHContact | undefined> {
  const { data, error } = await supabase!
    .from("ooh_contacts")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? rowToContact(data) : undefined;
}

async function sb_upsertContact(contact: OOHContact): Promise<OOHContact> {
  const now = new Date().toISOString();
  contact = { ...contact, updatedAt: now };

  const row = {
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone ?? null,
    company: contact.company,
    industry: contact.industry ?? null,
    city: contact.city ?? null,
    notes: contact.notes ?? null,
    tags: contact.tags,
    last_contacted_at: contact.lastContactedAt ?? null,
    total_proposals_sent: contact.totalProposalsSent,
    created_at: contact.createdAt,
    updated_at: now,
  };

  const { error } = await supabase!
    .from("ooh_contacts")
    .upsert(row, { onConflict: "id" });
  if (error) throw error;
  return contact;
}

async function sb_deleteContact(id: string): Promise<boolean> {
  const { error, count } = await supabase!
    .from("ooh_contacts")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── Supabase: Campaigns ─────────────────────────────────────

async function sb_getCampaigns(filters?: {
  status?: string;
}): Promise<OOHCampaign[]> {
  let query = supabase!
    .from("ooh_campaigns")
    .select("*")
    .order("updated_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToCampaign);
}

async function sb_getCampaign(id: string): Promise<OOHCampaign | undefined> {
  const { data, error } = await supabase!
    .from("ooh_campaigns")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? rowToCampaign(data) : undefined;
}

async function sb_upsertCampaign(campaign: OOHCampaign): Promise<OOHCampaign> {
  const now = new Date().toISOString();
  campaign = { ...campaign, updatedAt: now };

  const row = {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    network_id: campaign.networkId ?? null,
    frame_ids: campaign.frameIds,
    creative_id: campaign.creativeId ?? null,
    template_id: campaign.templateId ?? null,
    contact_ids: campaign.contactIds,
    email_subject: campaign.emailSubject,
    email_body: campaign.emailBody,
    created_at: campaign.createdAt,
    updated_at: now,
    sent_at: campaign.sentAt ?? null,
  };

  const { error } = await supabase!
    .from("ooh_campaigns")
    .upsert(row, { onConflict: "id" });
  if (error) throw error;
  return campaign;
}

async function sb_deleteCampaign(id: string): Promise<boolean> {
  const { error, count } = await supabase!
    .from("ooh_campaigns")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ── Supabase: Sends ─────────────────────────────────────────

async function sb_getSends(filters?: {
  campaignId?: string;
  contactId?: string;
  status?: string;
}): Promise<OOHSend[]> {
  let query = supabase!
    .from("ooh_sends")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.campaignId) {
    query = query.eq("campaign_id", filters.campaignId);
  }
  if (filters?.contactId) {
    query = query.eq("contact_id", filters.contactId);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToSend);
}

async function sb_getSend(id: string): Promise<OOHSend | undefined> {
  const { data, error } = await supabase!
    .from("ooh_sends")
    .select("*")
    .eq("id", id)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ? rowToSend(data) : undefined;
}

async function sb_upsertSend(send: OOHSend): Promise<OOHSend> {
  const now = new Date().toISOString();
  send = { ...send, updatedAt: now };

  const row = {
    id: send.id,
    campaign_id: send.campaignId,
    contact_id: send.contactId,
    contact_name: send.contactName ?? null,
    contact_email: send.contactEmail ?? null,
    contact_company: send.contactCompany ?? null,
    proposal_pdf_url: send.proposalPdfUrl ?? null,
    status: send.status,
    sent_at: send.sentAt ?? null,
    opened_at: send.openedAt ?? null,
    clicked_at: send.clickedAt ?? null,
    replied_at: send.repliedAt ?? null,
    follow_up_count: send.followUpCount,
    next_follow_up_at: send.nextFollowUpAt ?? null,
    gmail_message_id: send.gmailMessageId ?? null,
    gmail_thread_id: send.gmailThreadId ?? null,
    error_message: send.errorMessage ?? null,
    created_at: send.createdAt,
    updated_at: now,
  };

  const { error } = await supabase!
    .from("ooh_sends")
    .upsert(row, { onConflict: "id" });
  if (error) throw error;
  return send;
}

// ── Supabase: Sends – batch operations ──────────────────────

async function sb_getDueFollowUps(): Promise<OOHSend[]> {
  const now = new Date().toISOString();
  const { data, error } = await supabase!
    .from("ooh_sends")
    .select("*")
    .eq("status", "sent")
    .lte("next_follow_up_at", now)
    .order("next_follow_up_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(rowToSend);
}

/* ================================================================
   LOCAL FALLBACK (in-memory + .ooh-store.json)
   Used when Supabase is not configured (local dev without DB)
   ================================================================ */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const STORE_FILE = join(process.cwd(), ".ooh-store.json");

interface StoreData {
  frames: Record<string, Frame>;
  creatives: Record<string, Creative>;
  proposals: Record<string, Proposal>;
  templates: Record<string, Template>;
  networks: Record<string, Network>;
  presentationTemplates: Record<string, PresentationTemplate>;
  oohContacts?: Record<string, OOHContact>;
  oohCampaigns?: Record<string, OOHCampaign>;
  oohSends?: Record<string, OOHSend>;
}

function loadFromDisk(): StoreData | null {
  try {
    if (existsSync(STORE_FILE)) {
      const raw = readFileSync(STORE_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn("[ooh-store] Could not load store from disk:", e);
  }
  return null;
}

function saveToDisk() {
  if (process.env.VERCEL) return;
  try {
    const data: StoreData = {
      frames: Object.fromEntries(frames),
      creatives: Object.fromEntries(creatives),
      proposals: Object.fromEntries(proposals),
      templates: Object.fromEntries(templates),
      networks: Object.fromEntries(networks),
      presentationTemplates: Object.fromEntries(presentationTemplates),
      oohContacts: Object.fromEntries(oohContacts),
      oohCampaigns: Object.fromEntries(oohCampaigns),
      oohSends: Object.fromEntries(oohSends),
    };
    writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.warn("[ooh-store] Could not save store to disk:", e);
  }
}

// globalThis persistence for hot reload
interface OohStoreGlobal {
  __ooh_frames: Map<string, Frame>;
  __ooh_creatives: Map<string, Creative>;
  __ooh_proposals: Map<string, Proposal>;
  __ooh_templates: Map<string, Template>;
  __ooh_networks: Map<string, Network>;
  __ooh_presentation_templates: Map<string, PresentationTemplate>;
  __ooh_contacts: Map<string, OOHContact>;
  __ooh_campaigns: Map<string, OOHCampaign>;
  __ooh_sends: Map<string, OOHSend>;
  __ooh_loaded: boolean;
}

const g = globalThis as unknown as Partial<OohStoreGlobal>;

if (!g.__ooh_frames) g.__ooh_frames = new Map();
if (!g.__ooh_creatives) g.__ooh_creatives = new Map();
if (!g.__ooh_proposals) g.__ooh_proposals = new Map();
if (!g.__ooh_templates) g.__ooh_templates = new Map();
if (!g.__ooh_networks) g.__ooh_networks = new Map();
if (!g.__ooh_presentation_templates) g.__ooh_presentation_templates = new Map();
if (!g.__ooh_contacts) g.__ooh_contacts = new Map();
if (!g.__ooh_campaigns) g.__ooh_campaigns = new Map();
if (!g.__ooh_sends) g.__ooh_sends = new Map();

const frames = g.__ooh_frames;
const creatives = g.__ooh_creatives;
const proposals = g.__ooh_proposals;
const templates = g.__ooh_templates;
const networks = g.__ooh_networks;
const presentationTemplates = g.__ooh_presentation_templates;
const oohContacts = g.__ooh_contacts;
const oohCampaigns = g.__ooh_campaigns;
const oohSends = g.__ooh_sends;

if (!g.__ooh_loaded) {
  g.__ooh_loaded = true;
  const diskData = loadFromDisk();
  if (diskData) {
    if (diskData.frames)
      for (const [k, v] of Object.entries(diskData.frames)) frames.set(k, v);
    if (diskData.creatives)
      for (const [k, v] of Object.entries(diskData.creatives))
        creatives.set(k, v);
    if (diskData.proposals)
      for (const [k, v] of Object.entries(diskData.proposals))
        proposals.set(k, v);
    if (diskData.templates)
      for (const [k, v] of Object.entries(diskData.templates))
        templates.set(k, v);
    if (diskData.networks)
      for (const [k, v] of Object.entries(diskData.networks))
        networks.set(k, v);
    if (diskData.presentationTemplates)
      for (const [k, v] of Object.entries(diskData.presentationTemplates))
        presentationTemplates.set(k, v);
    if (diskData.oohContacts)
      for (const [k, v] of Object.entries(diskData.oohContacts))
        oohContacts.set(k, v);
    if (diskData.oohCampaigns)
      for (const [k, v] of Object.entries(diskData.oohCampaigns))
        oohCampaigns.set(k, v);
    if (diskData.oohSends)
      for (const [k, v] of Object.entries(diskData.oohSends))
        oohSends.set(k, v);
    console.log(
      `[ooh-store] Local fallback: ${frames.size} frames, ${creatives.size} creatives`
    );
  }
}

/* ================================================================
   EXPORTED API – routes to Supabase or local fallback
   ================================================================ */

// ── Frames ──────────────────────────────────────────────────

export async function getFrames(
  filters?: { city?: string; type?: string; search?: string }
): Promise<Frame[]> {
  if (HAS_SUPABASE) return sb_getFrames(filters);

  let results = [...frames.values()].filter((f) => f.isActive);
  if (filters?.city) {
    const city = filters.city.toLowerCase();
    results = results.filter((f) =>
      f.locationCity?.toLowerCase().includes(city)
    );
  }
  if (filters?.type) {
    results = results.filter((f) => f.frameType === filters.type);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    results = results.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.locationAddress?.toLowerCase().includes(q)
    );
  }
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getFrame(id: string): Promise<Frame | undefined> {
  if (HAS_SUPABASE) return sb_getFrame(id);
  return frames.get(id);
}

export async function upsertFrame(frame: Frame): Promise<Frame> {
  if (HAS_SUPABASE) return sb_upsertFrame(frame);
  // Ensure placements populated; sync placement = placements[0]
  const placements =
    Array.isArray(frame.placements) && frame.placements.length > 0
      ? frame.placements
      : [frame.placement];
  frame = { ...frame, updatedAt: new Date().toISOString(), placements, placement: placements[0] };
  frames.set(frame.id, frame);
  saveToDisk();
  return frame;
}

export async function deleteFrame(id: string): Promise<boolean> {
  if (HAS_SUPABASE) return sb_deleteFrame(id);
  const ok = frames.delete(id);
  if (ok) saveToDisk();
  return ok;
}

// ── Creatives ───────────────────────────────────────────────

export async function getCreatives(filters?: {
  q?: string;
  company?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<{ items: Creative[]; total: number; hasMore: boolean }> {
  if (HAS_SUPABASE) return sb_getCreatives(filters);

  let results = [...creatives.values()];
  if (filters?.q) {
    const q = filters.q.toLowerCase();
    results = results.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        c.campaignName?.toLowerCase().includes(q) ||
        c.filename.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  if (filters?.company) {
    const comp = filters.company.toLowerCase();
    results = results.filter((c) =>
      c.companyName.toLowerCase().includes(comp)
    );
  }
  if (filters?.tags?.length) {
    results = results.filter((c) =>
      filters.tags!.some((t) => c.tags.includes(t))
    );
  }
  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const total = results.length;
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 20;
  const sliced = results.slice(offset, offset + limit);
  return { items: sliced, total, hasMore: offset + limit < total };
}

export async function getCreative(id: string): Promise<Creative | undefined> {
  if (HAS_SUPABASE) return sb_getCreative(id);
  return creatives.get(id);
}

export async function upsertCreative(creative: Creative): Promise<Creative> {
  if (HAS_SUPABASE) return sb_upsertCreative(creative);
  creative.updatedAt = new Date().toISOString();
  creatives.set(creative.id, creative);
  saveToDisk();
  return creative;
}

export async function deleteCreative(id: string): Promise<boolean> {
  if (HAS_SUPABASE) return sb_deleteCreative(id);
  const ok = creatives.delete(id);
  if (ok) saveToDisk();
  return ok;
}

// ── Proposals (local only – not yet in Supabase) ────────────

export function getProposals(filters?: {
  status?: string;
  client?: string;
  limit?: number;
  offset?: number;
}): { items: Proposal[]; total: number } {
  let results = [...proposals.values()];
  if (filters?.status) {
    results = results.filter((p) => p.status === filters.status);
  }
  if (filters?.client) {
    const q = filters.client.toLowerCase();
    results = results.filter(
      (p) =>
        p.clientCompany.toLowerCase().includes(q) ||
        p.clientEmail.toLowerCase().includes(q)
    );
  }
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = results.length;
  const offset = filters?.offset || 0;
  const limit = filters?.limit || 20;
  return { items: results.slice(offset, offset + limit), total };
}

export function getProposal(id: string): Proposal | undefined {
  return proposals.get(id);
}

export function upsertProposal(proposal: Proposal): Proposal {
  proposal.updatedAt = new Date().toISOString();
  proposals.set(proposal.id, proposal);
  saveToDisk();
  return proposal;
}

// ── Templates (local only) ──────────────────────────────────

export function getTemplates(): Template[] {
  return [...templates.values()].filter((t) => t.isActive);
}

export function getTemplate(id: string): Template | undefined {
  return templates.get(id);
}

export function getDefaultTemplate(): Template | undefined {
  return [...templates.values()].find((t) => t.isDefault && t.isActive);
}

export function upsertTemplate(template: Template): Template {
  template.updatedAt = new Date().toISOString();
  templates.set(template.id, template);
  saveToDisk();
  return template;
}

// ── Networks ────────────────────────────────────────────────

export async function getNetworks(): Promise<Network[]> {
  if (HAS_SUPABASE) return sb_getNetworks();
  return [...networks.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export async function getNetwork(id: string): Promise<Network | undefined> {
  if (HAS_SUPABASE) return sb_getNetwork(id);
  return networks.get(id);
}

export async function upsertNetwork(network: Network): Promise<Network> {
  if (HAS_SUPABASE) return sb_upsertNetwork(network);
  network.updatedAt = new Date().toISOString();
  networks.set(network.id, network);
  saveToDisk();
  return network;
}

export async function deleteNetwork(id: string): Promise<boolean> {
  if (HAS_SUPABASE) return sb_deleteNetwork(id);
  const ok = networks.delete(id);
  if (ok) saveToDisk();
  return ok;
}

// ── Presentation Templates ──────────────────────────────────

export async function getPresentationTemplates(): Promise<
  PresentationTemplate[]
> {
  if (HAS_SUPABASE) return sb_getPresentationTemplates();
  return [...presentationTemplates.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export async function getPresentationTemplate(
  id: string
): Promise<PresentationTemplate | undefined> {
  if (HAS_SUPABASE) return sb_getPresentationTemplate(id);
  return presentationTemplates.get(id);
}

export async function upsertPresentationTemplate(
  t: PresentationTemplate
): Promise<PresentationTemplate> {
  if (HAS_SUPABASE) return sb_upsertPresentationTemplate(t);
  t.updatedAt = new Date().toISOString();
  presentationTemplates.set(t.id, t);
  saveToDisk();
  return t;
}

export async function deletePresentationTemplate(
  id: string
): Promise<boolean> {
  if (HAS_SUPABASE) return sb_deletePresentationTemplate(id);
  const ok = presentationTemplates.delete(id);
  if (ok) saveToDisk();
  return ok;
}

// ── Contacts ────────────────────────────────────────────────

export async function getContacts(filters?: {
  search?: string;
  city?: string;
  industry?: string;
  tags?: string[];
}): Promise<OOHContact[]> {
  if (HAS_SUPABASE) return sb_getContacts(filters);

  let results = [...oohContacts.values()];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    results = results.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q)
    );
  }
  if (filters?.city) {
    const city = filters.city.toLowerCase();
    results = results.filter((c) =>
      c.city?.toLowerCase().includes(city)
    );
  }
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getContact(id: string): Promise<OOHContact | undefined> {
  if (HAS_SUPABASE) return sb_getContact(id);
  return oohContacts.get(id);
}

export async function upsertContact(contact: OOHContact): Promise<OOHContact> {
  if (HAS_SUPABASE) return sb_upsertContact(contact);
  contact.updatedAt = new Date().toISOString();
  oohContacts.set(contact.id, contact);
  saveToDisk();
  return contact;
}

export async function deleteContact(id: string): Promise<boolean> {
  if (HAS_SUPABASE) return sb_deleteContact(id);
  const ok = oohContacts.delete(id);
  if (ok) saveToDisk();
  return ok;
}

// ── Campaigns ───────────────────────────────────────────────

export async function getCampaigns(filters?: {
  status?: string;
}): Promise<OOHCampaign[]> {
  if (HAS_SUPABASE) return sb_getCampaigns(filters);

  let results = [...oohCampaigns.values()];
  if (filters?.status) {
    results = results.filter((c) => c.status === filters.status);
  }
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCampaign(id: string): Promise<OOHCampaign | undefined> {
  if (HAS_SUPABASE) return sb_getCampaign(id);
  return oohCampaigns.get(id);
}

export async function upsertCampaign(campaign: OOHCampaign): Promise<OOHCampaign> {
  if (HAS_SUPABASE) return sb_upsertCampaign(campaign);
  campaign.updatedAt = new Date().toISOString();
  oohCampaigns.set(campaign.id, campaign);
  saveToDisk();
  return campaign;
}

export async function deleteCampaign(id: string): Promise<boolean> {
  if (HAS_SUPABASE) return sb_deleteCampaign(id);
  const ok = oohCampaigns.delete(id);
  if (ok) saveToDisk();
  return ok;
}

// ── Sends ───────────────────────────────────────────────────

export async function getSends(filters?: {
  campaignId?: string;
  contactId?: string;
  status?: string;
}): Promise<OOHSend[]> {
  if (HAS_SUPABASE) return sb_getSends(filters);

  let results = [...oohSends.values()];
  if (filters?.campaignId) {
    results = results.filter((s) => s.campaignId === filters.campaignId);
  }
  if (filters?.contactId) {
    results = results.filter((s) => s.contactId === filters.contactId);
  }
  if (filters?.status) {
    results = results.filter((s) => s.status === filters.status);
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSend(id: string): Promise<OOHSend | undefined> {
  if (HAS_SUPABASE) return sb_getSend(id);
  return oohSends.get(id);
}

export async function upsertSend(send: OOHSend): Promise<OOHSend> {
  if (HAS_SUPABASE) return sb_upsertSend(send);
  send.updatedAt = new Date().toISOString();
  oohSends.set(send.id, send);
  saveToDisk();
  return send;
}

export async function getDueFollowUps(): Promise<OOHSend[]> {
  if (HAS_SUPABASE) return sb_getDueFollowUps();

  const now = new Date().toISOString();
  return [...oohSends.values()]
    .filter((s) => s.status === "sent" && s.nextFollowUpAt && s.nextFollowUpAt <= now)
    .sort((a, b) => (a.nextFollowUpAt || "").localeCompare(b.nextFollowUpAt || ""));
}

// ── Seed (no-op) ────────────────────────────────────────────

export function seedDemoData() {
  if (frames.size > 0) return;
}
