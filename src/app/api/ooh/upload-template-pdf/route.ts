// ============================================================
// POST /api/ooh/upload-template-pdf – Upload a PDF template file
// Uses Supabase Storage when configured,
// otherwise falls back to local filesystem (dev).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabase, HAS_SUPABASE, OOH_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .toLowerCase();
    const filename = `${Date.now()}-${safeName}`;

    let publicUrl: string;

    if (HAS_SUPABASE) {
      // ── Supabase Storage ──
      const storagePath = `templates/${filename}`;
      const { error } = await supabase!.storage
        .from(OOH_BUCKET)
        .upload(storagePath, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (error) throw error;

      const { data: urlData } = supabase!.storage
        .from(OOH_BUCKET)
        .getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
    } else {
      // ── Local filesystem fallback ──
      const { writeFile, mkdir } = await import("fs/promises");
      const path = await import("path");
      const dir = path.join(process.cwd(), "public", "ooh", "templates");
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), new Uint8Array(buffer));
      publicUrl = `/ooh/templates/${filename}`;
    }

    // Get page count using pdf-lib
    let pageCount = 0;
    try {
      const { PDFDocument } = await import("pdf-lib");
      const pdfDoc = await PDFDocument.load(buffer);
      pageCount = pdfDoc.getPageCount();
    } catch (e) {
      console.error("[upload-template-pdf] Could not read PDF:", e);
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: buffer.length,
      pageCount,
    });
  } catch (error) {
    console.error("[upload-template-pdf] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
