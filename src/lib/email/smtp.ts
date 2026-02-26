// ============================================================
// Gmail SMTP Sender – uses App Password (simpler than OAuth)
// Setup: Google Account → Security → App Passwords → Mail
// Env vars: SMTP_USER (gmail address) + SMTP_PASSWORD (app password)
// ============================================================

import nodemailer from "nodemailer";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export interface SmtpEmailOptions {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SmtpEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    const user = config.smtp.user();
    const password = config.smtp.password();

    if (!user || !password) {
      throw new Error("Gmail SMTP ikke konfigureret. Tilføj SMTP_USER og SMTP_PASSWORD i Vercel environment variables.");
    }

    _transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: password },
    });
  }
  return _transporter;
}

export function isSmtpConfigured(): boolean {
  return !!(config.smtp.user() && config.smtp.password());
}

export async function sendSmtpEmail(opts: SmtpEmailOptions): Promise<SmtpEmailResult> {
  try {
    const transporter = getTransporter();
    const fromName = config.smtp.fromName;
    const fromEmail = config.smtp.fromEmail();

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: opts.toName ? `"${opts.toName}" <${opts.to}>` : opts.to,
      subject: opts.subject,
      text: opts.text || stripHtml(opts.html),
      html: opts.html,
      replyTo: opts.replyTo || fromEmail,
    });

    logger.info(`[smtp] Sent to ${opts.to}: ${info.messageId}`, { service: "email" });
    return { success: true, messageId: info.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[smtp] Failed to send to ${opts.to}: ${msg}`, { service: "email" });
    return { success: false, error: msg };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}
