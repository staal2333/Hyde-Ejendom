// ============================================================
// Research Orchestrator – Deep research for a property
// PRECISION-FIRST: OIS ejerforholdsstrategi → strict CVR → web → LLM
//
// Core principles:
//   1. OIS is THE source of truth for ownership
//   2. CVR matches are scored; below threshold → discarded
//   3. Ownership type determines the whole research strategy
//   4. "Unknown" is always better than "wrong"
// ============================================================

import { lookupOis } from "./ois";
import { lookupCvr, lookupCvrScored, lookupCvrByAddress, lookupCvrBestMatch, lookupProff } from "./cvr";
import { lookupBbr } from "./bbr";
import { scrapeCompanyWebsite, searchGoogle } from "./web-scraper";
import {
  classifyOwnership,
  getCvrStrategy,
  type OwnershipType,
} from "./validator";
import { isSupportedLocation, resolveKommuneName, SUPPORTED_CITIES } from "../supported-cities";
import type { Property, ResearchData, WebSearchResult } from "@/types";
import { logger } from "../logger";

/** Progress callback for research steps */
export type ResearchProgressCallback = (event: {
  step: string;
  message: string;
  detail?: string;
}) => void;

/**
 * Perform deep research for a property:
 * 0. OIS.dk – official ownership (THE primary source)
 * 1. Classify ownership type → choose CVR strategy
 * 2. CVR lookup with STRICT scoring
 * 3. BBR building data
 * 4. Targeted web search + scraping
 */
export async function researchProperty(
  property: Property,
  onProgress?: ResearchProgressCallback
): Promise<ResearchData> {
  const emit = onProgress || (() => {});

  // ── Address fallback: If address is empty, try to parse from name ──
  if (!property.address && property.name) {
    property = { ...property, address: property.name };
    emit({
      step: "address_fallback",
      message: `Adresse mangler – bruger ejendommens navn som adresse: "${property.name}"`,
    });
  }
  if (!property.city && property.name) {
    const parts = property.name.split(",").map(s => s.trim());
    if (parts.length > 1) {
      property = { ...property, city: parts[parts.length - 1] };
    }
  }

  emit({
    step: "start",
    message: `Starter dyb research for: ${property.name || property.address}`,
  });

  // ══════════════════════════════════════════════════════════
  // PRE-CHECK: Validate property is in a supported city
  // Only the 5 largest Danish cities are supported
  // ══════════════════════════════════════════════════════════
  const locationCheck = isSupportedLocation(property.city, property.postalCode);
  if (!locationCheck.supported) {
    emit({
      step: "city_unsupported",
      message: `⚠️ Ejendom er IKKE i en understøttet by`,
      detail: `${locationCheck.reason}\nUnderstøttede byer: ${SUPPORTED_CITIES.map(c => c.name).join(", ")}`,
    });
    logger.warn(`Property not in supported city: ${property.address}, ${property.city}`, {
      service: "research",
      propertyAddress: property.address,
    });
    // Continue with research but log the warning – it may be resolved after OIS lookup
  } else {
    emit({
      step: "city_validated",
      message: `✓ By valideret: ${locationCheck.cityName}`,
    });
  }

  // ══════════════════════════════════════════════════════════
  // Step 0: OIS.dk – Official owner/administrator lookup
  // ══════════════════════════════════════════════════════════
  emit({
    step: "ois",
    message: "📋 OIS.dk: Søger officielle ejer- og administratordata...",
    detail: `Slår op: ${property.address}, ${property.postalCode} ${property.city}`,
  });

  const oisData = await lookupOis(
    property.address,
    property.postalCode,
    property.city,
    (event) => emit({ step: event.step, message: event.message, detail: event.detail })
  );

  let oisOwnerName: string | null = null;
  let oisAdminName: string | null = null;
  let ownershipType: OwnershipType = "ukendt";

  if (oisData) {
    if (oisData.owners.length > 0) {
      oisOwnerName = oisData.owners.find(o => o.isPrimary)?.name || oisData.owners[0].name;
      emit({
        step: "ois_owner",
        message: `📋 OIS Ejer: ${oisOwnerName}`,
        detail: oisData.owners.length > 1
          ? `Alle ejere: ${oisData.owners.map(o => o.name).join(", ")}`
          : undefined,
      });
    }
    if (oisData.administrators.length > 0) {
      oisAdminName = oisData.administrators.find(a => a.isPrimary)?.name || oisData.administrators[0].name;
      emit({
        step: "ois_admin",
        message: `📋 OIS Administrator: ${oisAdminName}`,
        detail: oisData.administrators.length > 1
          ? `Alle administratorer: ${oisData.administrators.map(a => a.name).join(", ")}`
          : undefined,
      });
    }

    // ── CLASSIFY OWNERSHIP TYPE ──
    ownershipType = classifyOwnership(
      oisData.ejerforholdstekst,
      oisData.ejerforholdskode,
      oisData.owners.map(o => o.name)
    );

    // Resolve kommune to a clean city name for CVR matching
    const resolvedKommune = resolveKommuneName(oisData.kommune);
    if (resolvedKommune && resolvedKommune !== oisData.kommune) {
      emit({
        step: "ois_kommune_resolved",
        message: `📋 Kommune resolved: "${oisData.kommune}" → "${resolvedKommune}"`,
      });
      // Update OIS data with clean kommune name
      oisData.kommune = resolvedKommune;
    }

    // Post-OIS city validation (if pre-check was inconclusive)
    if (!locationCheck.supported && oisData.kommune) {
      const postOisCheck = isSupportedLocation(oisData.kommune, property.postalCode);
      if (!postOisCheck.supported) {
        emit({
          step: "city_unsupported_confirmed",
          message: `⚠️ OIS bekræfter: kommune "${oisData.kommune}" er IKKE understøttet`,
          detail: `Ejendom springes IKKE over, men resultater kan være begrænsede`,
        });
      }
    }

    emit({
      step: "ois_classification",
      message: `📋 Ejertype klassificeret: ${ownershipType.toUpperCase()}`,
      detail: `Ejerforholdstekst: ${oisData.ejerforholdstekst || "ukendt"} | Kode: ${oisData.ejerforholdskode || "ukendt"} | Kommune: ${oisData.kommune || "ukendt"}`,
    });
  } else {
    emit({
      step: "ois",
      message: "OIS: Ingen data fundet – falder tilbage til CVR-søgning",
    });
  }

  // ══════════════════════════════════════════════════════════
  // Step 1: CVR lookup – strategy-driven by OIS ownership type
  // ══════════════════════════════════════════════════════════
  const cvrStrategy = getCvrStrategy(ownershipType);

  emit({
    step: "cvr_strategy",
    message: `CVR-strategi: ${cvrStrategy.description}`,
    detail: `shouldSearchCvr: ${cvrStrategy.shouldSearchCvr} | requireAddressMatch: ${cvrStrategy.requireAddressMatch}`,
  });

  let cvrData = null;

  if (cvrStrategy.shouldSearchCvr) {
    emit({
      step: "cvr",
      message: "Søger i CVR-registret...",
      detail: oisOwnerName
        ? `Søger specifikt efter OIS-ejer: "${oisOwnerName}"`
        : `Søger efter ejer/administrator for ${property.address}`,
    });

    // Priority 1: OIS owner name → scored CVR lookup
    if (!cvrData && oisOwnerName) {
      emit({
        step: "cvr",
        message: `CVR: Scorer match for OIS-ejer "${oisOwnerName}" (strikt)...`,
      });

      const scored = await lookupCvrBestMatch(
        oisOwnerName,
        property.address,
        property.postalCode,
        oisData?.kommune || undefined
      );

      if (scored.result) {
        cvrData = scored.result;
        emit({
          step: "cvr",
          message: `CVR ✓ "${cvrData.companyName}" (CVR ${cvrData.cvr}) – Score: ${scored.score}/100`,
          detail: `Årsager: ${scored.reasons.join(", ")} | Adresse: ${cvrData.address}`,
        });
      } else {
        emit({
          step: "cvr",
          message: `CVR: Ingen god match for "${oisOwnerName}" (score ${scored.score} < ${35})`,
          detail: scored.discardReason || scored.reasons.join(", "),
        });

        // Fallback to proff.dk
        emit({
          step: "cvr",
          message: `CVR: Prøver proff.dk som fallback for "${oisOwnerName}"...`,
        });
        cvrData = await lookupProff(oisOwnerName);
        if (cvrData) {
          emit({
            step: "cvr",
            message: `CVR via proff.dk: ${cvrData.companyName} (CVR ${cvrData.cvr})`,
            detail: `Adresse: ${cvrData.address}`,
          });
        }
      }
    }

    // Priority 2: OIS administrator
    if (!cvrData && oisAdminName && oisAdminName !== oisOwnerName) {
      emit({
        step: "cvr",
        message: `CVR: Søger efter OIS-administrator "${oisAdminName}"...`,
      });
      const scored = await lookupCvrScored(oisAdminName, {
        strictNameMatch: true,
        searchedName: oisAdminName,
        expectedAddress: { address: property.address, postalCode: property.postalCode, city: property.city },
        expectedKommune: oisData?.kommune || undefined,
      });
      if (scored.result && scored.score >= 35) {
        cvrData = scored.result;
        emit({
          step: "cvr",
          message: `CVR administrator: ${cvrData.companyName} (Score: ${scored.score})`,
        });
      }
    }

    // Priority 3: Existing CVR number on property
    if (!cvrData && property.ownerCompanyCvr) {
      cvrData = await lookupCvr(property.ownerCompanyCvr);
      if (cvrData) emit({ step: "cvr", message: `CVR via CVR-nr: ${cvrData.companyName}` });
    }

    // Priority 4: Existing company name on property
    if (!cvrData && property.ownerCompanyName) {
      const scored = await lookupCvrScored(property.ownerCompanyName, {
        expectedAddress: { address: property.address, postalCode: property.postalCode, city: property.city },
        searchedName: property.ownerCompanyName,
      });
      if (scored.result && scored.score >= 35) {
        cvrData = scored.result;
        emit({ step: "cvr", message: `CVR via firmanavn: ${cvrData.companyName} (Score: ${scored.score})` });
      }
    }

    // Priority 5: Address-based association search (only for andels/ejerforening types)
    if (!cvrData && property.address &&
        (ownershipType === "andelsbolig" || ownershipType === "ejerforening" || ownershipType === "ukendt")) {
      emit({
        step: "cvr",
        message: "Søger efter ejerforening/andelsforening på adressen...",
      });
      cvrData = await lookupCvrByAddress(property.address, property.city, property.postalCode);
      if (cvrData) {
        emit({ step: "cvr", message: `CVR via adressesøgning: ${cvrData.companyName}` });
      }
    }

    if (!cvrData) {
      emit({ step: "cvr", message: "Ingen CVR-data fundet – fortsætter med websøgning" });
    } else {
      if (cvrData.email || cvrData.phone || cvrData.website) {
        emit({
          step: "cvr_contact",
          message: `CVR kontaktinfo: ${[
            cvrData.email ? `Email: ${cvrData.email}` : null,
            cvrData.phone ? `Tlf: ${cvrData.phone}` : null,
            cvrData.website ? `Web: ${cvrData.website}` : null,
          ].filter(Boolean).join(" | ")}`,
        });
      }
      if (cvrData.owners && cvrData.owners.length > 0) {
        emit({ step: "cvr_owners", message: `CVR ejere: ${cvrData.owners.join(", ")}` });
      }
    }
  } else {
    // Strategy says don't search CVR (privatperson, offentlig)
    emit({
      step: "cvr_skip",
      message: `CVR-søgning sprunget over: ${cvrStrategy.description}`,
    });
  }

  // ── Step 2: BBR lookup ──
  emit({
    step: "bbr",
    message: "Henter bygningsdata fra BBR...",
    detail: `Opslag: ${property.address}, ${property.postalCode} ${property.city}`,
  });

  const bbrData = await lookupBbr(
    property.address,
    property.postalCode,
    property.city
  );

  if (bbrData) {
    emit({
      step: "bbr",
      message: `BBR-data fundet: ${bbrData.area || "?"}m², ${bbrData.floors || "?"} etager, bygget ${bbrData.buildingYear || "ukendt"}`,
    });
  } else {
    emit({ step: "bbr", message: "Ingen BBR-data fundet" });
  }

  // ── Step 3: Deep web search ──
  const searchQueries = buildSearchQueries(property, cvrData, bbrData, oisOwnerName, oisAdminName, ownershipType);

  emit({
    step: "search",
    message: `Kører ${searchQueries.length} målrettede websøgninger...`,
    detail: searchQueries.map((q, i) => `${i + 1}. "${q}"`).join("\n"),
  });

  const allSearchResults: WebSearchResult[] = [];

  for (let i = 0; i < searchQueries.length; i++) {
    const query = searchQueries[i];
    emit({
      step: "search_query",
      message: `Søger: "${query}"`,
      detail: `Søgning ${i + 1} af ${searchQueries.length}`,
    });

    const results = await searchGoogle(query, 4);
    allSearchResults.push(...results);

    if (results.length > 0) {
      emit({
        step: "search_result",
        message: `Fandt ${results.length} resultater for "${query.substring(0, 40)}..."`,
        detail: results.slice(0, 2).map((r) => `→ ${r.title}`).join("\n"),
      });
    }

    if (i < searchQueries.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const uniqueResults = deduplicateResults(allSearchResults);

  // ── Relevance filter ──
  const propertyAddr = property.address || property.name || "";
  const streetName = propertyAddr.replace(/\s*\d+.*$/, "").trim().toLowerCase();
  const companyName = cvrData?.companyName?.toLowerCase() || "";
  const oisOwnerLower = oisOwnerName?.toLowerCase() || "";
  const oisAdminLower = oisAdminName?.toLowerCase() || "";

  const relevantResults = uniqueResults.filter(r => {
    const text = `${r.title} ${r.snippet} ${r.url}`.toLowerCase();
    if (streetName && text.includes(streetName)) return true;
    if (companyName && text.includes(companyName.substring(0, 10))) return true;
    if (property.postalCode && text.includes(property.postalCode)) return true;
    if (oisOwnerLower && text.includes(oisOwnerLower.substring(0, Math.min(oisOwnerLower.length, 10)))) return true;
    if (oisAdminLower && text.includes(oisAdminLower.substring(0, Math.min(oisAdminLower.length, 10)))) return true;
    const propertyDomains = ["cvr.dk", "virk.dk", "boliga.dk", "ois.dk", "dingeo.dk", "bbr.", "tinglysning", "proff.dk"];
    if (propertyDomains.some(d => text.includes(d))) return true;
    return false;
  });

  const discarded = uniqueResults.length - relevantResults.length;

  emit({
    step: "search_done",
    message: `${relevantResults.length} relevante søgeresultater (${discarded} irrelevante fjernet)`,
  });

  // ── Step 4: Scrape websites ──
  emit({
    step: "scrape",
    message: "Scraper relevante websites for kontaktinfo...",
  });

  const websiteUrls = findBestUrls(relevantResults, cvrData?.companyName || oisOwnerName || undefined, 5);

  if (oisOwnerName) {
    const proffSearchUrl = `https://www.proff.dk/bransjes%C3%B8k?q=${encodeURIComponent(oisOwnerName)}`;
    if (!websiteUrls.some(u => u.includes("proff.dk"))) {
      websiteUrls.unshift(proffSearchUrl);
    }
  }

  if (cvrData?.website) {
    const cvrUrl = cvrData.website.startsWith("http") ? cvrData.website : `https://${cvrData.website}`;
    const existingIndex = websiteUrls.findIndex(u => {
      try { return new URL(u).hostname === new URL(cvrUrl).hostname; } catch { return false; }
    });
    if (existingIndex === -1) {
      websiteUrls.unshift(cvrUrl);
    }
  }

  let mergedWebsite = null;

  for (let i = 0; i < websiteUrls.length; i++) {
    const url = websiteUrls[i];
    emit({
      step: "scrape_site",
      message: `Scraper website ${i + 1}/${websiteUrls.length}: ${new URL(url).hostname}`,
    });

    const content = await scrapeCompanyWebsite(url);
    if (!content) continue;

    emit({
      step: "scrape_result",
      message: `Fandt ${content.emails.length} emails, ${content.phones.length} tlf på ${new URL(url).hostname}`,
    });

    if (!mergedWebsite) {
      mergedWebsite = content;
    } else {
      mergedWebsite.emails.push(...content.emails);
      mergedWebsite.phones.push(...content.phones);
      mergedWebsite.relevantSnippets.push(...content.relevantSnippets);
      if (content.aboutPageText && !mergedWebsite.aboutPageText) {
        mergedWebsite.aboutPageText = content.aboutPageText;
      }
    }
  }

  if (mergedWebsite) {
    mergedWebsite.emails = [...new Set(mergedWebsite.emails)];
    mergedWebsite.phones = [...new Set(mergedWebsite.phones)];
    mergedWebsite.relevantSnippets = [...new Set(mergedWebsite.relevantSnippets)].slice(0, 15);

    emit({
      step: "scrape_done",
      message: `Scraping færdig: ${mergedWebsite.emails.length} emails, ${mergedWebsite.phones.length} tlf`,
    });
  } else {
    emit({ step: "scrape_done", message: "Ingen websites kunne scrapes" });
  }

  emit({
    step: "complete",
    message: "Research afsluttet",
    detail: `OIS: ${oisData ? "✓" : "✗"} | CVR: ${cvrData ? "✓" : "✗"} | BBR: ${bbrData ? "✓" : "✗"} | Ejertype: ${ownershipType} | Emails: ${mergedWebsite?.emails.length || 0}`,
  });

  return {
    oisData,
    cvrData,
    bbrData,
    companySearchResults: relevantResults,
    websiteContent: mergedWebsite,
  };
}

// ─── Query Builder ──────────────────────────────────────────

function buildSearchQueries(
  property: Property,
  cvrData: { companyName?: string; owners?: string[] } | null,
  bbrData: { units?: number; usage?: string; floors?: number; area?: number } | null,
  oisOwnerName?: string | null,
  oisAdminName?: string | null,
  ownershipType?: OwnershipType
): string[] {
  const queries: string[] = [];
  const addr = property.address || property.name || "";
  const city = property.city || "";
  const postal = property.postalCode || "";

  const ownerCompany = oisOwnerName || cvrData?.companyName || property.ownerCompanyName || "";

  if (!addr) {
    if (ownerCompany) {
      queries.push(`"${ownerCompany}" ejer kontakt email`);
      queries.push(`"${ownerCompany}" bestyrelse direktion email`);
    }
    return queries;
  }

  const isMultiUnit = (bbrData?.units || 0) > 1;
  const isResidential = bbrData?.usage?.toLowerCase().includes("bolig") ||
    bbrData?.usage?.toLowerCase().includes("etage") || isMultiUnit;
  const isCommercial = bbrData?.usage?.toLowerCase().includes("erhverv") ||
    bbrData?.usage?.toLowerCase().includes("kontor") ||
    bbrData?.usage?.toLowerCase().includes("butik");

  const postalPart = postal ? `"${postal}"` : "";
  const cityPart = city || "";

  // 1. OIS OWNER (most reliable!)
  if (oisOwnerName) {
    queries.push(`"${oisOwnerName}" kontakt email bestyrelse direktion`);
    queries.push(`"${oisOwnerName}" direktør CVR proff.dk`);
    queries.push(`"${oisOwnerName}" site:proff.dk OR site:cvr.dk OR site:virk.dk`);
  }

  // 2. OIS ADMINISTRATOR
  if (oisAdminName && oisAdminName !== oisOwnerName) {
    queries.push(`"${oisAdminName}" kontakt email direktør`);
  }

  // 3. Address-specific
  queries.push(`"${addr}" ${postalPart} ${cityPart} ejer`.trim());

  // 4. Ownership-type specific queries
  if (ownershipType === "andelsbolig" || ownershipType === "ejerforening" ||
      (isMultiUnit && isResidential)) {
    queries.push(`"${addr}" ejerforening andelsforening bestyrelse`.trim());
    queries.push(`"A/B ${addr}" OR "E/F ${addr}" OR "AB ${addr}"`.trim());
  } else if (isCommercial) {
    queries.push(`"${addr}" ${cityPart} virksomhed firma`.trim());
  } else if (ownershipType === "privatperson") {
    // For private owners, search for the address + owner name specifically
    queries.push(`"${addr}" ${postalPart} ejer kontakt`.trim());
  } else {
    queries.push(`"${addr}" ${postalPart} bestyrelse formand`.trim());
  }

  queries.push(`"${addr}" ${cityPart} CVR registreret`.trim());

  if (ownerCompany && !oisOwnerName) {
    queries.push(`"${ownerCompany}" ejer direktion bestyrelse email`);
  }

  if (cvrData?.owners && cvrData.owners.length > 0) {
    const ownerName = cvrData.owners[0];
    queries.push(`"${ownerName}" "${ownerCompany || addr}" email kontakt`);
  }

  if (!ownerCompany) {
    queries.push(`"${addr}" ${cityPart} ejendomsselskab ejer kontakt`.trim());
  }

  queries.push(`"${addr}" renovering stillads byggetilladelse`);

  return queries;
}

// ─── URL Selection ──────────────────────────────────────────

const SKIP_DOMAINS = [
  "wikipedia.org", "facebook.com", "linkedin.com", "twitter.com",
  "youtube.com", "google.com", "duckduckgo.com", "cvr.dk", "virk.dk",
  "boliga.dk", "dingeo.dk", "instagram.com", "tiktok.com",
  "apple.com", "microsoft.com", "adobe.com",
];

function findBestUrls(
  results: WebSearchResult[],
  companyName?: string,
  maxUrls = 5
): string[] {
  const filtered = results.filter(
    (r) =>
      r.url &&
      r.url.startsWith("http") &&
      !SKIP_DOMAINS.some((d) => r.url.includes(d))
  );

  const seen = new Set<string>();
  const unique = filtered.filter((r) => {
    try {
      const domain = new URL(r.url).hostname;
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch {
      return false;
    }
  });

  if (companyName) {
    const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9æøå]/g, "");
    unique.sort((a, b) => {
      const aMatch = a.url.toLowerCase().includes(normalizedName.substring(0, 8)) ? 1 : 0;
      const bMatch = b.url.toLowerCase().includes(normalizedName.substring(0, 8)) ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  return unique.slice(0, maxUrls).map((r) => r.url);
}

function deduplicateResults(results: WebSearchResult[]): WebSearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = r.url.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export { lookupOis } from "./ois";
export { lookupCvr, lookupCvrByAddress, lookupProff, lookupCvrBestMatch } from "./cvr";
export { lookupBbr } from "./bbr";
export { scrapeWebsite, scrapeCompanyWebsite, searchGoogle } from "./web-scraper";
