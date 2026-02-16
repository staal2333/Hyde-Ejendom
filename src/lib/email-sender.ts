// ============================================================
// Email Sender – Gmail API with OAuth2
// Sends outreach emails from mads.ejendomme@hydemedia.dk
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
  // Reset bucket every hour
  if (now - _rateBucketLastReset > hourMs) {
    _rateBucketTokens = 0;
    _rateBucketLastReset = now;
  }
  if (_rateBucketTokens >= config.emailRateLimitPerHour) {
    return false; // Rate limit exceeded
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

// Lazy singleton for Gmail client
let _gmail: ReturnType<typeof google.gmail> | null = null;

function getGmailClient() {
  if (!_gmail) {
    const clientId = config.gmail.clientId();
    const clientSecret = config.gmail.clientSecret();
    const refreshToken = config.gmail.refreshToken();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "Gmail API not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN."
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      "https://developers.google.com/oauthplayground" // redirect URI
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    _gmail = google.gmail({ version: "v1", auth: oauth2Client });
  }

  return _gmail;
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
  body: string; // Plain text body (will also be sent as simple HTML)
  replyTo?: string;
  propertyId: string;
  contactName?: string;
  attachments?: EmailAttachment[];
  /** Optional tracking pixel URL (appended to HTML body) */
  trackingPixelUrl?: string;
  /** Send ID for click tracking – wraps all links in the HTML body */
  sendId?: string;
  /** Base URL for tracking endpoints (e.g. https://ejendom-ai.vercel.app) */
  trackingBaseUrl?: string;
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
  const gmail = getGmailClient();

  const fromName = config.gmail.fromName;
  const fromEmail = config.gmail.fromEmail;

  // Build HTML body (simple: preserve line breaks)
  let htmlBody = opts.body
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
    );
  } else {
    messageParts.push(
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    );
  }

  // Text part
  messageParts.push(
    "",
    `--${altBoundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: base64`,
    "",
    Buffer.from(opts.body, "utf-8").toString("base64"),
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

/**
 * Check if Gmail API is configured and working.
 */
export async function checkGmailHealth(): Promise<{
  configured: boolean;
  working: boolean;
  email?: string;
  error?: string;
}> {
  try {
    const clientId = config.gmail.clientId();
    if (!clientId) {
      return { configured: false, working: false, error: "GMAIL_CLIENT_ID not set" };
    }

    const gmail = getGmailClient();
    const profile = await gmail.users.getProfile({ userId: "me" });

    return {
      configured: true,
      working: true,
      email: profile.data.emailAddress || config.gmail.fromEmail,
    };
  } catch (error) {
    return {
      configured: true,
      working: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
