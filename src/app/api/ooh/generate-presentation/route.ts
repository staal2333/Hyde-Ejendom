// ============================================================
// POST /api/ooh/generate-presentation
//
// Takes a presentation template ID and a mapping of slot->mockup,
// opens the original PDF with pdf-lib, inserts mockup images
// at the correct coordinates on each page, and returns the
// modified PDF.
// ============================================================

export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  getPresentationTemplate,
  getFrame,
  getCreative,
} from "@/lib/ooh/store";
import { compositeMultiplePlacements } from "@/lib/ooh/image-processor";
import { loadImageBuffer } from "@/lib/ooh/load-image";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { templateId, slotAssignments, textValues } = body as {
      templateId: string;
      slotAssignments: Record<
        string,
        | { frameId: string; creativeId: string; creativeAssignments?: Record<number, string>; mockupDataUrl?: undefined }
        | { mockupDataUrl: string; frameId?: undefined; creativeId?: undefined; creativeAssignments?: undefined }
      >;
      /** Text placeholder values, e.g. { "{{CLIENT_NAME}}": "Carlsberg", "{{DATE}}": "Feb 2026" } */
      textValues?: Record<string, string>;
    };

    if (!templateId) {
      return NextResponse.json({ error: "Missing templateId" }, { status: 400 });
    }

    // Load template
    const template = await getPresentationTemplate(templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    // Load original PDF
    const pdfBytes = await loadImageBuffer(template.pdfFileUrl);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Process each slot assignment
    for (const page of template.pages) {
      for (const slot of page.imageSlots) {
        const assignment = slotAssignments?.[slot.id];
        if (!assignment) continue;

        let mockupBuffer: Buffer;

        if (assignment.mockupDataUrl) {
          const b64 = assignment.mockupDataUrl.replace(/^data:image\/\w+;base64,/, "");
          mockupBuffer = Buffer.from(b64, "base64");
        } else if (assignment.frameId && assignment.creativeId) {
          const frame = await getFrame(assignment.frameId);
          if (!frame) continue;
          const mainCreative = await getCreative(assignment.creativeId);
          if (!mainCreative || !mainCreative.thumbnailUrl) continue;

          const frameBuffer = await loadImageBuffer(frame.frameImageUrl);
          const mainCreativeBuffer = await loadImageBuffer(mainCreative.thumbnailUrl);

          const placements = frame.placements?.length > 0 ? frame.placements : [frame.placement];
          const placementAssignments: { placement: typeof placements[number]; creativeBuffer: Buffer }[] = [];

          const slotCreativeAssignments = assignment.creativeAssignments;
          for (let pi = 0; pi < placements.length; pi++) {
            const overrideId: string | undefined = slotCreativeAssignments?.[pi];
            if (overrideId && overrideId !== assignment.creativeId) {
              const altCreative = await getCreative(overrideId);
              if (altCreative?.thumbnailUrl) {
                const altBuf = await loadImageBuffer(altCreative.thumbnailUrl);
                placementAssignments.push({ placement: placements[pi], creativeBuffer: altBuf });
              } else {
                placementAssignments.push({ placement: placements[pi], creativeBuffer: mainCreativeBuffer });
              }
            } else {
              placementAssignments.push({ placement: placements[pi], creativeBuffer: mainCreativeBuffer });
            }
          }

          mockupBuffer = await compositeMultiplePlacements(
            frameBuffer, placementAssignments, frame.frameWidth, frame.frameHeight
          );
        } else {
          continue;
        }

        // Embed the mockup image into the PDF at the correct position
        const pdfPage = pdfDoc.getPage(page.pageIndex);
        const { width: pageW, height: pageH } = pdfPage.getSize();

        const scaleX = pageW / slot.pageWidth;
        const scaleY = pageH / slot.pageHeight;
        const drawX = slot.x * scaleX;
        const drawW = slot.width * scaleX;
        const drawH = slot.height * scaleY;
        const drawY = pageH - (slot.y * scaleY) - drawH;

        // Pre-process the image using Sharp
        const sharp = (await import("sharp")).default;
        const targetW = Math.round(drawW * 2);
        const targetH = Math.round(drawH * 2);
        const fitMode = slot.objectFit || "cover";

        let processedBuffer: Buffer;
        try {
          processedBuffer = await sharp(mockupBuffer)
            .resize(targetW, targetH, {
              fit: fitMode === "cover" ? "cover" : fitMode === "contain" ? "contain" : "fill",
              position: "center",
              background: { r: 255, g: 255, b: 255, alpha: 0 },
            })
            .jpeg({ quality: 92 })
            .toBuffer();
        } catch {
          processedBuffer = mockupBuffer;
        }

        let embeddedImage;
        try {
          embeddedImage = await pdfDoc.embedJpg(processedBuffer);
        } catch {
          try {
            embeddedImage = await pdfDoc.embedPng(processedBuffer);
          } catch (e2) {
            console.error(`[generate-presentation] Could not embed image for slot ${slot.id}:`, e2);
            continue;
          }
        }

        pdfPage.drawImage(embeddedImage, {
          x: drawX,
          y: drawY,
          width: drawW,
          height: drawH,
        });
      }
    }

    // ── Render text slots ────────────────────────────────────
    if (textValues && Object.keys(textValues).length > 0) {
      const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      for (const page of template.pages) {
        if (!page.textSlots?.length) continue;
        if (page.pageIndex >= pdfDoc.getPageCount()) continue;

        const pdfPage = pdfDoc.getPage(page.pageIndex);
        const { width: pageW, height: pageH } = pdfPage.getSize();

        for (const ts of page.textSlots) {
          // Resolve the placeholder to actual text
          let text = textValues[ts.placeholder] ?? "";
          if (!text && ts.placeholder) {
            // Also try without braces: "CLIENT_NAME" → "{{CLIENT_NAME}}"
            text = textValues[ts.placeholder.replace(/\{\{|\}\}/g, "")] ?? "";
          }
          if (!text) continue;

          const font = ts.fontWeight === "bold" ? helveticaBold : helvetica;
          const fontSize = ts.fontSize || 14;

          // Parse hex color
          const hexColor = (ts.color || "#000000").replace("#", "");
          const r = parseInt(hexColor.substring(0, 2), 16) / 255;
          const g = parseInt(hexColor.substring(2, 4), 16) / 255;
          const b = parseInt(hexColor.substring(4, 6), 16) / 255;

          // Scale coordinates (textSlot uses same coordinate space as imageSlots)
          // The first imageSlot on the same page gives us the reference pageWidth/pageHeight
          const refSlot = page.imageSlots[0];
          const scaleX = refSlot ? pageW / refSlot.pageWidth : 1;
          const scaleY = refSlot ? pageH / refSlot.pageHeight : 1;

          const drawX = ts.x * scaleX;
          const drawW = ts.width * scaleX;
          const drawH = ts.height * scaleY;
          const drawY = pageH - (ts.y * scaleY) - drawH;

          // Calculate text X based on alignment
          let textX = drawX;
          if (ts.align === "center") {
            const textWidth = font.widthOfTextAtSize(text, fontSize);
            textX = drawX + (drawW - textWidth) / 2;
          } else if (ts.align === "right") {
            const textWidth = font.widthOfTextAtSize(text, fontSize);
            textX = drawX + drawW - textWidth;
          }

          // Center vertically in the slot
          const textY = drawY + (drawH - fontSize) / 2;

          pdfPage.drawText(text, {
            x: textX,
            y: textY,
            size: fontSize,
            font,
            color: rgb(r, g, b),
          });
        }
      }
    }

    const modifiedPdfBytes = await pdfDoc.save();
    const filename = `Presentation-${template.name.replace(/\s+/g, "-")}-${Date.now()}.pdf`;

    return new NextResponse(Buffer.from(modifiedPdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(modifiedPdfBytes.length),
      },
    });
  } catch (error) {
    console.error("[generate-presentation] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
