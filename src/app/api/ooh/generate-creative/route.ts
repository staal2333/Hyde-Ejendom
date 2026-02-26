// ============================================================
// POST /api/ooh/generate-creative
// Generate an OOH billboard ad creative using DALL-E 3.
// Downloads the image and saves it as a Creative in the OOH library.
//
// Body:
//   companyName  string  – e.g. "IKEA" or "Matas"
//   industry     string  – e.g. "retail", "restaurant", "fitness"
//   style        string  – "minimal" | "bold" | "photo" | "luxury"
//   tagline      string  – optional tagline / headline
//   format       string  – "landscape" (default) | "portrait" | "square"
//   colors       string  – optional color hints, e.g. "blue and white"
//   language     string  – "da" (default) | "en"
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supabase, HAS_SUPABASE, OOH_BUCKET } from "@/lib/supabase";
import { upsertCreative } from "@/lib/ooh/store";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const STYLE_GUIDES: Record<string, string> = {
  minimal:
    "Minimalist Scandinavian design. White or light background. One strong visual element. Large, clean sans-serif typography. Lots of white space. Sophisticated and modern.",
  bold:
    "Bold, high-impact design. Strong contrasting colors. Large typography that commands attention. Graphic shapes and patterns. High energy.",
  photo:
    "Photographic style. Lifestyle photography as background. People using or enjoying the product/service. Clean text overlay with strong contrast. Aspirational mood.",
  luxury:
    "Luxury premium aesthetic. Dark or rich background (navy, black, deep green). Gold or metallic accents. Elegant serif or thin sans-serif font. Understated yet powerful.",
};

const FORMAT_SIZES: Record<string, OpenAI.ImageGenerateParams["size"]> = {
  landscape: "1792x1024",
  portrait: "1024x1792",
  square: "1024x1024",
};

function buildDallePrompt(params: {
  companyName: string;
  industry: string;
  style: string;
  tagline?: string;
  colors?: string;
  language: string;
}): string {
  const { companyName, industry, style, tagline, colors, language } = params;
  const styleGuide = STYLE_GUIDES[style] || STYLE_GUIDES.minimal;
  const langNote = language === "da"
    ? "Text on the billboard should be in Danish."
    : "Text on the billboard should be in English.";

  const colorNote = colors
    ? `Brand color palette: ${colors}.`
    : "";

  const taglineNote = tagline
    ? `The main headline or tagline is: "${tagline}". Feature this prominently.`
    : `Create a short, compelling headline for ${companyName} in the ${industry} industry.`;

  return `Create a professional, print-ready OUTDOOR BILLBOARD advertisement for "${companyName}", a ${industry} company.

DESIGN STYLE: ${styleGuide}

REQUIREMENTS:
- This is a LARGE FORMAT OUTDOOR BILLBOARD (not a social media post or web banner)
- The design must be instantly readable from 50+ meters away
- Maximum 2-3 lines of text total
- Company name "${companyName}" must be clearly visible
- ${taglineNote}
- ${colorNote}
- ${langNote}
- No stock photo watermarks, no lorem ipsum, no placeholder text
- Professional advertising agency quality
- Clean composition with clear visual hierarchy
- High contrast between text and background for outdoor legibility

OUTPUT: A single billboard advertisement image. No frames, borders, or mock-up context – just the clean billboard artwork itself.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      companyName,
      industry = "virksomhed",
      style = "minimal",
      tagline,
      format = "landscape",
      colors,
      language = "da",
    } = body;

    if (!companyName?.trim()) {
      return NextResponse.json({ error: "companyName is required" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    const prompt = buildDallePrompt({
      companyName: companyName.trim(),
      industry,
      style,
      tagline: tagline?.trim() || undefined,
      colors: colors?.trim() || undefined,
      language,
    });

    logger.info(`[generate-creative] Generating DALL-E 3 image for "${companyName}" (${style}, ${format})`, { service: "ooh-creative" });

    // Generate image with DALL-E 3 in base64 format so we can re-host it
    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: FORMAT_SIZES[format] || "1792x1024",
      quality: "standard",
      response_format: "b64_json",
    });

    const b64 = imageResponse.data?.[0]?.b64_json;
    const revisedPrompt = imageResponse.data?.[0]?.revised_prompt;

    if (!b64) {
      throw new Error("DALL-E 3 returned no image data");
    }

    const imageBuffer = Buffer.from(b64, "base64");
    const safeName = companyName.trim().toLowerCase().replace(/[^a-z0-9]/g, "-");
    const filename = `ai-${safeName}-${Date.now()}.png`;

    // Upload to Supabase Storage or local filesystem (same logic as /api/ooh/upload)
    let publicUrl: string;

    if (HAS_SUPABASE) {
      const storagePath = `creatives/${filename}`;
      const { error } = await supabase!.storage
        .from(OOH_BUCKET)
        .upload(storagePath, imageBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (error) {
        throw new Error(`Storage upload failed: ${error.message}`);
      }

      const { data: urlData } = supabase!.storage
        .from(OOH_BUCKET)
        .getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
    } else {
      // Local dev: save to public folder
      const { writeFile, mkdir } = await import("fs/promises");
      const path = await import("path");
      const dir = path.join(process.cwd(), "public", "ooh", "creatives");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), new Uint8Array(imageBuffer));
      publicUrl = `/ooh/creatives/${filename}`;
    }

    // Get image dimensions
    let width: number | undefined;
    let height: number | undefined;
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(imageBuffer).metadata();
      width = meta.width;
      height = meta.height;
    } catch { /* sharp optional */ }

    // Save as a Creative in the OOH library
    const creative = {
      id: `cre_ai_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      filename,
      driveFileId: undefined,
      driveFolderId: undefined,
      companyName: companyName.trim(),
      companyId: undefined,
      campaignName: tagline?.trim() || `AI-genereret ${style}`,
      mimeType: "image/png",
      fileSize: imageBuffer.length,
      width: width || undefined,
      height: height || undefined,
      thumbnailUrl: publicUrl,
      tags: ["ai-genereret", style, industry],
      category: "ai",
      colorProfile: colors || undefined,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertCreative(creative);

    logger.info(`[generate-creative] Created creative "${creative.id}" for "${companyName}"`, { service: "ooh-creative" });

    return NextResponse.json({
      ok: true,
      creative,
      imageUrl: publicUrl,
      revisedPrompt,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    logger.error(`[generate-creative] ${msg}`, { service: "ooh-creative" });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
