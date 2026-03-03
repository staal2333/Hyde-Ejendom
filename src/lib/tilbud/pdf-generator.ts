import PDFDocument from "pdfkit";
import type { Tilbud } from "./types";
import { calcLineTotals, calcTilbudTotals } from "./calculations";
import { getHydeLogoBuffer } from "./branding.server";
import {
  HYDE_ADDRESS_LINE,
  HYDE_CITY_LINE,
  HYDE_COMPANY_NAME,
} from "./branding";
import { normalizeFixedCosts } from "./types";

const SLATE_900 = "#0f172a";
const SLATE_700 = "#334155";
const SLATE_500 = "#64748b";
const SLATE_200 = "#e2e8f0";
const INDIGO = "#4f46e5";

function formatMoney(value: number, currency = "DKK"): string {
  return `${value.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatAmount(value: number): string {
  return value.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeDate(input?: string): string {
  if (!input) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-");
    return `${d}-${m}-${y}`;
  }
  return input;
}

function linePeriodText(tilbudLine: Tilbud["lines"][number]): string {
  if (tilbudLine.fromWeek != null || tilbudLine.toWeek != null) {
    return `Uge ${tilbudLine.fromWeek ?? "-"} - ${tilbudLine.toWeek ?? "-"}`;
  }
  if (tilbudLine.fromDate && tilbudLine.toDate) {
    return `${safeDate(tilbudLine.fromDate)} - ${safeDate(tilbudLine.toDate)}`;
  }
  return "-";
}

export async function generateTilbudPdf(tilbud: Tilbud): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 0,
      info: {
        Title: `Tilbud ${tilbud.offerNumber}`,
        Author: "Ejendom AI",
        Subject: "Tilbud",
        Creator: "Ejendom AI",
      },
    });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = 595.28;
    const H = 841.89;
    const marginX = 42;
    const tableStartX = marginX;
    const tableEndX = W - marginX;
    const totals = calcTilbudTotals(tilbud);
    const primaryLine = tilbud.lines[0];
    const primaryLineTotals = primaryLine ? calcLineTotals(primaryLine) : null;
    const hydeLogo = getHydeLogoBuffer();

    const drawHeader = () => {
      doc.rect(0, 0, W, 74).fill(SLATE_900);
      doc.rect(0, 0, W, 5).fill(INDIGO);
      doc.fillColor("white").font("Helvetica-Bold").fontSize(18).text("TILBUD", marginX, 24);
      if (hydeLogo) {
        try {
          doc.image(hydeLogo, 210, 10, { fit: [58, 58], align: "center", valign: "center" });
        } catch {
          // Logo render should never block PDF generation
        }
      }
      doc.fillColor(SLATE_200).font("Helvetica").fontSize(10).text(`Tilbudsnr.: ${tilbud.offerNumber}`, W - 200, 28, { width: 160, align: "right" });
      doc.fillColor(SLATE_200).font("Helvetica").fontSize(10).text(`Dato: ${safeDate(tilbud.offerDate)}`, W - 200, 44, { width: 160, align: "right" });
    };

    const drawFooter = (pageNo: number) => {
      doc.font("Helvetica").fontSize(8).fillColor(SLATE_500);
      doc.text(`Genereret af ${HYDE_COMPANY_NAME}`, marginX, H - 30);
      doc.text(`Side ${pageNo}`, W - 90, H - 30, { width: 48, align: "right" });
    };

    const drawTopMeta = () => {
      let y = 92;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(SLATE_700).text("Kunde", marginX, y);
      doc.font("Helvetica").fontSize(10).fillColor(SLATE_900).text(tilbud.clientName || "-", marginX, y + 14);

      doc.font("Helvetica-Bold").fontSize(10).fillColor(SLATE_700).text("Kampagne", marginX + 190, y);
      doc.font("Helvetica").fontSize(10).fillColor(SLATE_900).text(tilbud.campaignName || "-", marginX + 190, y + 14, { width: 180 });

      doc.font("Helvetica-Bold").fontSize(10).fillColor(SLATE_700).text("Gyldig til", W - 160, y);
      doc.font("Helvetica").fontSize(10).fillColor(SLATE_900).text(safeDate(tilbud.validUntil) || "-", W - 160, y + 14, { width: 118, align: "right" });

      y += 46;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(SLATE_700).text("Vores reference", marginX, y);
      doc.font("Helvetica").fontSize(10).fillColor(SLATE_900).text(tilbud.ourReference || "-", marginX, y + 14, { width: 170 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(SLATE_700).text("Jeres reference", marginX + 190, y);
      doc.font("Helvetica").fontSize(10).fillColor(SLATE_900).text(tilbud.yourReference || "-", marginX + 190, y + 14, { width: 170 });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(SLATE_700).text("Mediebureau", W - 160, y);
      doc.font("Helvetica").fontSize(10).fillColor(SLATE_900).text(tilbud.mediaAgency || "-", W - 160, y + 14, { width: 118, align: "right" });
      doc.font("Helvetica").fontSize(9).fillColor(SLATE_500).text(HYDE_COMPANY_NAME, marginX, y + 44);
      doc.font("Helvetica").fontSize(9).fillColor(SLATE_500).text(HYDE_ADDRESS_LINE, marginX, y + 56);
      doc.font("Helvetica").fontSize(9).fillColor(SLATE_500).text(HYDE_CITY_LINE, marginX, y + 68);
      doc.moveTo(marginX, y + 86).lineTo(W - marginX, y + 86).strokeColor(SLATE_200).lineWidth(1).stroke();
      return y + 98;
    };

    const col = {
      name: tableStartX,
      period: tableStartX + 160,
      qty: tableStartX + 255,
      weeks: tableStartX + 290,
      list: tableStartX + 325,
      discount: tableStartX + 400,
      net: tableStartX + 445,
    };

    const drawTableHead = (y: number) => {
      doc.rect(tableStartX, y - 4, tableEndX - tableStartX, 20).fill("#000000");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9);
      doc.text("Navn", col.name + 4, y);
      doc.text("Periode", col.period + 4, y);
      doc.text("Antal", col.qty + 4, y);
      doc.text("Uger", col.weeks + 4, y);
      doc.text("Listepris", col.list + 4, y);
      doc.text("Rabat", col.discount + 4, y);
      doc.text("Nettopris", col.net + 4, y);
      doc.moveTo(tableStartX, y + 18).lineTo(tableEndX, y + 18).strokeColor(SLATE_200).lineWidth(1).stroke();
      return y + 24;
    };

    drawHeader();
    let pageNo = 1;
    let y = drawTopMeta();
    y = drawTableHead(y);

    doc.font("Helvetica").fontSize(9).fillColor(SLATE_900);
    for (const line of tilbud.lines) {
      if (y > H - 180) {
        drawFooter(pageNo);
        doc.addPage();
        pageNo += 1;
        drawHeader();
        y = 102;
        y = drawTableHead(y);
      }

      const lineTotals = calcLineTotals(line);
      const period = linePeriodText(line);
      const rangeWeeks = line.fromWeek != null && line.toWeek != null
        ? Math.max(0, line.toWeek - line.fromWeek + 1)
        : line.weeks || 0;
      const hasNote = Boolean(line.notes && line.notes.trim());
      const lineHeight = hasNote ? 34 : 24;

      doc.fillColor(SLATE_900).font("Helvetica").fontSize(9);
      doc.text(line.name || "-", col.name + 4, y + 2, { width: 154, ellipsis: true });
      doc.text(period, col.period + 4, y + 2, { width: 90, ellipsis: true });
      doc.text(String(line.quantity || 1), col.qty + 4, y + 2, { width: 34, align: "right" });
      doc.text(String(rangeWeeks), col.weeks + 4, y + 2, { width: 34, align: "right" });
      doc.text(formatAmount(lineTotals.mediaPrice), col.list + 4, y + 2, { width: 70, align: "right" });
      doc.text(`${line.discountPct || 0}%`, col.discount + 4, y + 2, { width: 56, align: "right" });
      doc.text(formatAmount(lineTotals.lineTotal), col.net + 4, y + 2, { width: 60, align: "right" });
      if (hasNote) {
        doc.fillColor(SLATE_500).font("Helvetica").fontSize(8);
        doc.text(line.notes || "", col.name + 4, y + 16, { width: 240, ellipsis: true });
      }
      doc.moveTo(tableStartX, y + lineHeight).lineTo(tableEndX, y + lineHeight).strokeColor("#f1f5f9").lineWidth(1).stroke();
      y += lineHeight;
    }

    const fixedCostRows = normalizeFixedCosts(tilbud.fixedCosts);
    for (const cost of fixedCostRows) {
      if (y > H - 180) {
        drawFooter(pageNo);
        doc.addPage();
        pageNo += 1;
        drawHeader();
        y = 102;
        y = drawTableHead(y);
      }

      const lineHeight = 22;
      const amountText = cost.enabled ? formatMoney(cost.amount || 0, tilbud.currency) : "-";

      doc.fillColor(SLATE_900).font("Helvetica").fontSize(9);
      doc.text(cost.label, col.name + 4, y + 2, { width: 154, ellipsis: true });
      doc.text("-", col.period + 4, y + 2, { width: 90, align: "center" });
      doc.text("-", col.qty + 4, y + 2, { width: 34, align: "right" });
      doc.text("-", col.weeks + 4, y + 2, { width: 34, align: "right" });
      doc.text("-", col.list + 4, y + 2, { width: 70, align: "right" });
      doc.text("-", col.discount + 4, y + 2, { width: 56, align: "right" });
      doc.text(cost.enabled ? formatAmount(cost.amount || 0) : "-", col.net + 4, y + 2, { width: 60, align: "right" });
      doc.moveTo(tableStartX, y + lineHeight).lineTo(tableEndX, y + lineHeight).strokeColor("#f1f5f9").lineWidth(1).stroke();
      y += lineHeight;
    }

    if (y < H - 190) {
      y += 16;
      const boxX = W - marginX - 240;
      const boxW = 240;
      const lineGap = 18;
      doc.rect(boxX, y, boxW, 16).fill("#000000");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8).text("LISTEPRISER", boxX + 8, y + 4);
      doc.rect(boxX, y + 16, boxW, 56).fill("#f8fafc");
      doc.fillColor(SLATE_700).font("Helvetica").fontSize(9);
      doc.text("Linjer subtotal", boxX + 10, y + 24);
      doc.text(formatMoney(totals.linesSubtotal, tilbud.currency), boxX + 120, y + 24, { width: 108, align: "right" });
      doc.text("Faste omkostninger", boxX + 10, y + 24 + lineGap);
      doc.text(formatMoney(totals.fixedCostsTotal, tilbud.currency), boxX + 120, y + 24 + lineGap, { width: 108, align: "right" });

      const b2 = y + 78;
      doc.rect(boxX, b2, boxW, 16).fill("#000000");
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8).text("TILBUDSPRISER", boxX + 8, b2 + 4);
      doc.rect(boxX, b2 + 16, boxW, 104).fill("#f8fafc");
      doc.fillColor(SLATE_700).font("Helvetica").fontSize(9);
      doc.text("Subtotal", boxX + 10, b2 + 24);
      doc.text(formatMoney(totals.subtotal, tilbud.currency), boxX + 120, b2 + 24, { width: 108, align: "right" });
      doc.text(`Informationsgodtgørelse (${tilbud.infoCompensationPct}%)`, boxX + 10, b2 + 24 + lineGap);
      doc.text(formatMoney(totals.infoCompensationAmount, tilbud.currency), boxX + 120, b2 + 24 + lineGap, { width: 108, align: "right" });
      doc.text(`Sikkerhedsstillelse (${tilbud.securityPct}%)`, boxX + 10, b2 + 24 + lineGap * 2);
      doc.text(formatMoney(totals.securityAmount, tilbud.currency), boxX + 120, b2 + 24 + lineGap * 2, { width: 108, align: "right" });
      doc.text(`Moms (${tilbud.vatPct}%)`, boxX + 10, b2 + 24 + lineGap * 3);
      doc.text(formatMoney(totals.vatAmount, tilbud.currency), boxX + 120, b2 + 24 + lineGap * 3, { width: 108, align: "right" });
      doc.rect(boxX + 8, b2 + 24 + lineGap * 4 + 2, boxW - 16, 1).fill(SLATE_200);
      doc.font("Helvetica-Bold").fillColor(SLATE_900);
      doc.text("TOTAL", boxX + 10, b2 + 24 + lineGap * 4 + 8);
      doc.text(formatMoney(totals.grandTotal, tilbud.currency), boxX + 120, b2 + 24 + lineGap * 4 + 8, { width: 108, align: "right" });
      y += 204;
    }

    if (tilbud.comments || tilbud.terms) {
      if (y > H - 120) {
        drawFooter(pageNo);
        doc.addPage();
        pageNo += 1;
        drawHeader();
        y = 102;
      }
      doc.font("Helvetica-Bold").fontSize(10).fillColor(SLATE_700).text("Kommentarer", marginX, y);
      doc.font("Helvetica").fontSize(9).fillColor(SLATE_900).text(tilbud.comments || "-", marginX, y + 14, { width: W - marginX * 2 });
      y = doc.y + 14;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(SLATE_700).text("Betingelser", marginX, y);
      doc.font("Helvetica").fontSize(9).fillColor(SLATE_900).text(tilbud.terms || "-", marginX, y + 14, { width: W - marginX * 2 });
    }

    drawFooter(pageNo);
    doc.end();
  });
}
