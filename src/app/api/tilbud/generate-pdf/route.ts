import { NextRequest, NextResponse } from "next/server";
import { getTilbud, upsertTilbud } from "@/lib/tilbud/store";
import { generateTilbudPdf } from "@/lib/tilbud/pdf-generator";
import { tilbudUpsertInputSchema } from "@/lib/tilbud/types";
import { logger } from "@/lib/logger";
import { findContactByEmail, logNoteToContact } from "@/lib/hubspot";

export const runtime = "nodejs";

function sanitizeFilePart(input: string): string {
  return input.replace(/[^\w\-æøåÆØÅ]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let tilbud;
    if (typeof body?.id === "string" && body.id) {
      tilbud = getTilbud(body.id);
      if (!tilbud) {
        return NextResponse.json({ error: "Tilbud ikke fundet" }, { status: 404 });
      }
    } else if (body?.tilbud) {
      const parsed = tilbudUpsertInputSchema.safeParse(body.tilbud);
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message || "Ugyldige data" }, { status: 400 });
      }
      tilbud = upsertTilbud(parsed.data);
    } else {
      return NextResponse.json({ error: "Send enten { id } eller { tilbud }" }, { status: 400 });
    }

    const pdf = await generateTilbudPdf(tilbud);
    const safeClient = sanitizeFilePart(tilbud.clientName || "kunde");
    const safeNo = sanitizeFilePart(tilbud.offerNumber || "tilbud");
    const filename = `Tilbud-${safeClient}-${safeNo}.pdf`;

    // Log note on HubSpot contact (fire-and-forget, searches by clientName as fallback)
    // Tilbud stores client name, not email – use yourReference as potential email if set
    const maybeEmail = (tilbud.yourReference || "").includes("@") ? tilbud.yourReference : null;
    if (maybeEmail) {
      findContactByEmail(maybeEmail).then((contact) => {
        if (contact?.id) {
          logNoteToContact(
            contact.id,
            `Tilbud "${tilbud.offerNumber}" (${tilbud.campaignName || tilbud.clientName}) genereret som PDF.`
          );
        }
      }).catch(() => {});
    }

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (error) {
    logger.error("Kunne ikke generere tilbud PDF", { service: "tilbud" });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ukendt fejl ved PDF-generering" },
      { status: 500 }
    );
  }
}
