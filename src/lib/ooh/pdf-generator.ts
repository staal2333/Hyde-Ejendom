// ============================================================
// OOH PDF Generator – 4-page proposal document
// Page 1: Cover (branding + location + client)
// Page 2: Mockup (full-page image)
// Page 3: Location details (traffic, price, specs)
// Page 4: Contact / CTA
// ============================================================

import PDFDocument from "pdfkit";
import type { Frame } from "./types";

interface PdfInput {
  mockupBuffer: Buffer;
  frame: Frame;
  clientCompany: string;
  clientContactName?: string;
  clientEmail: string;
  companyName?: string;    // Your company (default: Hyde Media)
  companyEmail?: string;
  companyPhone?: string;
}

const VIOLET = "#7c3aed";
const SLATE_900 = "#0f172a";
const SLATE_600 = "#475569";
const SLATE_400 = "#94a3b8";
const WHITE = "#ffffff";

/**
 * Generate a 4-page proposal PDF and return as Buffer.
 */
export async function generateProposalPdf(input: PdfInput): Promise<Buffer> {
  const {
    mockupBuffer,
    frame,
    clientCompany,
    clientContactName,
    clientEmail,
    companyName = "Hyde Media",
    companyEmail = "mads.ejendomme@hydemedia.dk",
    companyPhone,
  } = input;

  const today = new Date().toLocaleDateString("da-DK", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: {
        Title: `OOH Proposal – ${clientCompany} – ${frame.name}`,
        Author: companyName,
        Subject: "Out-of-Home Advertising Proposal",
        Creator: "Ejendom AI – OOH Proposals",
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 595.28; // A4 width in points
    const H = 841.89; // A4 height in points

    // ── PAGE 1: COVER ───────────────────────────────────────
    // Full gradient background
    doc.rect(0, 0, W, H).fill(SLATE_900);

    // Accent stripe at top
    doc.rect(0, 0, W, 8).fill(VIOLET);

    // "OOH PROPOSAL" label
    doc.fontSize(11).fillColor(VIOLET).font("Helvetica-Bold");
    doc.text("OOH PROPOSAL", 60, 80, { characterSpacing: 4 });

    // Location name (big)
    doc.fontSize(36).fillColor(WHITE).font("Helvetica-Bold");
    doc.text(frame.name, 60, 130, { width: W - 120 });

    // Address
    if (frame.locationAddress) {
      doc.fontSize(14).fillColor(SLATE_400).font("Helvetica");
      doc.text(frame.locationAddress, 60, doc.y + 12, { width: W - 120 });
    }

    // Separator line
    const sepY = doc.y + 40;
    doc.moveTo(60, sepY).lineTo(W - 60, sepY).strokeColor(VIOLET).lineWidth(2).stroke();

    // Client info block
    doc.fontSize(11).fillColor(SLATE_400).font("Helvetica");
    doc.text("UDARBEJDET TIL", 60, sepY + 30);
    doc.fontSize(22).fillColor(WHITE).font("Helvetica-Bold");
    doc.text(clientCompany, 60, sepY + 50, { width: W - 120 });
    if (clientContactName) {
      doc.fontSize(13).fillColor(SLATE_400).font("Helvetica");
      doc.text(`Att: ${clientContactName}`, 60, doc.y + 8);
    }

    // Date
    doc.fontSize(11).fillColor(SLATE_400).font("Helvetica");
    doc.text(today, 60, sepY + 120);

    // Footer branding
    doc.fontSize(11).fillColor(SLATE_400).font("Helvetica-Bold");
    doc.text(companyName.toUpperCase(), 60, H - 80, { characterSpacing: 3 });
    doc.fontSize(9).fillColor(SLATE_400).font("Helvetica");
    doc.text(companyEmail, 60, H - 60);

    // Stats boxes at bottom right
    const statsY = H - 160;
    const boxW = 120;
    const boxH = 50;

    if (frame.dailyTraffic) {
      doc.roundedRect(W - 60 - boxW, statsY, boxW, boxH, 6).fill("#1e1b4b");
      doc.fontSize(8).fillColor(VIOLET).font("Helvetica-Bold");
      doc.text("DAGLIG TRAFIK", W - 60 - boxW + 12, statsY + 10, { width: boxW - 24 });
      doc.fontSize(16).fillColor(WHITE).font("Helvetica-Bold");
      doc.text(`~${frame.dailyTraffic.toLocaleString("da-DK")}`, W - 60 - boxW + 12, statsY + 26, { width: boxW - 24 });
    }

    if (frame.listPrice) {
      const priceBoxX = frame.dailyTraffic ? W - 60 - boxW * 2 - 12 : W - 60 - boxW;
      doc.roundedRect(priceBoxX, statsY, boxW, boxH, 6).fill("#1e1b4b");
      doc.fontSize(8).fillColor(VIOLET).font("Helvetica-Bold");
      doc.text("PRIS / MAANED", priceBoxX + 12, statsY + 10, { width: boxW - 24 });
      doc.fontSize(16).fillColor(WHITE).font("Helvetica-Bold");
      doc.text(`${frame.listPrice.toLocaleString("da-DK")} DKK`, priceBoxX + 12, statsY + 26, { width: boxW - 24 });
    }

    // ── PAGE 2: MOCKUP ──────────────────────────────────────
    doc.addPage();
    doc.rect(0, 0, W, H).fill("#f8fafc");

    // Header
    doc.rect(0, 0, W, 60).fill(SLATE_900);
    doc.fontSize(10).fillColor(VIOLET).font("Helvetica-Bold");
    doc.text("MOCKUP", 40, 22, { characterSpacing: 2 });
    doc.fontSize(10).fillColor(SLATE_400).font("Helvetica");
    doc.text(frame.name, 40, 36);

    // Mockup image - fit within the page
    const imgMargin = 40;
    const imgMaxW = W - imgMargin * 2;
    const imgMaxH = H - 100 - imgMargin;

    try {
      doc.image(mockupBuffer, imgMargin, 80, {
        fit: [imgMaxW, imgMaxH],
        align: "center",
        valign: "center",
      });
    } catch {
      doc.fontSize(14).fillColor(SLATE_600).font("Helvetica");
      doc.text("Mockup billede kunne ikke vises", imgMargin, 300, { width: imgMaxW, align: "center" });
    }

    // ── PAGE 3: DETAILS ─────────────────────────────────────
    doc.addPage();
    doc.rect(0, 0, W, H).fill(WHITE);

    // Header
    doc.rect(0, 0, W, 60).fill(SLATE_900);
    doc.fontSize(10).fillColor(VIOLET).font("Helvetica-Bold");
    doc.text("LOKATIONSDETALJER", 40, 22, { characterSpacing: 2 });
    doc.fontSize(10).fillColor(SLATE_400).font("Helvetica");
    doc.text(frame.name, 40, 36);

    let yPos = 100;

    // Detail rows
    const details: [string, string][] = [
      ["Lokation", frame.name],
      ["Adresse", frame.locationAddress || "Ikke angivet"],
      ["By", frame.locationCity || "Ikke angivet"],
      ["Type", frame.frameType === "scaffolding" ? "Stillads" : frame.frameType === "facade" ? "Facade" : frame.frameType === "gable" ? "Gavl" : frame.frameType],
      ["Daglig trafik", frame.dailyTraffic ? `~${frame.dailyTraffic.toLocaleString("da-DK")} forbipasserende` : "Ikke estimeret"],
      ["Pris", frame.listPrice ? `${frame.listPrice.toLocaleString("da-DK")} DKK / maaned` : "Pris efter aftale"],
      ["Reklameflate", `${frame.placement.width} x ${frame.placement.height} px`],
    ];

    for (const [label, value] of details) {
      // Alternating background
      if (details.indexOf([label, value]) % 2 === 0) {
        doc.rect(40, yPos - 8, W - 80, 50).fill("#f8fafc");
      }

      doc.fontSize(9).fillColor(SLATE_400).font("Helvetica-Bold");
      doc.text(label.toUpperCase(), 60, yPos, { width: 160 });

      doc.fontSize(13).fillColor(SLATE_900).font("Helvetica");
      doc.text(value, 60, yPos + 18, { width: W - 140 });

      yPos += 58;
    }

    // "Prepared for" section
    yPos += 30;
    doc.moveTo(60, yPos).lineTo(W - 60, yPos).strokeColor("#e2e8f0").lineWidth(1).stroke();
    yPos += 30;

    doc.fontSize(9).fillColor(SLATE_400).font("Helvetica-Bold");
    doc.text("UDARBEJDET TIL", 60, yPos);
    doc.fontSize(16).fillColor(SLATE_900).font("Helvetica-Bold");
    doc.text(clientCompany, 60, yPos + 20);
    if (clientContactName) {
      doc.fontSize(11).fillColor(SLATE_600).font("Helvetica");
      doc.text(clientContactName, 60, doc.y + 6);
    }
    doc.fontSize(11).fillColor(VIOLET).font("Helvetica");
    doc.text(clientEmail, 60, doc.y + 4);

    // ── PAGE 4: CONTACT / CTA ───────────────────────────────
    doc.addPage();
    doc.rect(0, 0, W, H).fill(SLATE_900);
    doc.rect(0, 0, W, 8).fill(VIOLET);

    // Big CTA
    doc.fontSize(11).fillColor(VIOLET).font("Helvetica-Bold");
    doc.text("NAESTE SKRIDT", 60, 120, { characterSpacing: 4 });

    doc.fontSize(32).fillColor(WHITE).font("Helvetica-Bold");
    doc.text("Lad os bringe jeres\nbudskab ud i byen.", 60, 160, { width: W - 120, lineGap: 6 });

    doc.fontSize(14).fillColor(SLATE_400).font("Helvetica");
    doc.text(
      "Vi staar klar til at hjaelpe jer med at faa den bedste eksponering. " +
      "Kontakt os for at diskutere priser, tidsrammer og muligheder.",
      60, doc.y + 30, { width: W - 120, lineGap: 4 }
    );

    // Contact card
    const cardY = 400;
    doc.roundedRect(60, cardY, W - 120, 160, 10).fill("#1e1b4b");

    doc.fontSize(9).fillColor(VIOLET).font("Helvetica-Bold");
    doc.text("KONTAKT", 90, cardY + 25, { characterSpacing: 2 });

    doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold");
    doc.text(companyName, 90, cardY + 50);

    doc.fontSize(12).fillColor(SLATE_400).font("Helvetica");
    doc.text(companyEmail, 90, cardY + 80);
    if (companyPhone) {
      doc.text(companyPhone, 90, doc.y + 6);
    }

    doc.fontSize(10).fillColor(SLATE_400).font("Helvetica");
    doc.text(today, 90, cardY + 120);

    // Footer
    doc.fontSize(9).fillColor(SLATE_400).font("Helvetica");
    doc.text(
      `Genereret af ${companyName} OOH Platform`,
      60, H - 50, { width: W - 120, align: "center" }
    );

    doc.end();
  });
}
