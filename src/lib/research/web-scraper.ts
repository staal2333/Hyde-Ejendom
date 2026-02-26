// ============================================================
// Web Scraper – Deep web scraping for contact info & company data
// ============================================================

import * as cheerio from "cheerio";
import { logger } from "../logger";
import { config } from "../config";
import type { WebsiteContent, WebSearchResult, CompanyPerson } from "@/types";

const MAX_TEXT_LENGTH = 5000;
const FETCH_TIMEOUT = 12000;

/**
 * Retry wrapper for flaky network calls.
 * Retries on any thrown error with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delayMs = 800
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Fetch a webpage and extract structured content.
 */
export async function scrapeWebsite(url: string): Promise<WebsiteContent | null> {
  try {
    const html = await fetchPage(url);
    if (!html) return null;

    const $ = cheerio.load(html);

    // Remove noise
    $("script, style, nav:not(:has(a[href*='kontakt'])):not(:has(a[href*='contact'])), iframe, noscript, svg, .cookie-banner, #cookie-consent, .cookie-notice, [class*='cookie'], [id*='cookie']").remove();

    const title = $("title").text().trim() || "";
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    // Extract emails from mailto: links FIRST (highest quality)
    const mailtoEmails: string[] = [];
    $("a[href^='mailto:']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const email = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
      if (email && email.includes("@")) mailtoEmails.push(email);
    });

    // Extract emails from text/HTML (regex)
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const regexEmails = [...new Set((html.match(emailRegex) || []))];

    // Combine and filter
    const allEmails = [...new Set([...mailtoEmails, ...regexEmails])].filter(
      (e) =>
        !e.includes("example.com") &&
        !e.includes("sentry") &&
        !e.endsWith(".png") &&
        !e.endsWith(".jpg") &&
        !e.endsWith(".svg") &&
        !e.endsWith(".gif") &&
        !e.includes("wixpress") &&
        !e.includes("webpack") &&
        !e.includes("cloudflare") &&
        !e.includes("w3.org") &&
        !e.includes("schema.org") &&
        !e.includes("noreply") &&
        !e.includes("no-reply") &&
        e.length < 60 &&
        e.length > 5
    );

    // Extract phone numbers (Danish format – improved)
    const phoneRegex = /(?:\+45[\s-]?)?(?:\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}|\d{8})/g;
    const phones = [...new Set((bodyText.match(phoneRegex) || []))]
      .filter((p) => p.replace(/\D/g, "").length >= 8)
      .slice(0, 8);

    // Extract people names (Danish name patterns)
    const nameRegex = /(?:^|\s)((?:[A-ZÆØÅ][a-zæøå]+)\s+(?:[A-ZÆØÅ][a-zæøå]+(?:\s+[A-ZÆØÅ][a-zæøå]+)?))/g;
    const potentialNames: string[] = [];
    let nameMatch;
    while ((nameMatch = nameRegex.exec(bodyText)) !== null) {
      const name = nameMatch[1].trim();
      if (name.length > 5 && name.length < 50) {
        potentialNames.push(name);
      }
    }

    // Get relevant text snippets
    const relevantSnippets: string[] = [];

    // Contact sections
    const contactSelectors = [
      "*:contains('kontakt')", "*:contains('Kontakt')",
      "*:contains('contact')", "*:contains('Contact')",
      "*:contains('bestyrelse')", "*:contains('Bestyrelse')",
      "*:contains('direktion')", "*:contains('Direktion')",
      "*:contains('ledelse')", "*:contains('Ledelse')",
      "*:contains('medarbejder')", "*:contains('team')",
      "*:contains('administrator')", "*:contains('Administrator')",
    ];

    for (const selector of contactSelectors) {
      $(selector).each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (text.length > 30 && text.length < 1500) {
          relevantSnippets.push(text.substring(0, 600));
        }
      });
    }

    // Also extract structured data if available
    $('[itemtype*="Person"], [itemtype*="Organization"], .vcard, .team-member, .staff-member, .board-member').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 10 && text.length < 800) {
        relevantSnippets.push(text.substring(0, 500));
      }
    });

    const people = extractPeopleFromHtml(html, url);

    return {
      url,
      title,
      emails: allEmails,
      phones,
      names: [...new Set(potentialNames)].slice(0, 20),
      people: people.length > 0 ? people : undefined,
      relevantSnippets: [...new Set(relevantSnippets)].slice(0, 10),
      contactPageText: bodyText.substring(0, MAX_TEXT_LENGTH),
    };
  } catch (error) {
    logger.error(`Failed to scrape ${url}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Deep-scrape a company website: root + contact + about + team + board pages.
 */
export async function scrapeCompanyWebsite(
  rootUrl: string
): Promise<WebsiteContent | null> {
  try {
    const rootContent = await scrapeWebsite(rootUrl);
    if (!rootContent) return null;

    const html = await fetchPage(rootUrl);
    if (!html) return rootContent;

    const $ = cheerio.load(html);
    const baseUrl = new URL(rootUrl).origin;

    // Find all relevant sub-pages
    const subPages: { type: string; urls: string[] }[] = [
      { type: "contact", urls: [] },
      { type: "about", urls: [] },
      { type: "team", urls: [] },
      { type: "board", urls: [] },
    ];

    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().toLowerCase();
      const fullUrl = resolveUrl(href, baseUrl);

      if (!fullUrl.startsWith("http")) return;

      if (text.includes("kontakt") || text.includes("contact") || href.includes("kontakt") || href.includes("contact")) {
        subPages[0].urls.push(fullUrl);
      }
      if (text.includes("om os") || text.includes("about") || href.includes("om-os") || href.includes("about")) {
        subPages[1].urls.push(fullUrl);
      }
      if (text.includes("team") || text.includes("medarbejder") || href.includes("team") || href.includes("staff")) {
        subPages[2].urls.push(fullUrl);
      }
      if (text.includes("bestyrelse") || text.includes("board") || text.includes("ledelse") || href.includes("bestyrelse") || href.includes("board")) {
        subPages[3].urls.push(fullUrl);
      }
    });

    // Scrape up to 5 sub-pages
    let contactPageText = rootContent.contactPageText;
    let aboutPageText: string | undefined;
    let scraped = 0;

    for (const { type, urls } of subPages) {
      if (scraped >= 5 || urls.length === 0) continue;

      const url = urls[0];
      if (url === rootUrl) continue;

      const content = await scrapeWebsite(url);
      scraped++;

      if (!content) continue;

      rootContent.emails.push(...content.emails);
      rootContent.phones.push(...content.phones);
      rootContent.relevantSnippets.push(...content.relevantSnippets);
      if (content.people) {
        if (!rootContent.people) rootContent.people = [];
        for (const p of content.people) {
          if (!rootContent.people.some(ep => ep.name.toLowerCase() === p.name.toLowerCase())) {
            rootContent.people.push(p);
          }
        }
      }

      if (type === "contact") {
        contactPageText = content.contactPageText;
      } else if (type === "about") {
        aboutPageText = content.contactPageText;
      }
    }

    const allPeople = rootContent.people || [];

    return {
      ...rootContent,
      contactPageText,
      aboutPageText,
      emails: [...new Set(rootContent.emails)],
      phones: [...new Set(rootContent.phones)],
      people: allPeople.length > 0 ? allPeople : undefined,
      relevantSnippets: [...new Set(rootContent.relevantSnippets)].slice(0, 12),
    };
  } catch (error) {
    logger.error(`Failed to scrape company website ${rootUrl}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Search using SearchAPI.io (Google backend) — works reliably on Vercel.
 * Falls back to DuckDuckGo HTML scraping if no API key is configured.
 */
export async function searchGoogle(
  query: string,
  numResults = 5
): Promise<WebSearchResult[]> {
  const apiKey = config.searchApi.apiKey();

  if (apiKey) {
    return searchViaSearchApi(query, numResults, apiKey);
  }

  // Fallback: DuckDuckGo (may be blocked on Vercel)
  logger.warn("SEARCHAPI_API_KEY not configured – falling back to DuckDuckGo (may fail on Vercel)");
  return searchViaDuckDuckGo(query, numResults);
}

async function searchViaSearchApi(
  query: string,
  numResults: number,
  apiKey: string
): Promise<WebSearchResult[]> {
  try {
    const url = `https://www.searchapi.io/api/v1/search?engine=google&q=${encodeURIComponent(query)}&num=${numResults}&api_key=${apiKey}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      logger.error(`SearchAPI.io error ${res.status}: ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    const organicResults = data.organic_results ?? [];

    return organicResults.slice(0, numResults).map((r: { title?: string; link?: string; snippet?: string }) => ({
      title: r.title ?? "",
      url: r.link ?? "",
      snippet: r.snippet ?? "",
    })).filter((r: WebSearchResult) => r.title && r.url);
  } catch (error) {
    logger.error(`SearchAPI.io search failed: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

async function searchViaDuckDuckGo(
  query: string,
  numResults: number
): Promise<WebSearchResult[]> {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const html = await fetchPage(searchUrl);
    if (!html) return [];

    const $ = cheerio.load(html);
    const results: WebSearchResult[] = [];

    $(".result").each((i, el) => {
      if (i >= numResults) return false;

      const titleEl = $(el).find(".result__title a, .result__a");
      const snippetEl = $(el).find(".result__snippet");

      const title = titleEl.text().trim();
      let url = titleEl.attr("href") || "";
      const snippet = snippetEl.text().trim();

      if (url.includes("uddg=")) {
        try {
          url = decodeURIComponent(url.split("uddg=")[1]?.split("&")[0] || url);
        } catch {
          // keep original
        }
      }

      if (title && url) results.push({ title, url, snippet });
    });

    return results;
  } catch (error) {
    logger.error(`DuckDuckGo search failed: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

// ─── People Extraction ──────────────────────────────────────

const ROLE_PATTERNS = [
  "Adm\\.?\\s*direktør", "Direktør", "Bestyrelsesformand", "Bestyrelsesmedlem",
  "CEO", "CFO", "COO", "CTO", "CMO", "Managing Director",
  "Indehaver", "Ejer", "Partner", "Stifter", "Founder",
  "Driftschef", "Driftsleder", "Økonomichef", "Salgschef",
  "Marketingchef", "Marketingdirektør", "Salgsdirektør",
  "Forretningsfører", "Viceadm\\.?\\s*direktør", "Vicedirektør",
  "Projektleder", "Afdelingsleder", "Kontorchef",
  "Head of \\w+", "Director of \\w+", "VP \\w+",
];

const ROLE_GROUP = ROLE_PATTERNS.join("|");
const DANISH_NAME = "[A-ZÆØÅ][a-zæøåé]+(?:\\s+[A-ZÆØÅ][a-zæøåé]+){1,3}";

/**
 * Extract people with roles from website HTML.
 * Matches name+role pairs via multiple patterns and DOM proximity.
 */
export function extractPeopleFromHtml(html: string, pageUrl?: string): CompanyPerson[] {
  const people: CompanyPerson[] = [];
  const seen = new Set<string>();

  const addPerson = (name: string, role: string, email?: string, phone?: string) => {
    const key = name.toLowerCase();
    if (seen.has(key) || name.length < 5) return;
    seen.add(key);
    people.push({ name, role, email, phone, source: pageUrl ? `Website: ${pageUrl}` : "Website" });
  };

  const textContent = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

  // Pattern 1: Role followed by name
  const p1 = new RegExp(`(${ROLE_GROUP})\\s*[:\\-–,]?\\s*(${DANISH_NAME})`, "gi");
  for (const m of textContent.matchAll(p1)) {
    addPerson(m[2].trim(), m[1].trim());
  }

  // Pattern 2: Name followed by role
  const p2 = new RegExp(`(${DANISH_NAME})\\s*[,\\-–|]\\s*(${ROLE_GROUP})`, "gi");
  for (const m of textContent.matchAll(p2)) {
    addPerson(m[1].trim(), m[2].trim());
  }

  // Pattern 3: Cheerio-based DOM extraction for structured cards
  try {
    const $ = cheerio.load(html);
    const cardSelectors = [
      ".team-member", ".staff-member", ".board-member",
      ".person", ".employee", ".member", ".leadership",
      '[itemtype*="Person"]', ".vcard",
      ".wp-block-group", ".elementor-widget-team-member",
    ];

    for (const sel of cardSelectors) {
      $(sel).each((_, el) => {
        const card = $(el);
        const text = card.text().replace(/\s+/g, " ").trim();
        if (text.length < 5 || text.length > 500) return;

        // Try to find name (usually in heading or strong)
        const nameEl = card.find("h2, h3, h4, h5, strong, .name, .title").first();
        let name = nameEl.text().trim();
        if (!name || name.length < 4) return;
        name = name.replace(/[,\-–|].*$/, "").trim();

        // Try to find role
        let role = "";
        card.find("p, span, .position, .role, .job-title, .subtitle").each((_, roleEl) => {
          const roleText = $(roleEl).text().trim();
          const roleMatch = roleText.match(new RegExp(`(${ROLE_GROUP})`, "i"));
          if (roleMatch && !role) role = roleMatch[1];
        });

        // Try email within the card
        let email: string | undefined;
        card.find("a[href^='mailto:']").each((_, a) => {
          const href = $(a).attr("href") || "";
          const e = href.replace(/^mailto:/i, "").split("?")[0].trim().toLowerCase();
          if (e.includes("@")) email = e;
        });

        // Try phone within the card
        let phone: string | undefined;
        const phoneMatch = text.match(/(?:\+45[\s-]?)?(?:\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})/);
        if (phoneMatch) phone = phoneMatch[0];

        if (name.match(/^[A-ZÆØÅ]/) && name.split(/\s+/).length >= 2) {
          addPerson(name, role || "Ukendt", email, phone);
        }
      });
    }
  } catch { /* cheerio parsing failure is non-fatal */ }

  return people;
}

// ─── Helpers ────────────────────────────────────────────────

async function fetchPage(url: string, retries = 2): Promise<string | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        return null;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
        return null;
      }

      return await response.text();
    } catch {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      return null;
    }
  }
  return null;
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}
