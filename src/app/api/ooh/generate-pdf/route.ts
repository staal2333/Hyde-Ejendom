// ============================================================
// POST /api/ooh/generate-pdf – Generate a 4-page proposal PDF
// Body: { proposalId } or { frameId, creativeId, clientCompany, clientContactName?, clientEmail }
// Returns the PDF as a downloadable file
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getFrame, getCreative, getProposal, seedDemoData } from "@/lib/ooh/store";
import { compositeMultiplePlacements } from "@/lib/ooh/image-processor";
import { generateProposalPdf } from "@/lib/ooh/pdf-generator";
import { loadImageBuffer } from "@/lib/ooh/load-image";

let seeded = false;
function ensureSeeded() {
  if (!seeded) { seedDemoData(); seeded = true; }
}

export async function POST(req: NextRequest) {
  ensureSeeded();

  try {
    const body = await req.json();

    let frameData;
    let mockupBuffer: Buffer;
    let clientCompany: string;
    let clientContactName: string | undefined;
    let clientEmail: string;

    if (body.proposalId) {
      const proposal = getProposal(body.proposalId);
      if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

      const frame = await getFrame(proposal.frameId);
      if (!frame) return NextResponse.json({ error: "Frame not found" }, { status: 404 });

      frameData = frame;
      clientCompany = proposal.clientCompany;
      clientContactName = proposal.clientContactName;
      clientEmail = proposal.clientEmail;

      if (proposal.mockupBuffer) {
        const b64 = proposal.mockupBuffer.replace(/^data:image\/\w+;base64,/, "");
        mockupBuffer = Buffer.from(b64, "base64");
      } else {
        const creative = await getCreative(proposal.creativeId);
        if (!creative) return NextResponse.json({ error: "Creative not found" }, { status: 404 });

        const frameBuffer = await loadImageBuffer(frame.frameImageUrl);
        const creativeBuffer = creative.thumbnailUrl
          ? await loadImageBuffer(creative.thumbnailUrl)
          : null;
        if (!creativeBuffer) return NextResponse.json({ error: "Creative has no image" }, { status: 400 });

        const placements1 = frame.placements?.length > 0 ? frame.placements : [frame.placement];
        const assignments1 = placements1.map(p => ({ placement: p, creativeBuffer }));
        mockupBuffer = await compositeMultiplePlacements(
          frameBuffer, assignments1, frame.frameWidth, frame.frameHeight
        );
      }
    } else {
      const { frameId, creativeId } = body;
      clientCompany = body.clientCompany || "Kunde";
      clientContactName = body.clientContactName;
      clientEmail = body.clientEmail || "";

      const frame = await getFrame(frameId);
      if (!frame) return NextResponse.json({ error: "Frame not found" }, { status: 404 });

      const creative = await getCreative(creativeId);
      if (!creative) return NextResponse.json({ error: "Creative not found" }, { status: 404 });

      frameData = frame;
      const frameBuffer = await loadImageBuffer(frame.frameImageUrl);
      const creativeBuffer = creative.thumbnailUrl
        ? await loadImageBuffer(creative.thumbnailUrl)
        : null;
      if (!creativeBuffer) return NextResponse.json({ error: "Creative has no image" }, { status: 400 });

      const placements2 = frame.placements?.length > 0 ? frame.placements : [frame.placement];
      const assignments2 = placements2.map(p => ({ placement: p, creativeBuffer }));
      mockupBuffer = await compositeMultiplePlacements(
        frameBuffer, assignments2, frame.frameWidth, frame.frameHeight
      );
    }

    const pdfBuffer = await generateProposalPdf({
      mockupBuffer,
      frame: frameData,
      clientCompany,
      clientContactName,
      clientEmail,
    });

    const filename = `Proposal-${clientCompany.replace(/\s+/g, "-")}-${frameData.name.replace(/\s+/g, "-")}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error("[generate-pdf] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error generating PDF" },
      { status: 500 }
    );
  }
}
