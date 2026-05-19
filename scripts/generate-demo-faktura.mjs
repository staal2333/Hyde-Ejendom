// Generates a realistic Danish supplier invoice PDF for testing
// the case invoice-scan flow. Run with: node scripts/generate-demo-faktura.mjs
// Output: public/demo-faktura.pdf

import PDFDocument from "pdfkit";
import { createWriteStream, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public");
const outPath = join(outDir, "demo-faktura.pdf");
mkdirSync(outDir, { recursive: true });

const doc = new PDFDocument({ size: "A4", margin: 50 });
doc.pipe(createWriteStream(outPath));

const fmt = (n) =>
  n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Header
doc.fontSize(20).font("Helvetica-Bold").text("BannerPrint Danmark ApS", 50, 50);
doc.fontSize(9).font("Helvetica").fillColor("#555");
doc.text("Industrivej 42, 2730 Herlev");
doc.text("CVR: 35781234  •  Tlf: +45 70 22 33 44");
doc.text("info@bannerprint.dk  •  www.bannerprint.dk");

doc.fillColor("#000");
doc.fontSize(28).font("Helvetica-Bold").text("FAKTURA", 400, 50, { align: "right" });

// Invoice meta
doc.fontSize(9).font("Helvetica").fillColor("#000");
const metaY = 100;
doc.text("Fakturanummer:", 380, metaY).text("Fakturadato:", 380, metaY + 14)
   .text("Forfaldsdato:", 380, metaY + 28).text("Kundenr:", 380, metaY + 42);
doc.font("Helvetica-Bold");
doc.text("F-2026-04812", 480, metaY).text("2026-05-18", 480, metaY + 14)
   .text("2026-06-17", 480, metaY + 28).text("HYDE-001", 480, metaY + 42);

// Recipient
doc.font("Helvetica").fontSize(9).fillColor("#555").text("Faktureres til:", 50, 130);
doc.font("Helvetica-Bold").fontSize(11).fillColor("#000").text("Hyde Media ApS", 50, 145);
doc.font("Helvetica").fontSize(9).text("Vesterbrogade 24, 1620 København V");
doc.text("CVR: 41234567  •  Att: Sebastian Staal");

// Project ref
doc.moveDown(2);
doc.font("Helvetica").fontSize(9).fillColor("#555");
doc.text("Sag:", 50, 220);
doc.font("Helvetica-Bold").fillColor("#000").text("Stillads-banner Nørrebrogade 78 — kampagne maj/juni 2026", 80, 220);

// Table header
const tableTop = 260;
doc.rect(50, tableTop, 500, 22).fill("#1f2937");
doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9);
doc.text("Beskrivelse", 58, tableTop + 7);
doc.text("Antal", 320, tableTop + 7, { width: 50, align: "right" });
doc.text("á-pris", 380, tableTop + 7, { width: 60, align: "right" });
doc.text("Beløb", 450, tableTop + 7, { width: 90, align: "right" });

// Table rows
const lines = [
  {
    desc: "Vinyl-print 510g/m² banner, full-color UV-tryk\n(motiv: 'Sommerkampagne 2026')",
    qty: "80 m²",
    unitPrice: 145.0,
    total: 11600.0,
  },
  {
    desc: "Øjer + forstærket kant rundt om banner (alle 4 sider)",
    qty: "80 m²",
    unitPrice: 22.5,
    total: 1800.0,
  },
  {
    desc: "Levering til adresse — Nørrebrogade 78, 2200 Kbh N",
    qty: "1 stk",
    unitPrice: 450.0,
    total: 450.0,
  },
  {
    desc: "Montering på stillads inkl. mandskab og lift\n(udført 12. maj 2026)",
    qty: "80 m²",
    unitPrice: 78.0,
    total: 6240.0,
  },
  {
    desc: "Kommunalt gebyr — Københavns Kommune\n(stilladstilladelse + reklame-ansøgning)",
    qty: "1 stk",
    unitPrice: 2450.0,
    total: 2450.0,
  },
];

let y = tableTop + 28;
doc.font("Helvetica").fillColor("#000").fontSize(9);
for (const line of lines) {
  doc.text(line.desc, 58, y, { width: 250 });
  doc.text(line.qty, 320, y, { width: 50, align: "right" });
  doc.text(`${fmt(line.unitPrice)} kr`, 380, y, { width: 60, align: "right" });
  doc.text(`${fmt(line.total)} kr`, 450, y, { width: 90, align: "right" });
  // Row height depends on lines in description
  const rowH = line.desc.includes("\n") ? 34 : 22;
  y += rowH;
  doc.moveTo(50, y - 4).lineTo(550, y - 4).strokeColor("#e5e7eb").stroke();
}

// Totals
const netto = lines.reduce((s, l) => s + l.total, 0);
const moms = netto * 0.25;
const brutto = netto + moms;

y += 10;
doc.font("Helvetica").fontSize(9).fillColor("#555");
doc.text("Subtotal (ekskl. moms):", 360, y, { width: 130, align: "right" });
doc.font("Helvetica-Bold").fillColor("#000").text(`${fmt(netto)} kr`, 490, y, { width: 60, align: "right" });
y += 16;
doc.font("Helvetica").fillColor("#555").text("Moms 25%:", 360, y, { width: 130, align: "right" });
doc.font("Helvetica-Bold").fillColor("#000").text(`${fmt(moms)} kr`, 490, y, { width: 60, align: "right" });
y += 18;
doc.rect(355, y - 4, 195, 24).fill("#1f2937");
doc.fillColor("#fff").font("Helvetica-Bold").fontSize(11).text("Total inkl. moms:", 360, y + 2, { width: 130, align: "right" });
doc.text(`${fmt(brutto)} kr`, 490, y + 2, { width: 60, align: "right" });

// Footer
doc.fillColor("#555").font("Helvetica").fontSize(8);
doc.text(
  "Betaling: Reg. 3001 Konto 1234567890  •  Mobilepay erhverv: 47831  •  Anfør faktura-nr ved betaling.",
  50,
  720
);
doc.text(
  "Ved for sen betaling tillægges rente 1,5% pr. påbegyndt måned + rykkergebyr 100 kr.",
  50,
  734
);

doc.end();

await new Promise((resolve) => setTimeout(resolve, 500));
console.log(`✓ Demo-faktura genereret: ${outPath}`);
console.log(`  Linjer: ${lines.length}, Netto: ${fmt(netto)} kr, Brutto: ${fmt(brutto)} kr`);
