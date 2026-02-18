// ============================================================
// Email Queue – Rate-limited email sending (200/hour default)
// In-memory FIFO queue with background processing
// ============================================================

import { sendEmail, type SendEmailResult } from "./email-sender";
import { fetchEjendomById, updateEjendom } from "./hubspot";
import { recordThreadProperty } from "./mail-threads";
import { config } from "./config";
import { logger } from "./logger";

// ── Queue types ──────────────────────────────────────────

export interface QueuedEmail {
  id: string;
  propertyId: string;
  to: string;
  subject: string;
  body: string;
  contactName?: string;
  /** Optional PDF attachment (base64-encoded content) */
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

// ── Queue state ──────────────────────────────────────────

const queue: QueuedEmail[] = [];
const history: QueuedEmail[] = []; // Completed/failed emails
const MAX_HISTORY = 500;
let isProcessing = false;
let processTimeout: ReturnType<typeof setTimeout> | null = null;

// Track sends this hour for rate limiting
let hourlyCounter = 0;
let hourlyResetAt = Date.now() + 3600_000;

function resetHourlyCounterIfNeeded() {
  if (Date.now() >= hourlyResetAt) {
    hourlyCounter = 0;
    hourlyResetAt = Date.now() + 3600_000;
  }
}

// ── Public API ───────────────────────────────────────────

/**
 * Enqueue an email for rate-limited sending.
 * Optionally attach files (e.g. OOH proposal PDFs).
 * Returns the queue position.
 */
export async function enqueueEmail(
  propertyId: string,
  options?: {
    attachments?: { filename: string; mimeType: string; content: string }[];
    /** Override draft subject (e.g. from user edit in UI) */
    subject?: string;
    /** Override draft body (e.g. from user edit in UI) */
    body?: string;
    /** Override recipient email (e.g. from user edit in UI); mail is sent to this address */
    to?: string;
  }
): Promise<{
  success: boolean;
  position?: number;
  error?: string;
  queueId?: string;
}> {
  try {
    // Fetch property to get email draft
    const property = await fetchEjendomById(propertyId);

    const recipientEmail = (options?.to?.trim() || property.contactEmail)?.trim();
    if (!recipientEmail) {
      return { success: false, error: "Ingen kontakt-email på ejendommen – indtast modtager i redigeringen" };
    }
    if (!property.emailDraftSubject || !property.emailDraftBody) {
      return { success: false, error: "Intet email-udkast på ejendommen" };
    }
    if (property.outreachStatus !== "KLAR_TIL_UDSENDELSE") {
      return {
        success: false,
        error: `Forkert status: ${property.outreachStatus} (skal være KLAR_TIL_UDSENDELSE)`,
      };
    }

    // Check if already in queue
    const existing = queue.find(q => q.propertyId === propertyId && q.status === "queued");
    if (existing) {
      const pos = queue.filter(q => q.status === "queued").indexOf(existing) + 1;
      return { success: true, position: pos, queueId: existing.id };
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

    queue.push(queuedEmail);

    logger.info(`Email queued for ${property.contactEmail} (property ${propertyId})`, {
      service: "email-queue",
      propertyAddress: property.address,
    });

    // Start processing if not already running
    startProcessing();

    const position = queue.filter(q => q.status === "queued").length;
    return { success: true, position, queueId: queuedEmail.id };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, error: msg };
  }
}

/**
 * Enqueue multiple emails at once.
 */
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
    if (result.success) {
      enqueued++;
    } else {
      failed++;
      errors.push({ propertyId: id, error: result.error || "Unknown error" });
    }
  }

  return { enqueued, failed, errors };
}

/**
 * Get current queue stats.
 */
export function getQueueStats(): QueueStats {
  resetHourlyCounterIfNeeded();

  return {
    queued: queue.filter(q => q.status === "queued").length,
    sending: queue.filter(q => q.status === "sending").length,
    sent: history.filter(q => q.status === "sent").length,
    failed: history.filter(q => q.status === "failed").length,
    totalProcessed: history.length,
    rateLimitPerHour: config.emailRateLimitPerHour,
    isProcessing,
    lastSentAt: history.filter(q => q.status === "sent").at(-1)?.sentAt,
    sentThisHour: hourlyCounter,
  };
}

/**
 * Get queue items (for UI display).
 */
export function getQueueItems(): QueuedEmail[] {
  return [...queue, ...history.slice(-50)].sort(
    (a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime()
  );
}

/**
 * Remove a queued email (cancel before sending).
 */
export function cancelQueuedEmail(queueId: string): boolean {
  const idx = queue.findIndex(q => q.id === queueId && q.status === "queued");
  if (idx >= 0) {
    queue.splice(idx, 1);
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

  const pending = queue.filter(q => q.status === "queued");
  if (pending.length === 0) {
    isProcessing = false;
    return;
  }

  resetHourlyCounterIfNeeded();

  // Calculate delay based on rate limit
  const rateLimit = config.emailRateLimitPerHour;
  const delayMs = Math.ceil(3600_000 / rateLimit); // e.g., 200/hr = 18000ms

  // If we've hit the hourly limit, wait until reset
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

async function processNext() {
  const item = queue.find(q => q.status === "queued");
  if (!item) {
    isProcessing = false;
    return;
  }

  item.status = "sending";

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

      // Update HubSpot: mark as sent
      try {
        await updateEjendom(item.propertyId, {
          outreach_status: "FOERSTE_MAIL_SENDT",
        });
      } catch (e) {
        logger.warn(`Failed to update HubSpot status for ${item.propertyId}: ${e}`, {
          service: "email-queue",
        });
      }

      // Move to history
      moveToHistory(item);
    } else {
      // Retry once
      if (item.retries < 1) {
        item.retries++;
        item.status = "queued";
        item.error = result.error;
        logger.warn(`Email send failed, retrying: ${result.error}`, { service: "email-queue" });
      } else {
        item.status = "failed";
        item.error = result.error;
        moveToHistory(item);

        // Mark property as error
        try {
          await updateEjendom(item.propertyId, {
            outreach_status: "FEJL",
            research_summary: `Email-afsendelse fejlede: ${result.error}`,
          });
        } catch { /* ignore */ }
      }
    }
  } catch (error) {
    item.status = "failed";
    item.error = error instanceof Error ? error.message : String(error);
    moveToHistory(item);
  }

  // Schedule next
  scheduleNext();
}

function moveToHistory(item: QueuedEmail) {
  const idx = queue.indexOf(item);
  if (idx >= 0) queue.splice(idx, 1);
  history.push(item);
  if (history.length > MAX_HISTORY) history.shift();
}
