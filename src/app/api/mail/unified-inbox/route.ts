// ============================================================
// GET /api/mail/unified-inbox
// Fetches threads from all Gmail accounts, enriches with
// HubSpot contact data, and AI-scores priority for reply
// ============================================================

import { NextResponse } from "next/server";
import { listInboxThreads, getConfiguredAccounts } from "@/lib/email-sender";
import { logger } from "@/lib/logger";
import { config } from "@/lib/config";

export interface EnrichedThread {
  id: string;
  subject: string;
  snippet: string;
  account: string;           // which inbox it came from
  from: string;
  fromEmail: string;
  date: string;
  isUnread: boolean;
  contact: {
    id?: string;
    name?: string;
    company?: string;
    email?: string;
    phone?: string;
    jobtitle?: string;
    city?: string;
    hubspotUrl?: string;
    lifecyclestage?: string;
  } | null;
  lastIsFromUs: boolean;
  priority: "high" | "medium" | "low";
  priorityReason: string;
  propertyAddresses: string[];
}

// Extract email address from "Name <email@domain>" format
function parseEmail(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return match ? match[1].toLowerCase() : raw.toLowerCase().trim();
}

function parseName(raw: string): string {
  return raw.replace(/<[^>]+>/, "").replace(/"/g, "").trim();
}

// Simple priority scoring without AI (fast, no extra cost)
function scorePriority(thread: {
  subject: string;
  snippet: string;
  from: string;
  isKnownContact: boolean;
  hasReply: boolean;
  ageHours: number;
}): { priority: "high" | "medium" | "low"; reason: string } {
  const subjectLower = (thread.subject || "").toLowerCase();
  const snippetLower = (thread.snippet || "").toLowerCase();
  const combined = subjectLower + " " + snippetLower;

  // If WE sent the last message, it's never "svar nu" — we're waiting for them
  if (thread.hasReply) {
    return { priority: "low", reason: "Vi har allerede svaret" };
  }

  const highKeywords = ["svar", "reply", "tilbud", "kontrakt", "møde", "meeting", "urgent", "haster", "vigtigt", "tak for", "bekræft", "accept"];
  const isHighKeyword = highKeywords.some(k => combined.includes(k));
  const isRecent = thread.ageHours < 24;
  const isKnownContact = thread.isKnownContact;

  if (isHighKeyword && isKnownContact) {
    return { priority: "high", reason: "Kendt kontakt + vigtige nøgleord" };
  }
  if (isHighKeyword && isRecent) {
    return { priority: "high", reason: "Vigtige nøgleord + modtaget for nylig" };
  }
  if (isKnownContact && isRecent) {
    return { priority: "high", reason: "Kendt HubSpot-kontakt, modtaget i dag" };
  }
  if (isKnownContact) {
    return { priority: "medium", reason: "Kendt HubSpot-kontakt" };
  }
  if (isHighKeyword) {
    return { priority: "medium", reason: "Vigtige nøgleord i emne/indhold" };
  }
  if (isRecent) {
    return { priority: "medium", reason: "Modtaget inden for 24 timer" };
  }
  return { priority: "low", reason: "Ingen umiddelbare prioriteringssignaler" };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const maxResults = Math.min(parseInt(searchParams.get("limit") || "6000", 10), 6000);
  const folder = (searchParams.get("folder") || "INBOX").toUpperCase() as "INBOX" | "SENT";

  try {
    // 1. Fetch raw threads from all accounts
    const rawThreads = await listInboxThreads(maxResults, folder === "SENT" ? "SENT" : "INBOX");

    // 2. Collect unique sender emails to look up in HubSpot
    // We do a bulk fetch of HubSpot contacts and index by email
    let hubspotByEmail: Map<string, { id: string; name: string; company?: string; jobtitle?: string; phone?: string; city?: string; lifecyclestage?: string }> = new Map();
    let propertiesByContactEmail: Map<string, string[]> = new Map();

    try {
      const { fetchAllEjendomme } = await import("@/lib/hubspot");
      const [contacts, properties] = await Promise.allSettled([
        // Fetch contacts via search – we'll do a simple full list (up to 100 recent)
        fetch(`https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=email,firstname,lastname,company,jobtitle,phone,city,lifecyclestage`, {
          headers: { Authorization: `Bearer ${config.hubspot.accessToken()}` },
        }).then(r => r.json()).then(d => d.results || []),
        fetchAllEjendomme(200),
      ]);

      if (contacts.status === "fulfilled") {
        for (const c of contacts.value) {
          const email = (c.properties?.email || "").toLowerCase();
          if (email) {
            hubspotByEmail.set(email, {
              id: c.id,
              name: [c.properties?.firstname, c.properties?.lastname].filter(Boolean).join(" ") || email,
              company: c.properties?.company,
              jobtitle: c.properties?.jobtitle,
              phone: c.properties?.phone,
              city: c.properties?.city,
              lifecyclestage: c.properties?.lifecyclestage,
            });
          }
        }
      }

      if (properties.status === "fulfilled") {
        for (const p of properties.value) {
          const email = p.contactEmail?.toLowerCase();
          if (email) {
            const existing = propertiesByContactEmail.get(email) || [];
            existing.push(p.address);
            propertiesByContactEmail.set(email, existing);
          }
        }
      }
    } catch (e) {
      logger.warn(`[unified-inbox] HubSpot enrichment failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // 3. Also get configured account emails to identify internal threads
    const accountEmails = new Set(
      config.gmailAccounts.map(a => a.email.toLowerCase())
    );

    // 4. Enrich each thread (rawThreads now have from, date, isUnread)
    const enriched: EnrichedThread[] = rawThreads.map((t) => {
      const fromEmail = parseEmail(t.from) || "";
      const fromName = parseName(t.from) || fromEmail;

      const hsContact = hubspotByEmail.get(fromEmail) || null;
      const propertyAddresses = propertiesByContactEmail.get(fromEmail) || [];

      const ageHours = t.date ? Math.max(0, (Date.now() - new Date(t.date).getTime()) / 3600000) : 48;

      const weReplied = t.lastIsFromUs ?? false;

      const { priority, reason } = scorePriority({
        subject: t.subject || "",
        snippet: t.snippet || "",
        from: fromEmail,
        isKnownContact: !!hsContact,
        hasReply: weReplied,
        ageHours,
      });

      return {
        id: t.id,
        subject: t.subject || "(intet emne)",
        snippet: t.snippet || "",
        account: t.account || config.gmailAccounts[0]?.email || "",
        from: fromName || fromEmail,
        fromEmail,
        date: t.date || "",
        isUnread: t.isUnread ?? false,
        lastIsFromUs: weReplied,
        contact: hsContact
          ? {
              id: hsContact.id,
              name: hsContact.name,
              company: hsContact.company,
              email: fromEmail,
              phone: hsContact.phone,
              jobtitle: hsContact.jobtitle,
              city: hsContact.city,
              lifecyclestage: hsContact.lifecyclestage,
              hubspotUrl: `https://app.hubspot.com/contacts/contact/${hsContact.id}`,
            }
          : null,
        priority,
        priorityReason: reason,
        propertyAddresses,
      };
    });

    // 5. Already sorted by date (newest first) from listInboxThreads

    // 6. Compute summary stats
    const stats = {
      total: enriched.length,
      high: enriched.filter(t => t.priority === "high").length,
      medium: enriched.filter(t => t.priority === "medium").length,
      low: enriched.filter(t => t.priority === "low").length,
      knownContacts: enriched.filter(t => t.contact !== null).length,
      accounts: config.gmailAccounts.map(a => ({
        email: a.email,
        name: a.name,
        count: enriched.filter(t => t.account === a.email).length,
      })),
    };

    return NextResponse.json({ threads: enriched, stats });
  } catch (error) {
    logger.error(`[unified-inbox] Failed: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente indbakke" },
      { status: 500 }
    );
  }
}
