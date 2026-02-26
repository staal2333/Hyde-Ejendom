// ============================================================
// Lead Enrichment – Auto-enrich contact info when qualifying
// Uses existing web-scraper and email-finder infrastructure
// ============================================================

import { scrapeWebsite, searchGoogle } from "@/lib/research/web-scraper";
import { findEmailForPerson } from "@/lib/research/email-finder";
import { logger } from "@/lib/logger";

export interface EnrichmentContact {
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  source: string;
}

export interface EnrichmentResult {
  contact_email: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contacts: EnrichmentContact[];
  enrichment_source: string;
}

const PHONE_REGEX = /(?:\+45[\s.-]?)?(?:\d{2}[\s.-]?){3,4}\d{2}/g;

function extractPhones(text: string): string[] {
  const matches = text.match(PHONE_REGEX) || [];
  return [...new Set(matches.map(m => m.replace(/[\s.-]/g, "")))]
    .filter(p => p.length >= 8 && p.length <= 14);
}

function extractContactPerson(text: string): { name: string; role: string } | null {
  const rolePatterns = [
    /(?:CEO|Adm\.?\s*Direktør|Direktør|Managing\s*Director|Owner|Ejer|Indehaver|Partner|Bestyrelsesformand|CMO|CTO|CFO|Marketing\s*(?:Manager|Direktør|Chef)|Sales\s*(?:Manager|Direktør|Director))\s*[:\-–]?\s*([A-ZÆØÅ][a-zæøå]+\s+[A-ZÆØÅ][a-zæøå]+(?:\s+[A-ZÆØÅ][a-zæøå]+)?)/gi,
    /([A-ZÆØÅ][a-zæøå]+\s+[A-ZÆØÅ][a-zæøå]+(?:\s+[A-ZÆØÅ][a-zæøå]+)?)\s*[,\-–]\s*(?:CEO|Adm\.?\s*Direktør|Direktør|Managing\s*Director|Owner|Ejer|Indehaver|Partner|Bestyrelsesformand|CMO|CTO|CFO|Marketing\s*(?:Manager|Direktør|Chef)|Sales\s*(?:Manager|Direktør|Director))/gi,
  ];

  for (const pattern of rolePatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      const name = match[1]?.trim();
      const fullMatch = match[0];
      const roleMatch = fullMatch.replace(name || "", "").replace(/[:\-–,\s]+/g, " ").trim();
      if (name && name.length > 3) {
        return { name, role: roleMatch };
      }
    }
  }
  return null;
}

export async function enrichLeadContact(
  leadName: string,
  domain: string | null | undefined,
  website: string | null | undefined,
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    contact_email: null,
    contact_phone: null,
    contact_name: null,
    contact_role: null,
    contacts: [],
    enrichment_source: "none",
  };

  const sources: string[] = [];
  const seenNames = new Set<string>();

  const addContact = (name: string, role: string, email: string | null, phone: string | null, source: string) => {
    const key = name.toLowerCase();
    if (seenNames.has(key)) return;
    seenNames.add(key);
    result.contacts.push({ name, role, email, phone, source });
  };

  try {
    const targetDomain = domain || (website ? new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "") : null);

    if (targetDomain) {
      const contactUrls = [
        `https://${targetDomain}`,
        `https://${targetDomain}/kontakt`,
        `https://${targetDomain}/contact`,
        `https://www.${targetDomain}`,
        `https://www.${targetDomain}/kontakt`,
      ];

      for (const url of contactUrls) {
        try {
          const scraped = await scrapeWebsite(url);
          if (!scraped) continue;

          if (scraped.emails.length > 0 && !result.contact_email) {
            const validEmails = scraped.emails.filter(e =>
              !e.includes("noreply") && !e.includes("no-reply") &&
              !e.includes("unsubscribe") && !e.includes("privacy")
            );
            if (validEmails.length > 0) {
              result.contact_email = validEmails[0];
              sources.push(`website:${url}`);
            }
          }

          if (!result.contact_phone && scraped.phones.length > 0) {
            result.contact_phone = scraped.phones[0];
          } else if (!result.contact_phone) {
            const textContent = [scraped.contactPageText, scraped.aboutPageText, ...scraped.relevantSnippets].filter(Boolean).join(" ");
            if (textContent) {
              const phones = extractPhones(textContent);
              if (phones.length > 0) {
                result.contact_phone = phones[0];
              }
            }
          }

          // Extract structured people from website
          if (scraped.people && scraped.people.length > 0) {
            for (const p of scraped.people) {
              addContact(p.name, p.role || "Ukendt", p.email || null, p.phone || null, `Website: ${url}`);
            }
          }

          // Fallback: extract contact person from text
          const textContent = [scraped.contactPageText, scraped.aboutPageText, ...scraped.relevantSnippets].filter(Boolean).join(" ");
          if (!result.contact_name && textContent) {
            const person = extractContactPerson(textContent);
            if (person) {
              result.contact_name = person.name;
              result.contact_role = person.role;
              addContact(person.name, person.role, null, null, `Website: ${url}`);
            }
          }

          if (result.contact_email && result.contacts.length >= 3) break;
        } catch {
          continue;
        }
      }
    }

    // Step 2: Google search for contacts
    if (!result.contact_email || result.contacts.length < 2) {
      const searchResults = await searchGoogle(`"${leadName}" kontakt email direktør`, 5);
      for (const sr of searchResults) {
        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const snippetEmails = (sr.snippet + " " + sr.title).match(emailRegex) || [];
        for (const email of snippetEmails) {
          if (!email.includes("noreply") && !email.includes("example.com")) {
            if (!result.contact_email) {
              result.contact_email = email;
              sources.push(`search:${sr.url}`);
            }
            break;
          }
        }

        // Try to extract people from search snippets
        const person = extractContactPerson(sr.snippet + " " + sr.title);
        if (person) {
          addContact(person.name, person.role, null, null, `Søgning: ${sr.url}`);
        }
      }
    }

    // Step 3: Email finding for discovered contacts
    if (targetDomain) {
      const contactsNeedingEmail = result.contacts.filter(c => !c.email && c.name).slice(0, 3);
      for (const contact of contactsNeedingEmail) {
        try {
          const emailResult = await findEmailForPerson({
            personName: contact.name,
            companyName: leadName,
            companyDomain: targetDomain,
          });
          if (emailResult.email) {
            contact.email = emailResult.email;
            if (!result.contact_email) {
              result.contact_email = emailResult.email;
              result.contact_name = contact.name;
              result.contact_role = contact.role;
            }
            sources.push(`email-finder:${emailResult.strategy}`);
          }
        } catch { /* continue with next */ }
      }
    }

    // Set primary contact from first contact with email
    if (!result.contact_name && result.contacts.length > 0) {
      const best = result.contacts.find(c => c.email) || result.contacts[0];
      result.contact_name = best.name;
      result.contact_role = best.role;
      if (best.email && !result.contact_email) result.contact_email = best.email;
    }

    result.enrichment_source = sources.length > 0 ? sources.join(", ") : "none";
    logger.info(`[lead-enrichment] "${leadName}": email=${result.contact_email || "none"}, phone=${result.contact_phone || "none"}, contacts=${result.contacts.length}`, { service: "lead-sourcing" });

  } catch (e) {
    logger.warn(`[lead-enrichment] Failed for "${leadName}": ${e instanceof Error ? e.message : String(e)}`, { service: "lead-sourcing" });
  }

  return result;
}
