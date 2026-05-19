// ============================================================
// POST /api/case/invoice-scan
// Receives a PDF/image upload, extracts structured invoice data
// via OpenAI, and returns a roll-up that maps to case cost fields.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { scanInvoiceFile, rollupForCase } from "@/lib/case/invoice-scan";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Ingen fil modtaget" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Filen er for stor (max ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }

    const mime = file.type || "application/octet-stream";
    if (!ALLOWED.has(mime) && !file.name.toLowerCase().match(/\.(pdf|jpe?g|png|webp)$/)) {
      return NextResponse.json(
        { error: `Filtype understøttes ikke: ${mime}. Brug PDF, JPG eller PNG.` },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await scanInvoiceFile(buffer, mime, file.name);
    const rollup = rollupForCase(result);

    return NextResponse.json({
      success: true,
      result,
      rollup,
    });
  } catch (error) {
    logger.error(`[invoice-scan] ${error instanceof Error ? error.message : error}`, {
      service: "case",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan fejlede" },
      { status: 500 }
    );
  }
}
