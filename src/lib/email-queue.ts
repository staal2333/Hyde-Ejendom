// ============================================================
// Email Queue – Rate-limited email sending (200/hour default)
// Persisted in Supabase (with in-memory fallback if unconfigured)
// ============================================================

import { sendEmail, type SendEmailResult } from "./email-sender";
import { fetchEjendomById, updateEjendom } from "./hubspot";
import { recordThreadProperty } from "./mail-threads";
import { config } from "./config";
import { logger } from "./logger";
import { supabase, HAS_SUPABASE } from "./supabase";
import { isValidEmail } from "./validation";

// ── Queue types ──────────────────────────────────────────

export interface QueuedEmail {
  id: string;
  propertyId: string;
  to: string;
  subject: string;
  body: string;
  contactName?: string;
  attachments?: { filename: string; mimeType: string; content: string }[];
  status: "queued" | "sending" | "sent" | "failed";
  queuedAt: string;
  sentAt?: string;
  error?: string;
  messageId?: string;
  retries: number;
}

export interface QueueStats {
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  totalProcessed: number;
  rateLimitPerHour: number;
  isProcessing: boolean;
  lastSentAt?: string;
  sentThisHour: number;
}

// ── In-memory fallback (used when Supabase is unavailable) ──

const memQueue: QueuedEmail[] = [];
const memHistory: QueuedEmail[] = [];
const MAX_HISTORY = 500;

// ── Supabase persistence layer ──────────────────────────────

async function dbUpsert(email: QueuedEmail): Promise<void> {
  if (!supabase) return;
  const row = {
    id: email.id,
    property_id: email.propertyId,
    recipient: email.to,
    subject: email.subject,
    body: email.body,
    contact_name: email.contactName || null,
    attachments: email.attachments ? JSON.stringify(email.attachments) : null,
    status: email.status,
    queued_at: email.queuedAt,
    sent_at: email.sentAt || null,
    error: email.error || null,
    message_id: email.messageId || null,
    retries: email.retries,
  };
  const { error } = await supabase.from("email_queue").upsert(row, { onConflict: "id" });
  if (error) logger.warn(`email_queue upsert failed: ${error.message}`, { service: "email-queue" });
}

async function dbFetchPending(): Promise<QueuedEmail[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("email_queue")
    .select("*")
    .in("status", ["queued", "sending"])
    .order("queued_at", { ascending: true })
    .limit(200);
  if (error) {
    logger.warn(`email_queue fetch failed: ${error.message}`, { service: "email-queue" });
    return [];
  }
  return (data || []).map(mapRow);
}

async function dbFetchRecent(limit = 50): Promise<QueuedEmail[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("email_queue")
    .select("*")
    .in("status", ["sent", "failed"])
    .order("queued_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []).map(mapRow);
}

async function dbCountByStatus(): Promise<{ queued: number; sending: number; sent: number; failed: number }> {
  if (!supabase) {
    return {
      queued: memQueue.filter((q) => q.status === "queued").length,
      sending: memQueue.filter((q) => q.status === "sending").length,
      sent: memHistory.filter((q) => q.status === "sent").length,
      failed: memHistory.filter((q) => q.status === "failed").length,
    };
  }
  const counts = { queued: 0, sending: 0, sent: 0, failed: 0 };
  for (const status of ["queued", "sending", "sent", "failed"] as const) {
    const { count, error } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", status);
    if (!error && count != null) counts[status] = count;
  }
  return counts;
}

function mapRow(row: Record<string, unknown>): QueuedEmail {
  return {
    id: String(row.id),
    propertyId: String(row.property_id),
    to: String(row.recipient),
    subject: String(row.subject),
    body: String(row.body),
    contactName: row.contact_name ? String(row.contact_name) : undefined,
    attachments: row.attachments ? JSON.parse(String(row.attachments)) : undefined,
    status: String(row.status) as QueuedEmail["status"],
    queuedAt: String(row.queued_at),
    sentAt: row.sent_at ? String(row.sent_at) : undefined,
    error: row.error ? String(row.error) : undefined,
    messageId: row.message_id ? String(row.message_id) : undefined,
    retries: Number(row.retries) || 0,
  };
}

// ── Processing state (always in-memory; only one instance runs) ──

let isProcessing = false;
let processTimeout: ReturnType<typeof setTimeout> | null = null;
let hourlyCounter = 0;
let hourlyResetAt = Date.now() + 3_600_000;

function resetHourlyCounterIfNeeded() {
  if (Date.now() >= hourlyResetAt) {
    hourlyCounter = 0;
    hourlyResetAt = Date.now() + 3_600_000;
  }
}

// ── Boot: recover pending items from DB ─────────────────────

let booted = false;
async function ensureBooted(): Promise<void> {
  if (booted) return;
  booted = true;
  if (!HAS_SUPABASE) return;
  const pending = await dbFetchPending();
  if (pending.length > 0) {
    for (const item of pending) {
      if (item.status === "sending") item.status = "queued";
      if (!HAS_SUPABASE) memQueue.push(item);
    }
    logger.info(`Recovered ${pending.length} pending emails from database`, { service: "email-queue" });
    startProcessing();
  }
}

// ── Public API ───────────────────────────────────────────

export async function enqueueEmail(
  propertyId: string,
  options?: {
    attachments?: { filename: string; mimeType: string; content: string }[];
    subject?: string;
    body?: string;
    to?: string;
  },
): Promise<{
  success: boolean;
  position?: number;
  error?: string;
  queueId?: string;
}> {
  await ensureBooted();
  try {
    const property = await fetchEjendomById(propertyId);

    const recipientEmail = (options?.to?.trim() || property.contactEmail)?.trim();
    if (!recipientEmail) {
      return { success: false, error: "Ingen kontakt-email på ejendommen – indtast modtager i redigeringen" };
    }
    if (!isValidEmail(recipientEmail)) {
      return { success: false, error: `Ugyldig email-format: ${recipientEmail}` };
    }
    if (!property.emailDraftSubject || !property.emailDraftBody) {
      return { success: false, error: "Intet email-udkast på ejendommen" };
    }
    if (property.outreachStatus !== "KLAR_TIL_UDSENDELSE") {
      return { success: false, error: `Forkert status: ${property.outreachStatus} (skal være KLAR_TIL_UDSENDELSE)` };
    }

    const existing = HAS_SUPABASE
      ? await (async () => {
          const { data } = await supabase!
            .from("email_queue")
            .select("id")
            .eq("property_id", propertyId)
            .eq("status", "queued")
            .limit(1);
          return data?.[0];
        })()
      : memQueue.find((q) => q.propertyId === propertyId && q.status === "queued");

    if (existing) {
      return { success: true, position: 1, queueId: String(existing.id) };
    }

    const subject = (options?.subject?.trim() || property.emailDraftSubject) ?? "";
    const body = (options?.body != null ? options.body : property.emailDraftBody) ?? "";
    const to = (options?.to?.trim() || property.contactEmail) ?? "";

    const queuedEmail: QueuedEmail = {
      id: `eq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      propertyId,
      to,
      subject,
      body,
      contactName: property.contactPerson || undefined,
      attachments: options?.attachments,
      status: "queued",
      queuedAt: new Date().toISOString(),
      retries: 0,
    };

    if (HAS_SUPABASE) {
      await dbUpsert(queuedEmail);
    } else {
      memQueue.push(queuedEmail);
    }

    logger.info(`Email queued for ${recipientEmail} (property ${propertyId})`, {
      service: "email-queue",
      propertyAddress: property.address,
    });

    startProcessing();

    return { success: true, position: 1, queueId: queuedEmail.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

export async function enqueueBatch(propertyIds: string[]): Promise<{
  enqueued: number;
  failed: number;
  errors: { propertyId: string; error: string }[];
}> {
  let enqueued = 0;
  let failed = 0;
  const errors: { propertyId: string; error: string }[] = [];

  for (const id of propertyIds) {
    const result = await enqueueEmail(id);
    if (result.success) enqueued++;
    else {
      failed++;
      errors.push({ propertyId: id, error: result.error || "Unknown error" });
    }
  }

  return { enqueued, failed, errors };
}

export async function getQueueStats(): Promise<QueueStats> {
  await ensureBooted();
  resetHourlyCounterIfNeeded();

  const counts = await dbCountByStatus();
  const lastSent = HAS_SUPABASE
    ? await (async () => {
        const { data } = await supabase!
          .from("email_queue")
          .select("sent_at")
          .eq("status", "sent")
          .order("sent_at", { ascending: false })
          .limit(1);
        return data?.[0]?.sent_at as string | undefined;
      })()
    : memHistory.filter((q) => q.status === "sent").at(-1)?.sentAt;

  return {
    ...counts,
    totalProcessed: counts.sent + counts.failed,
    rateLimitPerHour: config.emailRateLimitPerHour,
    isProcessing,
    lastSentAt: lastSent,
    sentThisHour: hourlyCounter,
  };
}

export async function getQueueItems(): Promise<QueuedEmail[]> {
  await ensureBooted();
  if (HAS_SUPABASE) {
    const pending = await dbFetchPending();
    const recent = await dbFetchRecent(50);
    return [...pending, ...recent].sort(
      (a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime(),
    );
  }
  return [...memQueue, ...memHistory.slice(-50)].sort(
    (a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime(),
  );
}

export function cancelQueuedEmail(queueId: string): boolean {
  if (HAS_SUPABASE) {
    supabase!
      .from("email_queue")
      .delete()
      .eq("id", queueId)
      .eq("status", "queued")
      .then(({ error }) => {
        if (error) logger.warn(`email_queue cancel failed: ${error.message}`, { service: "email-queue" });
      });
    return true;
  }
  const idx = memQueue.findIndex((q) => q.id === queueId && q.status === "queued");
  if (idx >= 0) {
    memQueue.splice(idx, 1);
    return true;
  }
  return false;
}

// ── Background processing ────────────────────────────────

function startProcessing() {
  if (isProcessing) return;
  isProcessing = true;
  scheduleNext();
}

function scheduleNext() {
  if (processTimeout) clearTimeout(processTimeout);

  resetHourlyCounterIfNeeded();

  const rateLimit = config.emailRateLimitPerHour;
  const delayMs = Math.ceil(3_600_000 / rateLimit);

  if (hourlyCounter >= rateLimit) {
    const waitMs = hourlyResetAt - Date.now() + 1000;
    logger.info(`Rate limit reached (${hourlyCounter}/${rateLimit}). Waiting ${Math.round(waitMs / 1000)}s.`, {
      service: "email-queue",
    });
    processTimeout = setTimeout(() => processNext(), waitMs);
    return;
  }

  processTimeout = setTimeout(() => processNext(), delayMs);
}

async function getNextPending(): Promise<QueuedEmail | undefined> {
  if (HAS_SUPABASE) {
    const { data } = await supabase!
      .from("email_queue")
      .select("*")
      .eq("status", "queued")
      .order("queued_at", { ascending: true })
      .limit(1);
    return data?.[0] ? mapRow(data[0]) : undefined;
  }
  return memQueue.find((q) => q.status === "queued");
}

const MAX_RETRIES = 3;
const BACKOFF_MINUTES = [1, 5, 15];

async function processNext() {
  const item = await getNextPending();
  if (!item) {
    isProcessing = false;
    return;
  }

  item.status = "sending";
  await persist(item);

  try {
    const result: SendEmailResult = await sendEmail({
      to: item.to,
      subject: item.subject,
      body: item.body,
      contactName: item.contactName,
      propertyId: item.propertyId,
      attachments: item.attachments,
    });

    if (result.success) {
      item.status = "sent";
      item.sentAt = new Date().toISOString();
      item.messageId = result.messageId;
      hourlyCounter++;

      if (result.threadId) {
        recordThreadProperty(result.threadId, item.propertyId);
      }

      try {
        await updateEjendom(item.propertyId, { outreach_status: "FOERSTE_MAIL_SENDT" });
      } catch (e) {
        logger.warn(`Failed to update HubSpot status for ${item.propertyId}: ${e}`, { service: "email-queue" });
      }

      await persist(item);
    } else {
      if (item.retries < MAX_RETRIES) {
        item.retries++;
        item.status = "queued";
        item.error = result.error;
        logger.warn(`Email send failed (attempt ${item.retries}/${MAX_RETRIES}), retrying in ${BACKOFF_MINUTES[item.retries - 1]}m: ${result.error}`, {
          service: "email-queue",
        });
        await persist(item);
        const backoffMs = BACKOFF_MINUTES[item.retries - 1] * 60_000;
        processTimeout = setTimeout(() => processNext(), backoffMs);
        return;
      }
      item.status = "failed";
      item.error = result.error;
      await persist(item);

      try {
        await updateEjendom(item.propertyId, {
          outreach_status: "FEJL",
          research_summary: `Email-afsendelse fejlede: ${result.error}`,
        });
      } catch { /* ignore */ }
    }
  } catch (error) {
    item.status = "failed";
    item.error = error instanceof Error ? error.message : String(error);
    await persist(item);
  }

  scheduleNext();
}

async function persist(item: QueuedEmail): Promise<void> {
  if (HAS_SUPABASE) {
    await dbUpsert(item);
  } else {
    if (item.status === "sent" || item.status === "failed") {
      const idx = memQueue.indexOf(item);
      if (idx >= 0) memQueue.splice(idx, 1);
      memHistory.push(item);
      if (memHistory.length > MAX_HISTORY) memHistory.shift();
    }
  }
}
