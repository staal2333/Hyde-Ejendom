// ============================================================
// Area Discovery – Find properties in one or more postcodes
// POST /api/discover-area → SSE stream with live progress
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { discoverArea } from "@/lib/discovery";
import type { DiscoveryProgress } from "@/lib/discovery";

/**
 * POST /api/discover-area
 * Body: { postcodes: string[], city?: string, minScore?, maxAddresses?, maxCandidates? }
 * postcodes: e.g. ["1050", "1051"] or "1050, 1051"
 * maxCandidates: limit returned/staged to top N by score; 0 = all.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let postcodes = body.postcodes;
    const city = body.city ?? "";
    const minScore = typeof body.minScore === "number" ? body.minScore : 6;
    const maxAddresses = typeof body.maxAddresses === "number" && body.maxAddresses > 0
      ? Math.min(1000, Math.round(body.maxAddresses))
      : 500;
    const maxCandidates = typeof body.maxCandidates === "number" && body.maxCandidates > 0
      ? Math.min(500, Math.round(body.maxCandidates))
      : 0;

    if (Array.isArray(postcodes)) {
      postcodes = postcodes.map((p) => String(p).trim()).filter(Boolean);
    } else if (typeof postcodes === "string") {
      postcodes = postcodes.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
    } else {
      postcodes = [];
    }

    if (postcodes.length === 0) {
      return NextResponse.json(
        { error: "postcodes is required (array or comma-separated string)" },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let cancelled = false;

        const send = (event: DiscoveryProgress) => {
          if (cancelled) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            cancelled = true;
          }
        };

        const isCancelled = () => cancelled;

        try {
          const result = await discoverArea(
            postcodes,
            city,
            minScore,
            maxAddresses,
            send,
            isCancelled
          );

          if (!cancelled) {
            const candidates = maxCandidates > 0 && result.candidates.length > maxCandidates
              ? result.candidates.slice(0, maxCandidates)
              : result.candidates;
            const resultLimited = maxCandidates > 0 ? { ...result, candidates } : result;
            send({
              phase: "complete",
              message: "Område-scanning afsluttet",
              progress: 100,
              result: resultLimited,
              candidates,
            });
          }
        } catch (error) {
          if (!cancelled) {
            send({
              phase: "error",
              message: error instanceof Error ? error.message : "Ukendt fejl",
              progress: 100,
            });
          }
        } finally {
          if (!cancelled) {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        }
      },
      cancel() {},
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[API] Discover-area failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
