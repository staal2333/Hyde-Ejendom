// ============================================================
// OOH Google Slides Service – Proposal document generation
// Copies template, replaces placeholder images with mockup
// ============================================================

import { google } from "googleapis";
import { config } from "../config";
import type { MockupPlacement } from "./types";

// Lazy singleton
let _slides: ReturnType<typeof google.slides> | null = null;

function getSlidesClient() {
  if (!_slides) {
    const clientId = config.gmail.clientId();
    const clientSecret = config.gmail.clientSecret();
    const refreshToken = config.gmail.refreshToken();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Google API not configured.");
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });
    _slides = google.slides({ version: "v1", auth: oauth2Client });
  }

  return _slides;
}

/**
 * Replace text placeholders in a Slides presentation.
 * Common placeholders: {{CLIENT_NAME}}, {{ADDRESS}}, {{DATE}}, {{PRICE}}
 */
export async function replaceTextPlaceholders(
  slidesId: string,
  replacements: Record<string, string>
): Promise<void> {
  const slides = getSlidesClient();

  const requests = Object.entries(replacements).map(([placeholder, text]) => ({
    replaceAllText: {
      containsText: { text: placeholder, matchCase: false },
      replaceText: text,
    },
  }));

  if (requests.length === 0) return;

  await slides.presentations.batchUpdate({
    presentationId: slidesId,
    requestBody: { requests },
  });
}

/**
 * Replace an image placeholder in a specific slide.
 * The placeholder should be an image element with a known alt text or object ID.
 */
export async function replaceImageInSlide(
  slidesId: string,
  imageUrl: string,
  pageElementId?: string,
  slideIndex?: number
): Promise<void> {
  const slides = getSlidesClient();

  // If we have a specific element ID, use replaceImage
  if (pageElementId) {
    await slides.presentations.batchUpdate({
      presentationId: slidesId,
      requestBody: {
        requests: [
          {
            replaceImage: {
              imageObjectId: pageElementId,
              url: imageUrl,
              imageReplaceMethod: "CENTER_INSIDE",
            },
          },
        ],
      },
    });
    return;
  }

  // Otherwise, find the first image on the specified slide and replace it
  if (slideIndex !== undefined) {
    const presentation = await slides.presentations.get({
      presentationId: slidesId,
    });

    const slide = presentation.data.slides?.[slideIndex];
    if (!slide) throw new Error(`Slide at index ${slideIndex} not found`);

    // Find image elements on this slide
    const imageElement = slide.pageElements?.find(
      (el) => el.image || el.shape?.placeholder?.type === "BODY"
    );

    if (imageElement?.objectId) {
      await slides.presentations.batchUpdate({
        presentationId: slidesId,
        requestBody: {
          requests: [
            {
              replaceImage: {
                imageObjectId: imageElement.objectId,
                url: imageUrl,
                imageReplaceMethod: "CENTER_INSIDE",
              },
            },
          ],
        },
      });
    }
  }
}

/**
 * Apply mockup placements to a slides presentation.
 * Places the mockup image at configured positions in the template.
 */
export async function applyMockupPlacements(
  slidesId: string,
  mockupImageUrl: string,
  placements: MockupPlacement[]
): Promise<void> {
  for (const placement of placements) {
    try {
      await replaceImageInSlide(
        slidesId,
        mockupImageUrl,
        placement.pageElementName,
        placement.slideIndex
      );
    } catch (e) {
      console.warn(
        `[Slides] Failed to place mockup at slide ${placement.slideIndex}: ${e}`
      );
    }
  }
}

/**
 * Get the URL of a Google Slides presentation.
 */
export function getSlidesUrl(slidesId: string): string {
  return `https://docs.google.com/presentation/d/${slidesId}/edit`;
}
