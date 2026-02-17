// ============================================================
// Discovery Endpoint – Scan a street for outdoor ad potential
// POST /api/discover  → SSE stream with live progress
// GET  /api/discover  → Recent discovery runs
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { discoverStreet, getRecentDiscoveries } from "@/lib/discovery";
import type { DiscoveryProgress } from "@/lib/discovery";

/**
 * POST /api/discover
 * Streams Server-Sent Events with live progress during the scan.
 * Body: { street, city?, minScore?, minTraffic?, maxCandidates? }
 * maxCandidates: return only the top N by score (e.g. 50); 0 or omit = all.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { street, city, minScore, minTraffic, maxCandidates: rawMax } = body;
    const maxCandidates = typeof rawMax === "number" && rawMax > 0 ? Math.min(500, Math.round(rawMax)) : 0;

    if (!street) {
      return NextResponse.json(
        { error: "street is required" },
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
            const data = JSON.stringify(event);
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch {
            cancelled = true;
          }
        };

        const isCancelled = () => cancelled;

        try {
          const result = await discoverStreet(
            street,
            city || "København",
            minScore ?? 6,
            minTraffic ?? 10000,
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
              message: "Scanning afsluttet",
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
            try { controller.close(); } catch { /* already closed */ }
          }
        }
      },
      cancel() {
        // Called when the client disconnects
      },
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
    console.error("[API] Discovery failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/discover
 * Return recent discovery runs.
 */
export async function GET() {
  return NextResponse.json({
    recentDiscoveries: getRecentDiscoveries(),
  });
}
