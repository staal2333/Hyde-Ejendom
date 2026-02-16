// ============================================================
// POST /api/ooh/download-mockup – Generate and download mockup image
// Body: { frameId, creativeId, format?: "png" | "jpg", creativeAssignments?: Record<number, string> }
// Returns the image as a downloadable file
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getFrame, getCreative, seedDemoData } from "@/lib/ooh/store";
import { compositeMultiplePlacements } from "@/lib/ooh/image-processor";
import { loadImageBuffer } from "@/lib/ooh/load-image";
import type { PlacementConfig } from "@/lib/ooh/types";
import sharp from "sharp";

let seeded = false;
function ensureSeeded() {
  if (!seeded) { seedDemoData(); seeded = true; }
}

export async function POST(req: NextRequest) {
  ensureSeeded();

  try {
    const body = await req.json();
    const { frameId, creativeId, format = "png", creativeAssignments, framePlacements } = body as {
      frameId: string;
      creativeId: string;
      format?: "png" | "jpg";
      creativeAssignments?: Record<number, string>;
      framePlacements?: PlacementConfig[];
    };

    const frame = await getFrame(frameId);
    if (!frame) return NextResponse.json({ error: `Frame '${frameId}' not found in store` }, { status: 404 });

    const creative = await getCreative(creativeId);
    if (!creative) return NextResponse.json({ error: `Creative '${creativeId}' not found in store` }, { status: 404 });

    // Load images
    const frameBuffer = await loadImageBuffer(frame.frameImageUrl);
    if (!creative.thumbnailUrl) {
      return NextResponse.json({ error: "Creative has no image source" }, { status: 400 });
    }
    const mainCreativeBuffer = await loadImageBuffer(creative.thumbnailUrl);

    // Use client-provided placements (most up-to-date) or fall back to DB
    const placements: PlacementConfig[] =
      (Array.isArray(framePlacements) && framePlacements.length > 0)
        ? framePlacements
        : (frame.placements?.length > 0 ? frame.placements : [frame.placement]);
    const assignments: { placement: PlacementConfig; creativeBuffer: Buffer }[] = [];

    for (let i = 0; i < placements.length; i++) {
      const cId = creativeAssignments?.[i] || creativeId;
      if (!cId) continue;
      const creative_i = cId === creativeId
        ? mainCreativeBuffer
        : await loadImageBuffer((await getCreative(cId))?.thumbnailUrl || "");
      assignments.push({ placement: placements[i], creativeBuffer: creative_i });
    }

    // Generate mockup with all placements
    let mockupBuffer = await compositeMultiplePlacements(
      frameBuffer, assignments, frame.frameWidth, frame.frameHeight
    );

    let mimeType: string;
    let ext: string;
    if (format === "png") {
      mockupBuffer = await sharp(mockupBuffer).png().toBuffer();
      mimeType = "image/png";
      ext = "png";
    } else {
      mockupBuffer = await sharp(mockupBuffer).jpeg({ quality: 92 }).toBuffer();
      mimeType = "image/jpeg";
      ext = "jpg";
    }

    const filename = `Mockup-${frame.name.replace(/\s+/g, "-")}-${creative.companyName.replace(/\s+/g, "-")}.${ext}`;

    return new NextResponse(new Uint8Array(mockupBuffer), {
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(mockupBuffer.length),
      },
    });
  } catch (error) {
    console.error("[download-mockup] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error generating mockup" },
      { status: 500 }
    );
  }
}
