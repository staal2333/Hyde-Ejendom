// ============================================================
// POST /api/ooh/batch-mockup – Generate mockups for multiple frames
// Body: { frameIds: string[], creativeId: string, format?: "jpg" | "png" }
// Returns SSE stream with progress + results
// ============================================================

export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getFrame, getCreative, seedDemoData } from "@/lib/ooh/store";
import { compositeMultiplePlacements } from "@/lib/ooh/image-processor";
import { loadImageBuffer } from "@/lib/ooh/load-image";
import sharp from "sharp";

let seeded = false;
function ensureSeeded() {
  if (!seeded) { seedDemoData(); seeded = true; }
}

export async function POST(req: NextRequest) {
  ensureSeeded();

  const body = await req.json();
  const { frameIds, creativeId, format = "jpg" } = body as {
    frameIds: string[];
    creativeId: string;
    format?: "jpg" | "png";
  };

  if (!frameIds?.length || !creativeId) {
    return new Response(JSON.stringify({ error: "frameIds[] and creativeId are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const creative = await getCreative(creativeId);
  if (!creative) {
    return new Response(JSON.stringify({ error: "Creative not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Load creative buffer once
  let creativeBuffer: Buffer;
  if (creative.thumbnailUrl) {
    creativeBuffer = await loadImageBuffer(creative.thumbnailUrl);
  } else {
    return new Response(JSON.stringify({ error: "Creative has no image" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
      };

      const results: { frameId: string; frameName: string; success: boolean; mockupBase64?: string; error?: string }[] = [];
      const total = frameIds.length;

      for (let i = 0; i < total; i++) {
        const frameId = frameIds[i];
        const frame = await getFrame(frameId);

        if (!frame) {
          results.push({ frameId, frameName: "?", success: false, error: "Frame not found" });
          send({ progress: Math.round(((i + 1) / total) * 100), current: i + 1, total, frameId, frameName: "?", status: "error", error: "Frame not found" });
          continue;
        }

        send({ progress: Math.round((i / total) * 100), current: i + 1, total, frameId, frameName: frame.name, status: "processing" });

        try {
          const frameBuffer = await loadImageBuffer(frame.frameImageUrl);

          const placements = frame.placements?.length > 0 ? frame.placements : [frame.placement];
          const assignments = placements.map(p => ({ placement: p, creativeBuffer }));
          let mockupBuffer = await compositeMultiplePlacements(
            frameBuffer, assignments, frame.frameWidth, frame.frameHeight
          );

          if (format === "png") {
            mockupBuffer = await sharp(mockupBuffer).png().toBuffer();
          } else {
            mockupBuffer = await sharp(mockupBuffer).jpeg({ quality: 92 }).toBuffer();
          }

          const mimeType = format === "png" ? "image/png" : "image/jpeg";
          const base64 = `data:${mimeType};base64,${mockupBuffer.toString("base64")}`;

          results.push({ frameId, frameName: frame.name, success: true, mockupBase64: base64 });
          send({ progress: Math.round(((i + 1) / total) * 100), current: i + 1, total, frameId, frameName: frame.name, status: "done" });
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error";
          results.push({ frameId, frameName: frame.name, success: false, error: msg });
          send({ progress: Math.round(((i + 1) / total) * 100), current: i + 1, total, frameId, frameName: frame.name, status: "error", error: msg });
        }
      }

      send({ progress: 100, done: true, results: results.map(r => ({ frameId: r.frameId, frameName: r.frameName, success: r.success, error: r.error })) });
      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
