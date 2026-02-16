// ============================================================
// Web Scraper – Deep web scraping for contact info & company data
// ============================================================

import * as cheerio from "cheerio";
import type { WebsiteContent, WebSearchResult } from "@/types";

const MAX_TEXT_LENGTH = 5000;
const FETCH_TIMEOUT = 12000;

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

    return {
      url,
      title,
      emails: allEmails,
      phones,
      relevantSnippets: [...new Set(relevantSnippets)].slice(0, 10),
      contactPageText: bodyText.substring(0, MAX_TEXT_LENGTH),
    };
  } catch (error) {
    console.error(`Failed to scrape ${url}:`, error);
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

      if (type === "contact") {
        contactPageText = content.contactPageText;
      } else if (type === "about") {
        aboutPageText = content.contactPageText;
      }
    }

    return {
      ...rootContent,
      contactPageText,
      aboutPageText,
      emails: [...new Set(rootContent.emails)],
      phones: [...new Set(rootContent.phones)],
      relevantSnippets: [...new Set(rootContent.relevantSnippets)].slice(0, 12),
    };
  } catch (error) {
    console.error(`Failed to scrape company website ${rootUrl}:`, error);
    return null;
  }
}

/**
 * Search using DuckDuckGo HTML.
 */
export async function searchGoogle(
  query: string,
  numResults = 5
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

      // DuckDuckGo wraps URLs
      if (url.includes("uddg=")) {
        try {
          url = decodeURIComponent(
            url.split("uddg=")[1]?.split("&")[0] || url
          );
        } catch {
          // keep original
        }
      }

      if (title && url) {
        results.push({ title, url, snippet });
      }
    });

    return results;
  } catch (error) {
    console.error("Search failed:", error);
    return [];
  }
}

// ─── Helpers ────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string | null> {
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

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}
