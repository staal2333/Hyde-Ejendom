import { logger } from "@/lib/logger";
import type { Property } from "@/types";
import type { MailThread } from "@/lib/email-sender";
import type { OOHSend } from "@/lib/ooh/types";
import type { Tilbud } from "@/lib/tilbud/types";

export interface ContactProfile {
  email: string;
  hubspotContactId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
}

export interface TimelineEvent {
  date: string;
  type: "email_sent" | "email_received" | "ooh_sent" | "ooh_opened" | "ooh_clicked" | "ooh_replied" | "note" | "task" | "tilbud_draft" | "tilbud_final";
  summary: string;
}

export interface ContactContext {
  contact: ContactProfile;
  properties: Property[];
  threads: MailThread[];
  oohSends: OOHSend[];
  tilbud: Tilbud[];
  engagements: { type: string; timestamp: number; body?: string; subject?: string }[];
  timeline: TimelineEvent[];
  stats: {
    totalEmails: number;
    lastContactedAt: string | null;
    daysSinceLastContact: number;
    hasReplied: boolean;
    oohOpens: number;
    oohClicks: number;
    tilbudCount: number;
  };
}

function buildTimeline(ctx: Omit<ContactContext, "timeline" | "stats">): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const thread of ctx.threads) {
    for (const msg of thread.messages) {
      const isInbound = msg.from.toLowerCase().includes(ctx.contact.email.toLowerCase());
      events.push({
        date: msg.date,
        type: isInbound ? "email_received" : "email_sent",
        summary: `${isInbound ? "Modtaget" : "Sendt"}: ${msg.subject} — ${msg.snippet?.slice(0, 80) || ""}`,
      });
    }
  }

  for (const send of ctx.oohSends) {
    events.push({
      date: send.sentAt || send.createdAt,
      type: "ooh_sent",
      summary: `OOH kampagne sendt til ${send.contactName || send.contactEmail || "kontakt"}`,
    });
    if (send.openedAt) events.push({ date: send.openedAt, type: "ooh_opened", summary: "OOH email åbnet" });
    if (send.clickedAt) events.push({ date: send.clickedAt, type: "ooh_clicked", summary: "OOH email klikket" });
    if (send.repliedAt) events.push({ date: send.repliedAt, type: "ooh_replied", summary: "OOH email besvaret" });
  }

  for (const eng of ctx.engagements) {
    if (eng.timestamp > 0) {
      events.push({
        date: new Date(eng.timestamp).toISOString(),
        type: eng.type === "NOTE" ? "note" : "task",
        summary: eng.subject || eng.body?.slice(0, 80) || eng.type,
      });
    }
  }

  for (const t of ctx.tilbud) {
    events.push({
      date: t.offerDate || t.createdAt || "",
      type: t.status === "final" ? "tilbud_final" : "tilbud_draft",
      summary: `Tilbud ${t.offerNumber}: ${t.title || t.clientName} — ${t.status}`,
    });
  }

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return events;
}

function buildStats(ctx: Omit<ContactContext, "stats">): ContactContext["stats"] {
  const allDates: Date[] = [];
  let hasReplied = false;

  for (const thread of ctx.threads) {
    for (const msg of thread.messages) {
      allDates.push(new Date(msg.date));
      if (msg.from.toLowerCase().includes(ctx.contact.email.toLowerCase())) {
        hasReplied = true;
      }
    }
  }

  for (const send of ctx.oohSends) {
    if (send.sentAt) allDates.push(new Date(send.sentAt));
    if (send.repliedAt) hasReplied = true;
  }

  const totalEmails = ctx.threads.reduce((sum, t) => sum + t.messages.length, 0);
  const sorted = allDates.sort((a, b) => b.getTime() - a.getTime());
  const lastContactedAt = sorted[0]?.toISOString() || null;
  const daysSinceLastContact = lastContactedAt
    ? Math.floor((Date.now() - new Date(lastContactedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  return {
    totalEmails,
    lastContactedAt,
    daysSinceLastContact,
    hasReplied,
    oohOpens: ctx.oohSends.filter((s) => s.openedAt).length,
    oohClicks: ctx.oohSends.filter((s) => s.clickedAt).length,
    tilbudCount: ctx.tilbud.length,
  };
}

export async function getContactContext(email: string): Promise<ContactContext> {
  const contact: ContactProfile = { email };

  const [hubspot, threads, oohData, tilbudData, engagements, properties] = await Promise.allSettled([
    collectHubSpot(email, contact),
    collectThreads(email),
    collectOOH(email),
    collectTilbud(email),
    collectEngagements(contact),
    collectProperties(email),
  ]);

  const ctx: Omit<ContactContext, "timeline" | "stats"> = {
    contact,
    properties: properties.status === "fulfilled" ? properties.value : [],
    threads: threads.status === "fulfilled" ? threads.value : [],
    oohSends: oohData.status === "fulfilled" ? oohData.value : [],
    tilbud: tilbudData.status === "fulfilled" ? tilbudData.value : [],
    engagements: engagements.status === "fulfilled" ? engagements.value : [],
  };

  const timeline = buildTimeline(ctx);
  const stats = buildStats({ ...ctx, timeline });

  return { ...ctx, timeline, stats };
}

export function contextToPrompt(ctx: ContactContext): string {
  const lines: string[] = [
    `## Kontakt: ${ctx.contact.firstName || ""} ${ctx.contact.lastName || ""} (${ctx.contact.email})`,
    ctx.contact.company ? `Firma: ${ctx.contact.company}` : "",
    ctx.contact.phone ? `Telefon: ${ctx.contact.phone}` : "",
    "",
    `## Statistik`,
    `- Antal emails: ${ctx.stats.totalEmails}`,
    `- Sidst kontaktet: ${ctx.stats.lastContactedAt ? `${ctx.stats.daysSinceLastContact} dage siden` : "Aldrig"}`,
    `- Har svaret: ${ctx.stats.hasReplied ? "Ja" : "Nej"}`,
    `- OOH åbninger: ${ctx.stats.oohOpens}, klik: ${ctx.stats.oohClicks}`,
    `- Tilbud sendt: ${ctx.stats.tilbudCount}`,
    "",
  ];

  if (ctx.properties.length > 0) {
    lines.push("## Tilknyttede ejendomme");
    for (const p of ctx.properties.slice(0, 5)) {
      lines.push(`- ${p.address}, ${p.city} — Status: ${p.outreachStatus} — Score: ${p.outdoorScore || "?"}`);
    }
    lines.push("");
  }

  if (ctx.timeline.length > 0) {
    lines.push("## Seneste aktivitet (nyeste først)");
    for (const ev of ctx.timeline.slice(0, 15)) {
      const d = ev.date ? new Date(ev.date).toLocaleDateString("da-DK") : "?";
      lines.push(`- [${d}] ${ev.summary}`);
    }
    lines.push("");
  }

  return lines.filter(Boolean).join("\n");
}

// ─── Collectors (each fails gracefully) ───

async function collectHubSpot(email: string, contact: ContactProfile): Promise<void> {
  try {
    const { findContactByEmail } = await import("@/lib/hubspot");
    const found = await findContactByEmail(email);
    if (found) {
      contact.hubspotContactId = found.id;
      contact.firstName = found.firstName;
      contact.lastName = found.lastName;
      contact.phone = found.phone;
    }
  } catch (e) {
    logger.warn(`[contact-context] HubSpot lookup failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function collectThreads(email: string): Promise<MailThread[]> {
  try {
    const { searchThreadsByEmail } = await import("@/lib/email-sender");
    return await searchThreadsByEmail(email, 10);
  } catch (e) {
    logger.warn(`[contact-context] Gmail search failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

async function collectOOH(email: string): Promise<OOHSend[]> {
  try {
    const { getContacts, getSends } = await import("@/lib/ooh/store");
    const contacts = await getContacts({ search: email });
    const match = contacts.find((c) => c.email.toLowerCase() === email.toLowerCase());
    if (!match) return [];
    return await getSends({ contactId: match.id });
  } catch (e) {
    logger.warn(`[contact-context] OOH collect failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

async function collectTilbud(email: string): Promise<Tilbud[]> {
  try {
    const { listTilbud } = await import("@/lib/tilbud/store");
    const nameFromEmail = email.split("@")[0].replace(/[._-]/g, " ");
    const result = listTilbud({ q: nameFromEmail, limit: 10 });
    return result.items;
  } catch (e) {
    logger.warn(`[contact-context] Tilbud collect failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

async function collectEngagements(contact: ContactProfile): Promise<ContactContext["engagements"]> {
  if (!contact.hubspotContactId) return [];
  try {
    const { getContactEngagements } = await import("@/lib/hubspot");
    return await getContactEngagements(contact.hubspotContactId, 15);
  } catch (e) {
    logger.warn(`[contact-context] Engagements failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

async function collectProperties(email: string): Promise<Property[]> {
  try {
    const { fetchAllEjendomme } = await import("@/lib/hubspot");
    const all = await fetchAllEjendomme(200);
    return all.filter((p) =>
      p.contactEmail?.toLowerCase() === email.toLowerCase() ||
      p.contactPerson?.toLowerCase().includes(email.split("@")[0].toLowerCase())
    );
  } catch (e) {
    logger.warn(`[contact-context] Properties failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}
