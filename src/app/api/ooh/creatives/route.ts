import { NextRequest, NextResponse } from "next/server";
import { getCreatives, upsertCreative, deleteCreative } from "@/lib/ooh/store";
import type { Creative } from "@/lib/ooh/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q") || undefined;
    const company = searchParams.get("company") || undefined;
    const tags = searchParams.getAll("tags");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = parseInt(searchParams.get("offset") || "0");

    const result = await getCreatives({ q, company, tags: tags.length ? tags : undefined, limit, offset });
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[creatives]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Validate required fields
    if (!body.filename && !body.companyName) {
      return NextResponse.json(
        { error: "filename or companyName is required" },
        { status: 400 }
      );
    }

    const creative: Creative = {
      id: `cre_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      filename: body.filename || "untitled",
      driveFileId: body.driveFileId || null,
      driveFolderId: body.driveFolderId || null,
      companyName: body.companyName || "Unknown",
      companyId: body.companyId || null,
      campaignName: body.campaignName || null,
      mimeType: body.mimeType || null,
      fileSize: body.fileSize || null,
      width: body.width || null,
      height: body.height || null,
      thumbnailUrl: body.thumbnailUrl || null,
      tags: body.tags || [],
      category: body.category || null,
      colorProfile: body.colorProfile || null,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertCreative(creative);
    return NextResponse.json(creative, { status: 201 });
  } catch (error: unknown) {
    // Handle Supabase errors (which are plain objects, not Error instances)
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: string }).message)
          : JSON.stringify(error);
    console.error("[creatives] POST error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/ooh/creatives?id=xxx – Delete a creative */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existed = await deleteCreative(id);
    if (!existed) return NextResponse.json({ error: "Creative not found" }, { status: 404 });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[creatives]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
