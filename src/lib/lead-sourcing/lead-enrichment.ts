// ============================================================
// Lead Enrichment – Auto-enrich contact info when qualifying
// Uses existing web-scraper and email-finder infrastructure
// ============================================================

import { scrapeWebsite, searchGoogle } from "@/lib/research/web-scraper";
import { findEmailForPerson } from "@/lib/research/email-finder";
import { scrapeProffLeadership, getProffFinancials } from "@/lib/lead-sourcing/proff";
import { lookupCvr } from "@/lib/research/cvr";
import { logger } from "@/lib/logger";

export interface EnrichmentContact {
  name: string;
  role: string;
  email: string | null;
  phone: string | null;
  source: string;
  priority?: number; // 1 = highest (marketing/salg), 2 = direktør, 3 = other
}

export interface EnrichmentResult {
  contact_email: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  contact_role: string | null;
  contacts: EnrichmentContact[];
  enrichment_source: string;
}

export interface FullEnrichmentResult extends EnrichmentResult {
  cvr: string | null;
  egenkapital: number | null;
  resultat: number | null;
  omsaetning: number | null;
  website: string | null;
  domain: string | null;
}

// Priority scoring for marketing-relevant roles (OOH sales focus)
function rolePriority(role: string): number {
  const r = role.toLowerCase();
  // Tier 1: direct marketing/sales budget holders
  if (r.includes("marketing") || r.includes("cmo") || r.includes("salg") || r.includes("brand") || r.includes("kommunikation")) return 1;
  // Tier 2: top decision makers
  if (r.includes("direktør") || r.includes("ceo") || r.includes("adm") || r.includes("ejer") || r.includes("indehaver") || r.includes("partner") || r.includes("stifter") || r.includes("founder")) return 2;
  // Tier 3: board / other
  if (r.includes("formand") || r.includes("bestyrelse")) return 3;
  return 4;
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
  cvr?: string | null,
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
    // Step 0: Proff.dk leadership scraping (fastest structured source)
    if (cvr) {
      try {
        const proffPeople = await scrapeProffLeadership(cvr);
        for (const p of proffPeople) {
          addContact(p.name, p.title, null, null, "Proff.dk");
        }
        if (proffPeople.length > 0) {
          sources.push("proff");
          logger.info(`[lead-enrichment] Proff: ${proffPeople.length} ledelsespersoner fundet for CVR ${cvr}`, { service: "lead-sourcing" });
        }
      } catch (e) {
        logger.warn(`[lead-enrichment] Proff scrape failed for CVR ${cvr}: ${e instanceof Error ? e.message : String(e)}`, { service: "lead-sourcing" });
      }
    }

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

/**
 * Full auto-enrichment agent for a single lead.
 * Steps:
 *   0. CVR lookup by company name (if no CVR)
 *   1. Proff financials (egenkapital, resultat, omsaetning)
 *   2. Proff leadership (decision makers)
 *   3. Website scraping (people + emails)
 *   4. Email finder for top contacts
 *   5. Marketing contact prioritization
 */
export async function enrichLeadFull(params: {
  name: string;
  cvr?: string | null;
  domain?: string | null;
  website?: string | null;
  address?: string | null;
}): Promise<FullEnrichmentResult> {
  const { name } = params;
  let cvr = params.cvr || null;
  let domain = params.domain || null;
  let website = params.website || null;

  const result: FullEnrichmentResult = {
    contact_email: null,
    contact_phone: null,
    contact_name: null,
    contact_role: null,
    contacts: [],
    enrichment_source: "none",
    cvr: cvr,
    egenkapital: null,
    resultat: null,
    omsaetning: null,
    website: website,
    domain: domain,
  };

  const sources: string[] = [];
  const seenNames = new Set<string>();

  const addContact = (
    contactName: string,
    role: string,
    email: string | null,
    phone: string | null,
    source: string
  ) => {
    const key = contactName.toLowerCase();
    if (seenNames.has(key) || !contactName || contactName.length < 3) return;
    seenNames.add(key);
    result.contacts.push({
      name: contactName,
      role,
      email,
      phone,
      source,
      priority: rolePriority(role),
    });
  };

  try {
    // ── Step 0: CVR lookup by company name (if no CVR) ──────────────
    if (!cvr) {
      logger.info(`[enrichLeadFull] CVR lookup for "${name}"`, { service: "lead-sourcing" });
      try {
        const cvrData = await lookupCvr(name, { strictNameMatch: false, searchedName: name });
        if (cvrData?.cvr) {
          cvr = cvrData.cvr;
          result.cvr = cvr;
          sources.push("cvr-lookup");

          // Pick up website from CVR if we don't have one
          if (!website && cvrData.website) {
            website = cvrData.website.startsWith("http") ? cvrData.website : `https://${cvrData.website}`;
            result.website = website;
          }
          if (!domain && website) {
            try {
              domain = new URL(website).hostname.replace(/^www\./, "");
              result.domain = domain;
            } catch { /* ignore */ }
          }

          // CVR roles (owners / directors)
          if (cvrData.roles && cvrData.roles.length > 0) {
            for (const r of cvrData.roles) {
              addContact(r.name, r.role, r.email || null, r.phone || null, "CVR");
            }
            sources.push("cvr-roles");
          }

          logger.info(`[enrichLeadFull] CVR found: ${cvr} for "${name}"`, { service: "lead-sourcing" });
        }
      } catch (e) {
        logger.warn(`[enrichLeadFull] CVR lookup failed for "${name}": ${e instanceof Error ? e.message : String(e)}`, { service: "lead-sourcing" });
      }
    }

    // ── Step 1: Proff financials ─────────────────────────────────────
    if (cvr) {
      try {
        const financials = await getProffFinancials(cvr);
        if (financials) {
          result.egenkapital = financials.egenkapital;
          result.resultat = financials.resultat;
          result.omsaetning = financials.omsaetning;
          if (financials.egenkapital != null || financials.omsaetning != null) {
            sources.push("proff-financials");
          }
        }
      } catch (e) {
        logger.warn(`[enrichLeadFull] Proff financials failed for CVR ${cvr}: ${e instanceof Error ? e.message : String(e)}`, { service: "lead-sourcing" });
      }
    }

    // ── Step 2: Proff leadership ────────────────────────────────────
    if (cvr) {
      try {
        const proffPeople = await scrapeProffLeadership(cvr);
        for (const p of proffPeople) {
          addContact(p.name, p.title, null, null, "Proff.dk");
        }
        if (proffPeople.length > 0) {
          sources.push("proff-leadership");
          logger.info(`[enrichLeadFull] Proff leadership: ${proffPeople.length} persons for CVR ${cvr}`, { service: "lead-sourcing" });
        }
      } catch (e) {
        logger.warn(`[enrichLeadFull] Proff leadership failed for CVR ${cvr}: ${e instanceof Error ? e.message : String(e)}`, { service: "lead-sourcing" });
      }
    }

    // ── Step 3: Website scraping ────────────────────────────────────
    const targetDomain = domain;
    if (targetDomain) {
      const urls = [
        `https://${targetDomain}`,
        `https://${targetDomain}/kontakt`,
        `https://${targetDomain}/om-os`,
        `https://${targetDomain}/team`,
      ];

      for (const url of urls) {
        try {
          const scraped = await scrapeWebsite(url);
          if (!scraped) continue;

          if (scraped.emails.length > 0 && !result.contact_email) {
            const validEmails = scraped.emails.filter(e =>
              !e.includes("noreply") && !e.includes("no-reply") && !e.includes("unsubscribe")
            );
            if (validEmails.length > 0) {
              result.contact_email = validEmails[0];
              sources.push(`website`);
            }
          }

          if (!result.contact_phone && scraped.phones.length > 0) {
            result.contact_phone = scraped.phones[0];
          }

          if (scraped.people && scraped.people.length > 0) {
            for (const p of scraped.people) {
              addContact(p.name, p.role || "Ukendt", p.email || null, p.phone || null, `Website`);
            }
          }

          const textContent = [scraped.contactPageText, scraped.aboutPageText, ...scraped.relevantSnippets].filter(Boolean).join(" ");
          if (!result.contact_name && textContent) {
            const person = extractContactPerson(textContent);
            if (person) {
              addContact(person.name, person.role, null, null, `Website`);
            }
          }

          if (result.contacts.length >= 5) break;
        } catch { continue; }
      }
    }

    // ── Step 4: Google search for marketing contacts specifically ────
    if (result.contacts.filter(c => c.priority === 1).length === 0) {
      try {
        const searchResults = await searchGoogle(
          `"${name}" marketing chef direktør kontakt email`,
          4
        );
        for (const sr of searchResults) {
          const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
          const snippetEmails = (sr.snippet + " " + sr.title).match(emailRegex) || [];
          for (const email of snippetEmails) {
            if (!email.includes("noreply") && !email.includes("example.com") && !result.contact_email) {
              result.contact_email = email;
              sources.push("google-search");
              break;
            }
          }
          const person = extractContactPerson(sr.snippet + " " + sr.title);
          if (person) {
            addContact(person.name, person.role, null, null, "Google søgning");
          }
        }
      } catch { /* ignore */ }
    }

    // ── Step 5: Email finding for top contacts without email ─────────
    if (targetDomain) {
      const needEmail = result.contacts
        .filter(c => !c.email && c.name)
        .sort((a, b) => (a.priority || 4) - (b.priority || 4))
        .slice(0, 4);

      for (const contact of needEmail) {
        try {
          const emailResult = await findEmailForPerson({
            personName: contact.name,
            companyName: name,
            companyDomain: targetDomain,
          });
          if (emailResult.email) {
            contact.email = emailResult.email;
            if (!result.contact_email) {
              result.contact_email = emailResult.email;
              sources.push(`email-finder`);
            }
          }
        } catch { /* continue */ }
      }
    }

    // ── Step 6: Sort contacts by priority + email availability ───────
    result.contacts.sort((a, b) => {
      const pa = a.priority || 4;
      const pb = b.priority || 4;
      if (pa !== pb) return pa - pb;
      // Within same priority: email-having contacts first
      if (a.email && !b.email) return -1;
      if (!a.email && b.email) return 1;
      return 0;
    });

    // Set primary contact = highest priority contact
    const best = result.contacts.find(c => c.email) || result.contacts[0];
    if (best) {
      result.contact_name = best.name;
      result.contact_role = best.role;
      if (best.email && !result.contact_email) result.contact_email = best.email;
    }

    result.enrichment_source = sources.length > 0 ? sources.join(", ") : "none";
    logger.info(
      `[enrichLeadFull] "${name}": cvr=${result.cvr || "none"}, egk=${result.egenkapital != null ? result.egenkapital : "none"}, contacts=${result.contacts.length}, email=${result.contact_email || "none"}`,
      { service: "lead-sourcing" }
    );

  } catch (e) {
    logger.warn(`[enrichLeadFull] Failed for "${name}": ${e instanceof Error ? e.message : String(e)}`, { service: "lead-sourcing" });
  }

  return result;
}
