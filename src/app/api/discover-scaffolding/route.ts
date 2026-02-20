// ============================================================
// Scaffolding Discovery Endpoint
// POST /api/discover-scaffolding → SSE stream
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { discoverScaffolding } from "@/lib/discovery/scaffolding";
import type { ScaffoldingProgress } from "@/lib/discovery/scaffolding";
import { computeScaffoldStatsFromPermits, setScaffoldStats } from "@/lib/scaffold-stats";

/**
 * POST /api/discover-scaffolding
 * Body: { city: "København", minTraffic?: 10000, minScore?: 5 }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { city, minTraffic, minScore } = body;

    if (!city) {
      return NextResponse.json(
        { error: "city is required" },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: ScaffoldingProgress) => {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        try {
          const result = await discoverScaffolding(
            city,
            minTraffic ?? 10000,
            minScore ?? 5,
            send
          );

          const stats = computeScaffoldStatsFromPermits(result.permits);
          setScaffoldStats(stats);

          send({
            phase: "complete",
            message: "Stillads-scanning afsluttet",
            progress: 100,
            result,
            permits: result.permits,
          });
        } catch (error) {
          send({
            phase: "error",
            message: error instanceof Error ? error.message : "Ukendt fejl",
            progress: 100,
          });
        } finally {
          controller.close();
        }
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
    console.error("[API] Scaffolding discovery failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
