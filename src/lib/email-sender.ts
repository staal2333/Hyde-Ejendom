// ============================================================
// Email Sender – Gmail API with OAuth2 (multi-account)
// Supports multiple Gmail accounts via shared OAuth app
// Includes: click tracking link wrapping, rate limiting, retries
// ============================================================

import { google } from "googleapis";
import { config } from "./config";
import { logger } from "./logger";

// ── Rate Limiter (token bucket, in-memory) ──────────────────
let _rateBucketTokens = 0;
let _rateBucketLastReset = Date.now();

function checkRateLimit(): boolean {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  if (now - _rateBucketLastReset > hourMs) {
    _rateBucketTokens = 0;
    _rateBucketLastReset = now;
  }
  if (_rateBucketTokens >= config.emailRateLimitPerHour) {
    return false;
  }
  _rateBucketTokens++;
  return true;
}

// ── Click Tracking ──────────────────────────────────────────

/**
 * Wraps all <a href="..."> links in the HTML body to route through
 * the click tracking endpoint. Skips mailto: and anchor (#) links.
 */
export function wrapLinksWithTracking(
  html: string,
  sendId: string,
  baseUrl: string
): string {
  return html.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
    (match, before, url, after) => {
      // Skip mailto, tel, anchor links, and already-tracked links
      if (
        url.startsWith("mailto:") ||
        url.startsWith("tel:") ||
        url.startsWith("#") ||
        url.includes("/api/ooh/track/")
      ) {
        return match;
      }
      const trackedUrl = `${baseUrl}/api/ooh/track/click?sendId=${encodeURIComponent(sendId)}&url=${encodeURIComponent(url)}`;
      return `<a ${before}href="${trackedUrl}"${after}>`;
    }
  );
}

// ── Multi-account Gmail client pool ─────────────────────────
type GmailApi = ReturnType<typeof google.gmail>;

export interface GmailAccount {
  email: string;
  name: string;
  client: GmailApi;
}

const _gmailClients = new Map<string, GmailApi>();

function buildGmailClient(refreshToken: string): GmailApi {
  const clientId = config.gmail.clientId();
  const clientSecret = config.gmail.clientSecret();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail API not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and refresh tokens."
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    "https://developers.google.com/oauthplayground"
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: oauth2Client });
}

/** Get the primary (first configured) Gmail client — backward compatible. */
function getGmailClient(): GmailApi {
  const key = "__primary__";
  if (!_gmailClients.has(key)) {
    const refreshToken = config.gmail.refreshToken();
    _gmailClients.set(key, buildGmailClient(refreshToken));
  }
  return _gmailClients.get(key)!;
}

/** Get a Gmail client for a specific account email. */
function getGmailClientForAccount(accountEmail: string): GmailApi {
  if (_gmailClients.has(accountEmail)) return _gmailClients.get(accountEmail)!;

  const account = config.gmailAccounts.find(
    (a) => a.email.toLowerCase() === accountEmail.toLowerCase()
  );
  if (!account) {
    throw new Error(`No Gmail account configured for ${accountEmail}`);
  }
  const token = account.refreshToken();
  if (!token) throw new Error(`No refresh token for ${accountEmail}`);

  const client = buildGmailClient(token);
  _gmailClients.set(accountEmail, client);
  return client;
}

/** Get all configured Gmail accounts with their clients. */
export function getConfiguredAccounts(): GmailAccount[] {
  return config.gmailAccounts
    .filter((a) => a.email && a.refreshToken())
    .map((a) => ({
      email: a.email,
      name: a.name,
      client: getGmailClientForAccount(a.email),
    }));
}

export interface EmailAttachment {
  filename: string;
  mimeType: string;
  /** base64-encoded content */
  content: string;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  propertyId: string;
  contactName?: string;
  attachments?: EmailAttachment[];
  trackingPixelUrl?: string;
  sendId?: string;
  trackingBaseUrl?: string;
  /** Send from a specific account (email address). Uses primary if omitted. */
  fromAccount?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

/**
 * Send an email via Gmail API.
 * Includes: rate limiting, click tracking link wrapping, and retries.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  // ── Rate limit check ──────────────────────────────────
  if (!checkRateLimit()) {
    const msg = `Rate limit exceeded (${config.emailRateLimitPerHour}/hour). Try again later.`;
    logger.error(msg, { service: "email", propertyAddress: opts.propertyId, metadata: { to: opts.to } });
    return { success: false, error: msg };
  }

  // ── Retry wrapper (max 3 attempts, exponential backoff) ──
  const MAX_RETRIES = 3;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await _sendEmailOnce(opts);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const isTransient =
        lastError.includes("429") ||
        lastError.includes("ECONNRESET") ||
        lastError.includes("ETIMEDOUT") ||
        lastError.includes("socket hang up") ||
        lastError.includes("network");

      if (!isTransient || attempt === MAX_RETRIES) {
        logger.error(`Email send failed to ${opts.to} (attempt ${attempt}/${MAX_RETRIES}): ${lastError}`, {
          service: "email",
          propertyAddress: opts.propertyId,
          metadata: { to: opts.to, error: lastError, attempt },
        });
        return { success: false, error: lastError };
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      logger.info(`Email send to ${opts.to} failed (attempt ${attempt}), retrying in ${delay}ms...`, {
        service: "email",
        propertyAddress: opts.propertyId,
        metadata: { to: opts.to, attempt },
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return { success: false, error: lastError };
}

/** Internal: single attempt to send an email */
async function _sendEmailOnce(opts: SendEmailOptions): Promise<SendEmailResult> {
  const gmail = opts.fromAccount
    ? getGmailClientForAccount(opts.fromAccount)
    : getGmailClient();

  const account = opts.fromAccount
    ? config.gmailAccounts.find((a) => a.email.toLowerCase() === opts.fromAccount!.toLowerCase())
    : null;

  const fromName = account?.name || config.gmail.fromName;
  const fromEmail = account?.email || config.gmail.fromEmail;

  // Ensure body is always a string (plain text and HTML both need it)
  const bodyText = typeof opts.body === "string" && opts.body.trim() ? opts.body : opts.body || "";

  // Build HTML body (simple: preserve line breaks)
  let htmlBody = bodyText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>\n");

  // Wrap links with click tracking if sendId is available
  if (opts.sendId && opts.trackingBaseUrl) {
    htmlBody = wrapLinksWithTracking(htmlBody, opts.sendId, opts.trackingBaseUrl);
  }

  // Add tracking pixel if specified
  if (opts.trackingPixelUrl) {
    htmlBody += `<img src="${opts.trackingPixelUrl}" width="1" height="1" style="display:none" alt="" />`;
  }

  const hasAttachments = opts.attachments && opts.attachments.length > 0;

  // Build RFC 2822 MIME message
  const mixedBoundary = `mixed_${Date.now()}`;
  const altBoundary = `alt_${Date.now()}`;

  const messageParts: string[] = [
    `From: ${fromName} <${fromEmail}>`,
    `To: ${opts.contactName ? `${opts.contactName} <${opts.to}>` : opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, "utf-8").toString("base64")}?=`,
    opts.replyTo ? `Reply-To: ${opts.replyTo}` : "",
    `MIME-Version: 1.0`,
    `X-EjendomAI-PropertyId: ${opts.propertyId}`,
  ];

  if (hasAttachments) {
    messageParts.push(
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      "",
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      "", // blank line before first alternative part (required by MIME)
    );
  } else {
    messageParts.push(
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    );
  }

  // Text part (plain text so clients that prefer text see the body)
  messageParts.push(
    "",
    `--${altBoundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    "",
    Buffer.from(bodyText, "utf-8").toString("base64"),
  );

  // HTML part
  messageParts.push(
    "",
    `--${altBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    "",
    Buffer.from(
      `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${htmlBody}</div>`,
      "utf-8"
    ).toString("base64"),
    "",
    `--${altBoundary}--`,
  );

  // Attachments
  if (hasAttachments) {
    for (const att of opts.attachments!) {
      messageParts.push(
        "",
        `--${mixedBoundary}`,
        `Content-Type: ${att.mimeType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        `Content-Transfer-Encoding: base64`,
        "",
        att.content,
      );
    }
    messageParts.push("", `--${mixedBoundary}--`);
  }

  const rawMessage = messageParts.filter(Boolean).join("\r\n");

  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage },
  });

  const messageId = response.data.id || undefined;
  const threadId = response.data.threadId || undefined;

  logger.info(`Email sent to ${opts.to} for property ${opts.propertyId}`, {
    service: "email",
    propertyAddress: opts.propertyId,
    metadata: { messageId, threadId, to: opts.to, subject: opts.subject },
  });

  return { success: true, messageId, threadId };
}

// ── Inbox & threads ─────────────────────────────────────────

export interface MsgAttachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  messageId: string;
  contentId?: string;
}

export interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyPlain: string;
  bodyHtml: string;
  snippet: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string;
  attachments: MsgAttachment[];
}

export interface MailThread {
  id: string;
  subject: string;
  messages: ThreadMessage[];
}

export interface InboxThread {
  id: string;
  subject: string;
  snippet: string;
  from: string;
  date: string;
  isUnread: boolean;
  lastIsFromUs: boolean;
  isOutboundOnly: boolean;
  account: string;
}

async function _fetchThreadMeta(gmail: GmailApi, threadId: string, accountEmail: string): Promise<{
  subject: string; snippet: string; from: string; date: string; isUnread: boolean; lastIsFromUs: boolean; isOutboundOnly: boolean;
} | null> {
  try {
    const res = await gmail.users.threads.get({
      userId: "me", id: threadId, format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const thread = res.data;
    if (!thread?.messages?.length) return null;

    const lastMsg = thread.messages[thread.messages.length - 1];
    const lastHeaders = (lastMsg.payload?.headers || []).reduce(
      (acc: Record<string, string>, h) => { if (h.name && h.value) acc[h.name.toLowerCase()] = h.value; return acc; }, {}
    );
    const labels = lastMsg.labelIds || [];

    // Find the "other party" — first message NOT sent by us
    const acLocal = accountEmail.split("@")[0].toLowerCase();
    let contactFrom = "";
    for (const msg of thread.messages) {
      const fromH = (msg.payload?.headers || []).find(h => h.name?.toLowerCase() === "from")?.value || "";
      if (fromH && !fromH.toLowerCase().includes(acLocal)) {
        contactFrom = fromH;
        break;
      }
    }

    const lastFrom = (lastHeaders.from || "").toLowerCase();
    const lastIsFromUs = !!acLocal && lastFrom.includes(acLocal);

    const isOutboundOnly = !contactFrom;

    return {
      subject: lastHeaders.subject || thread.messages[0].payload?.headers?.find(h => h.name?.toLowerCase() === "subject")?.value || "",
      snippet: lastMsg.snippet || "",
      from: contactFrom || lastHeaders.from || "",
      date: lastHeaders.date || "",
      isUnread: labels.includes("UNREAD"),
      lastIsFromUs,
      isOutboundOnly,
    };
  } catch { return null; }
}

/** List threads from all configured accounts with full metadata.
 *  @param label – "INBOX" (default) or "SENT"
 */
export async function listInboxThreads(maxResults = 300, label: "INBOX" | "SENT" = "INBOX"): Promise<InboxThread[]> {
  const accounts = getConfiguredAccounts();

  async function fetchAccount(gmail: GmailApi, accountEmail: string, limit: number): Promise<InboxThread[]> {
    const threadIds: string[] = [];
    let pageToken: string | undefined;

    while (threadIds.length < limit) {
      const batch = Math.min(100, limit - threadIds.length);
      const res = await gmail.users.threads.list({
        userId: "me", labelIds: [label], maxResults: batch,
        ...(pageToken ? { pageToken } : {}),
      });
      for (const t of res.data.threads || []) {
        if (t.id) threadIds.push(t.id);
      }
      pageToken = res.data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }

    const results: InboxThread[] = [];
    for (let start = 0; start < threadIds.length; start += 25) {
      const chunk = threadIds.slice(start, start + 25);
      const metas = await Promise.all(chunk.map(id => _fetchThreadMeta(gmail, id, accountEmail)));
      for (let i = 0; i < chunk.length; i++) {
        const m = metas[i];
        if (m) results.push({ id: chunk[i], account: accountEmail, ...m });
      }
    }

    if (label === "SENT") {
      return results;
    }

    // For inbox: filter out outbound-only threads (no incoming messages)
    return results.filter(t => !t.isOutboundOnly);
  }

  if (accounts.length === 0) {
    const gmail = getGmailClient();
    return fetchAccount(gmail, "", maxResults);
  }

  const perAccount = Math.max(10, Math.ceil(maxResults / accounts.length));
  const all: InboxThread[] = [];
  const errors: string[] = [];

  await Promise.allSettled(
    accounts.map(async (acc) => {
      try {
        const threads = await fetchAccount(acc.client, acc.email, perAccount);
        all.push(...threads);
      } catch (e) {
        const msg = `${acc.email}: ${e instanceof Error ? e.message : String(e)}`;
        logger.warn(`[gmail] Inbox fetch failed — ${msg}`);
        errors.push(msg);
      }
    })
  );

  if (all.length === 0 && errors.length > 0) {
    throw new Error(`Gmail fetch failed for all accounts: ${errors.join("; ")}`);
  }

  // Sort newest first
  all.sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    return db - da;
  });

  return all.slice(0, maxResults);
}

/** Search Gmail threads by email address across all configured accounts. */
export async function searchThreadsByEmail(email: string, maxResults = 15): Promise<MailThread[]> {
  const accounts = getConfiguredAccounts();

  if (accounts.length === 0) {
    return _searchThreadsSingleAccount(getGmailClient(), email, maxResults);
  }

  const perAccount = Math.max(5, Math.ceil(maxResults / accounts.length));
  const all: MailThread[] = [];
  const seenSubjects = new Set<string>();

  await Promise.allSettled(
    accounts.map(async (acc) => {
      try {
        const threads = await _searchThreadsSingleAccount(acc.client, email, perAccount);
        for (const t of threads) {
          const key = `${t.subject}__${t.messages[0]?.date || ""}`;
          if (!seenSubjects.has(key)) {
            seenSubjects.add(key);
            all.push({ ...t, account: acc.email } as MailThread & { account: string });
          }
        }
      } catch (e) {
        logger.warn(`[gmail] Thread search failed for ${acc.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    })
  );

  return all.slice(0, maxResults);
}

async function _searchThreadsSingleAccount(gmail: GmailApi, email: string, maxResults: number): Promise<MailThread[]> {
  const res = await gmail.users.threads.list({
    userId: "me",
    q: `to:${email} OR from:${email}`,
    maxResults,
  });
  const threadIds = (res.data.threads || []).map((t) => t.id!).filter(Boolean);
  const results: MailThread[] = [];
  for (const tid of threadIds.slice(0, maxResults)) {
    const thread = await _getThreadFromClient(gmail, tid);
    if (thread) results.push(thread);
  }
  return results;
}

/** Get full thread with decoded messages (for reply draft and In-Reply-To). */
export async function getThreadWithMessages(threadId: string, accountEmail?: string): Promise<MailThread | null> {
  const gmail = accountEmail ? getGmailClientForAccount(accountEmail) : getGmailClient();
  return _getThreadFromClient(gmail, threadId);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _walkParts(parts: any[], msgId: string): { bodyPlain: string; bodyHtml: string; attachments: MsgAttachment[] } {
  let bodyPlain = "";
  let bodyHtml = "";
  const attachments: MsgAttachment[] = [];

  for (const part of parts) {
    const mime: string = part.mimeType || "";
    const contentId = (part.headers || []).find((h: { name: string }) => h.name?.toLowerCase() === "content-id")?.value?.replace(/[<>]/g, "");

    if (mime === "text/plain" && part.body?.data && !bodyPlain) {
      bodyPlain = Buffer.from(part.body.data, "base64").toString("utf-8");
    } else if (mime === "text/html" && part.body?.data && !bodyHtml) {
      bodyHtml = Buffer.from(part.body.data, "base64").toString("utf-8");
    } else if (part.body?.attachmentId && part.filename) {
      attachments.push({
        filename: part.filename,
        mimeType: mime,
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
        messageId: msgId,
        contentId: contentId || undefined,
      });
    } else if (part.body?.attachmentId && contentId && mime.startsWith("image/")) {
      attachments.push({
        filename: part.filename || contentId,
        mimeType: mime,
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
        messageId: msgId,
        contentId,
      });
    }

    if (part.parts?.length) {
      const nested = _walkParts(part.parts, msgId);
      if (!bodyPlain && nested.bodyPlain) bodyPlain = nested.bodyPlain;
      if (!bodyHtml && nested.bodyHtml) bodyHtml = nested.bodyHtml;
      attachments.push(...nested.attachments);
    }
  }
  return { bodyPlain, bodyHtml, attachments };
}

async function _resolveInlineImages(gmail: GmailApi, messageId: string, html: string, attachments: MsgAttachment[]): Promise<string> {
  const inlineParts = attachments.filter(a => a.contentId && a.mimeType.startsWith("image/"));
  if (!inlineParts.length || !html) return html;

  const resolved = await Promise.all(
    inlineParts.map(async (att) => {
      try {
        const res = await gmail.users.messages.attachments.get({
          userId: "me", messageId, id: att.attachmentId,
        });
        const b64 = (res.data.data || "").replace(/-/g, "+").replace(/_/g, "/");
        return { cid: att.contentId!, dataUrl: `data:${att.mimeType};base64,${b64}` };
      } catch {
        return null;
      }
    })
  );

  let result = html;
  for (const r of resolved) {
    if (r) {
      result = result.replace(new RegExp(`cid:${r.cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), r.dataUrl);
    }
  }
  return result;
}

async function _getThreadFromClient(gmail: GmailApi, threadId: string): Promise<MailThread | null> {
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "full",
  });
  const thread = res.data;
  if (!thread?.messages?.length) return null;

  const messages: ThreadMessage[] = [];
  for (const msg of thread.messages!) {
    const payload = msg.payload!;
    const headers = (payload.headers || []).reduce(
      (acc: Record<string, string>, h) => {
        if (h.name && h.value) acc[h.name.toLowerCase()] = h.value;
        return acc;
      },
      {}
    );

    let bodyPlain = "";
    let bodyHtml = "";
    let attachments: MsgAttachment[] = [];

    if (payload.body?.data) {
      bodyPlain = Buffer.from(payload.body.data, "base64").toString("utf-8");
    }

    if (payload.parts?.length) {
      const walked = _walkParts(payload.parts, msg.id!);
      if (!bodyPlain && walked.bodyPlain) bodyPlain = walked.bodyPlain;
      if (!bodyHtml && walked.bodyHtml) bodyHtml = walked.bodyHtml;
      attachments = walked.attachments;
    }

    if (bodyHtml && attachments.some(a => a.contentId)) {
      bodyHtml = await _resolveInlineImages(gmail, msg.id!, bodyHtml, attachments);
    }

    const visibleAttachments = attachments.filter(a => !a.contentId);

    messages.push({
      id: msg.id!,
      from: headers.from || "",
      to: headers.to || "",
      subject: headers.subject || "",
      date: headers.date || "",
      bodyPlain,
      bodyHtml,
      snippet: msg.snippet || "",
      messageId: headers["message-id"],
      inReplyTo: headers["in-reply-to"],
      references: headers.references,
      attachments: visibleAttachments,
    });
  }
  const firstSubject = messages[0]?.subject || "";
  return { id: threadId, subject: firstSubject, messages };
}

/** Fetch raw attachment data (returns base64 string). */
export async function getAttachmentData(
  messageId: string,
  attachmentId: string,
  accountEmail?: string
): Promise<{ data: string; size: number } | null> {
  const gmail = accountEmail ? getGmailClientForAccount(accountEmail) : getGmailClient();
  try {
    const res = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const b64 = (res.data.data || "").replace(/-/g, "+").replace(/_/g, "/");
    return { data: b64, size: res.data.size || 0 };
  } catch {
    return null;
  }
}

/**
 * Send a reply in an existing thread (sets In-Reply-To, References, threadId).
 */
export interface SendReplyOptions {
  threadId: string;
  to: string;
  subject: string;
  body: string;
  propertyId: string;
  contactName?: string;
  /** Reply from a specific account (email address). Uses primary if omitted. */
  fromAccount?: string;
}

export async function sendReply(opts: SendReplyOptions): Promise<SendEmailResult> {
  if (!checkRateLimit()) {
    const msg = `Rate limit exceeded (${config.emailRateLimitPerHour}/hour). Try again later.`;
    logger.error(msg, { service: "email", propertyAddress: opts.propertyId });
    return { success: false, error: msg };
  }

  const gmail = opts.fromAccount
    ? getGmailClientForAccount(opts.fromAccount)
    : getGmailClient();
  const thread = await getThreadWithMessages(opts.threadId, opts.fromAccount);
  if (!thread || thread.messages.length === 0) {
    return { success: false, error: "Tråd ikke fundet eller tom" };
  }

  const lastMessage = thread.messages[thread.messages.length - 1];
  const inReplyTo = lastMessage.messageId || "";
  const references = [lastMessage.references, lastMessage.messageId].filter(Boolean).join(" ").trim() || inReplyTo;

  const account = opts.fromAccount
    ? config.gmailAccounts.find((a) => a.email.toLowerCase() === opts.fromAccount!.toLowerCase())
    : null;
  const fromName = account?.name || config.gmail.fromName;
  const fromEmail = account?.email || config.gmail.fromEmail;

  let htmlBody = opts.body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>\n");

  const altBoundary = `alt_${Date.now()}`;
  const messageParts: string[] = [
    `From: ${fromName} <${fromEmail}>`,
    `To: ${opts.contactName ? `${opts.contactName} <${opts.to}>` : opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, "utf-8").toString("base64")}?=`,
    `In-Reply-To: ${inReplyTo}`,
    `References: ${references}`,
    `MIME-Version: 1.0`,
    `X-EjendomAI-PropertyId: ${opts.propertyId}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    "",
    Buffer.from(opts.body, "utf-8").toString("base64"),
    "",
    `--${altBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    "",
    Buffer.from(
      `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6;">${htmlBody}</div>`,
      "utf-8"
    ).toString("base64"),
    "",
    `--${altBoundary}--`,
  ];

  const rawMessage = messageParts.filter(Boolean).join("\r\n");
  const encodedMessage = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encodedMessage, threadId: opts.threadId },
  });

  logger.info(`Reply sent in thread ${opts.threadId} to ${opts.to}`, {
    service: "email",
    propertyAddress: opts.propertyId,
    metadata: { messageId: response.data.id, threadId: opts.threadId },
  });

  return {
    success: true,
    messageId: response.data.id || undefined,
    threadId: opts.threadId,
  };
}

/**
 * Check if Gmail API is configured and working (all accounts).
 */
export async function checkGmailHealth(): Promise<{
  configured: boolean;
  working: boolean;
  email?: string;
  accounts?: { email: string; name: string; working: boolean; error?: string }[];
  error?: string;
}> {
  const clientId = config.gmail.clientId();
  if (!clientId) {
    return { configured: false, working: false, error: "GMAIL_CLIENT_ID not set" };
  }

  const accounts = config.gmailAccounts.filter((a) => a.email && a.refreshToken());

  if (accounts.length === 0) {
    try {
      const gmail = getGmailClient();
      const profile = await gmail.users.getProfile({ userId: "me" });
      return {
        configured: true,
        working: true,
        email: profile.data.emailAddress || config.gmail.fromEmail,
      };
    } catch (error) {
      return { configured: true, working: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const results: { email: string; name: string; working: boolean; error?: string }[] = [];
  for (const acc of accounts) {
    try {
      const client = getGmailClientForAccount(acc.email);
      const profile = await client.users.getProfile({ userId: "me" });
      results.push({ email: profile.data.emailAddress || acc.email, name: acc.name, working: true });
    } catch (error) {
      results.push({ email: acc.email, name: acc.name, working: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const anyWorking = results.some((r) => r.working);
  return {
    configured: true,
    working: anyWorking,
    email: results.find((r) => r.working)?.email,
    accounts: results,
  };
}
