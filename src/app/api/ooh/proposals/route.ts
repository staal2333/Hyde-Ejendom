import { NextRequest, NextResponse } from "next/server";
import { getProposals, getProposal, seedDemoData } from "@/lib/ooh/store";
import { generateProposal, sendProposalEmail } from "@/lib/ooh/proposal-service";
import type { GenerateProposalInput } from "@/lib/ooh/types";

// Ensure demo data
let seeded = false;
function ensureSeeded() {
  if (!seeded) { seedDemoData(); seeded = true; }
}

/**
 * GET /api/ooh/proposals – List proposals
 * GET /api/ooh/proposals?id=xxx – Get single proposal
 */
export async function GET(req: NextRequest) {
  ensureSeeded();
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const proposal = getProposal(id);
    if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(proposal);
  }

  const status = req.nextUrl.searchParams.get("status") || undefined;
  const client = req.nextUrl.searchParams.get("client") || undefined;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20");
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0");

  const result = getProposals({ status, client, limit, offset });
  return NextResponse.json(result);
}

/**
 * POST /api/ooh/proposals – Generate a new proposal
 * Body: { frameId, creativeId, clientEmail, clientCompany, clientContactName?, templateId? }
 *
 * POST /api/ooh/proposals?action=send&id=xxx – Send proposal via email
 * Body: { customMessage? }
 */
export async function POST(req: NextRequest) {
  ensureSeeded();
  const action = req.nextUrl.searchParams.get("action");

  // Send existing proposal
  if (action === "send") {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const result = await sendProposalEmail(id, body.customMessage);
    return NextResponse.json(result);
  }

  // Generate new proposal (SSE for progress)
  const body: GenerateProposalInput = await req.json();

  if (!body.frameId || !body.creativeId || !body.clientEmail || !body.clientCompany) {
    return NextResponse.json(
      { error: "frameId, creativeId, clientEmail, and clientCompany are required" },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* stream closed */ }
      };

      try {
        const proposal = await generateProposal(body, (status, message, progress) => {
          send({ status, message, progress, proposalId: undefined });
        });

        send({
          status: proposal.status,
          message: proposal.status === "error" ? proposal.errorMessage : "Faerdig!",
          progress: 100,
          proposal: {
            id: proposal.id,
            status: proposal.status,
            mockupUrl: proposal.mockupUrl,
            mockupPreview: proposal.mockupBuffer,
            slidesUrl: proposal.slidesUrl,
            pdfUrl: proposal.pdfUrl,
            processingDurationMs: proposal.processingDurationMs,
          },
        });
      } catch (error) {
        send({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
          progress: 100,
        });
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
