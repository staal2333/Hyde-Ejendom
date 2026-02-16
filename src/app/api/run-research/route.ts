// ============================================================
// Run Research Endpoint – SSE streaming for live progress
// GET  /api/run-research → runs all pending (HubSpot + staging)
// POST /api/run-research → single property with SSE stream
//   Body: { propertyId: string } for HubSpot properties
//         { stagedPropertyId: string } for staged properties
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  runResearchWorkflow,
  processProperty,
  processStagedProperty,
  runStagedResearchBatch,
} from "@/lib/workflow/engine";
import type { WorkflowProgress } from "@/lib/workflow/engine";
import { fetchEjendomById } from "@/lib/hubspot";
import { getStagedProperty } from "@/lib/staging/store";
import { config } from "@/lib/config";

/** SSE helper: create a streaming response */
function createSSEStream(
  handler: (
    send: (event: WorkflowProgress) => void,
    isCancelled: () => boolean
  ) => Promise<void>
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let cancelled = false;
      const send = (event: WorkflowProgress) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cancelled = true;
        }
      };
      const isCancelled = () => cancelled;
      try {
        await handler(send, isCancelled);
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
    cancel() { /* client disconnected */ },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * GET /api/run-research
 * Batch research: all pending HubSpot properties + all "new" staged properties.
 */
export async function GET(request: NextRequest) {
  const cronSecret = config.cronSecret();
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return createSSEStream(async (send, isCancelled) => {
    // Phase 1: HubSpot properties
    send({
      phase: "batch_start",
      message: "Starter batch research: HubSpot + staging...",
      progress: 0,
    });

    const hubspotRuns = await runResearchWorkflow(
      (event) => send({ ...event, progress: event.progress ? Math.round(event.progress * 0.5) : undefined }),
      isCancelled
    );

    if (isCancelled()) return;

    // Phase 2: Staged properties
    send({
      phase: "staged_batch_start",
      message: "Researcher staged ejendomme...",
      progress: 50,
    });

    const stagedRuns = await runStagedResearchBatch(
      (event) => send({ ...event, progress: event.progress ? 50 + Math.round(event.progress * 0.5) : undefined }),
      isCancelled
    );

    const totalRuns = [...hubspotRuns, ...stagedRuns];
    const completed = totalRuns.filter(r => r.status === "completed").length;

    send({
      phase: "complete",
      message: `Batch research færdig: ${completed}/${totalRuns.length} gennemført (${hubspotRuns.length} HubSpot + ${stagedRuns.length} staging)`,
      progress: 100,
    });
  });
}

/**
 * POST /api/run-research
 * Single property research with SSE streaming.
 * Body: { propertyId: string }           → HubSpot property
 *       { stagedPropertyId: string }      → Staged property
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { propertyId, stagedPropertyId } = body;

    if (!propertyId && !stagedPropertyId) {
      return NextResponse.json(
        { error: "propertyId or stagedPropertyId is required" },
        { status: 400 }
      );
    }

    // ── Staged property research ──
    if (stagedPropertyId) {
      const staged = await getStagedProperty(stagedPropertyId);
      if (!staged) {
        return NextResponse.json(
          { error: "Staged property not found" },
          { status: 404 }
        );
      }

      return createSSEStream(async (send, isCancelled) => {
        const run = await processStagedProperty(staged, send, isCancelled);

        if (!isCancelled()) {
          send({
            phase: "complete",
            message: run.status === "completed"
              ? `Research fuldført for ${staged.name || staged.address} (staging)`
              : `Research fejlede: ${run.error}`,
            progress: 100,
          });
        }
      });
    }

    // ── HubSpot property research ──
    const property = await fetchEjendomById(propertyId);

    return createSSEStream(async (send, isCancelled) => {
      const run = await processProperty(property, send, isCancelled);

      if (!isCancelled()) {
        send({
          phase: "complete",
          message: run.status === "completed"
            ? `Research fuldført for ${property.name || property.address}`
            : `Research fejlede: ${run.error}`,
          progress: 100,
        });
      }
    });
  } catch (error) {
    console.error("[API] Single ejendom research failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
