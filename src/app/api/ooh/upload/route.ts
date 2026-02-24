// ============================================================
// POST /api/ooh/upload – Upload frame or creative image
// Uses Supabase Storage when configured,
// otherwise falls back to local filesystem (dev).
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabase, HAS_SUPABASE, OOH_BUCKET } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .toLowerCase();
    const filename = `${Date.now()}-${safeName}`;
    const subdir = type === "frame" ? "frames" : "creatives";

    let publicUrl: string;

    if (HAS_SUPABASE) {
      const storagePath = `${subdir}/${filename}`;
      const { error } = await supabase!.storage
        .from(OOH_BUCKET)
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: true,
        });
      if (error) {
        logger.error(`Supabase storage upload failed: ${error.message}`, { service: "upload" });
        return NextResponse.json({ error: `Storage upload failed: ${error.message}` }, { status: 500 });
      }

      const { data: urlData } = supabase!.storage
        .from(OOH_BUCKET)
        .getPublicUrl(storagePath);
      publicUrl = urlData.publicUrl;
    } else {
      const { writeFile, mkdir } = await import("fs/promises");
      const path = await import("path");
      const dir = path.join(process.cwd(), "public", "ooh", subdir);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, filename), new Uint8Array(buffer));
      publicUrl = `/ooh/${subdir}/${filename}`;
    }

    let width: number | undefined;
    let height: number | undefined;
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(buffer).metadata();
      width = meta.width;
      height = meta.height;
    } catch {
      // sharp may not be available – dimensions will be undefined
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: buffer.length,
      width,
      height,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Upload failed";
    logger.error(`Upload error: ${msg}`, { service: "upload" });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
