// ============================================================
// POST /api/bank/import
// Upload et Lunar kontoudtog (PDF) → parse transaktioner →
// gem i bank_transactions → opdatér kassebeholdning i case_settings.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { parseStatementText } from "@/lib/bank/statement-parser";
import { saveBankTransactions } from "@/lib/bank/store";
import { updateCostSettings } from "@/lib/case/settings-store";
import { logger } from "@/lib/logger";

// Defense-in-depth: polyfill DOMMatrix på globalThis FØR pdfjs (via unpdf) loades.
// unpdf har sin egen polyfill, men Next.js/webpack tree-shaker nogle gange
// pakker med "sideEffects: false" (som unpdf har sat), så vi sætter det også
// her for at være helt sikre.
if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === "undefined") {
  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }
    translateSelf(tx: number, ty = 0) {
      this.e = this.a * tx + this.c * ty + this.e;
      this.f = this.b * tx + this.d * ty + this.f;
      return this;
    }
    scaleSelf(sx: number, sy = sx) {
      this.a *= sx; this.b *= sx; this.c *= sy; this.d *= sy;
      return this;
    }
    multiplySelf() { return this; }
    invertSelf() { return this; }
  }
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = DOMMatrixPolyfill;
}

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Ingen fil modtaget" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Filen er for stor (max ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Udtræk tekst med unpdf — designet til serverless Node.js (Vercel).
    // pdfjs-dist@5 fjernede Node-polyfills fra sin legacy-build, og pdf-parse@2
    // brugte den moderne build, så uploaden fejlede med "DOMMatrix is not defined".
    // unpdf wrapper pdfjs med de nødvendige polyfills indbygget.
    // unpdf's extractText kollapser alle whitespaces (inkl. linjeskift) til mellemrum
    // når mergePages: true — så vores statement-parser ikke kan finde rækker.
    // Vi bruger extractTextItems i stedet og rekonstruerer rækker via Y-koordinat,
    // så hver transaktionsrække ender som én linje (som parseren forventer).
    const { extractTextItems } = await import("unpdf");
    const { items: pageItems } = await extractTextItems(new Uint8Array(buffer));
    const lines: string[] = [];
    for (const items of pageItems) {
      // Gruppér items efter Y (afrundet til 2-pixel buckets så ascendere/descendere falder sammen)
      const rowsByY = new Map<number, Array<{ x: number; str: string }>>();
      for (const item of items) {
        const yKey = Math.round(item.y / 2) * 2;
        let row = rowsByY.get(yKey);
        if (!row) {
          row = [];
          rowsByY.set(yKey, row);
        }
        row.push({ x: item.x, str: item.str });
      }
      // PDF-Y vokser opad → sortér descending så vi får øverste række først
      const ys = [...rowsByY.keys()].sort((a, b) => b - a);
      for (const y of ys) {
        const row = rowsByY.get(y)!;
        row.sort((a, b) => a.x - b.x);
        const lineText = row.map((r) => r.str).join(" ").replace(/\s+/g, " ").trim();
        if (lineText) lines.push(lineText);
      }
    }
    const text = lines.join("\n").trim();
    if (text.length < 100) {
      return NextResponse.json(
        { error: "Kunne ikke læse kontoudtoget. Upload PDF'en direkte fra Lunar (ikke et foto)." },
        { status: 422 }
      );
    }

    const statement = parseStatementText(text);
    if (statement.transactions.length === 0) {
      return NextResponse.json(
        { error: "Ingen transaktioner fundet i PDF'en. Er det et Lunar kontoudtog?" },
        { status: 422 }
      );
    }

    const saved = await saveBankTransactions(statement.transactions);

    // Opdatér kassebeholdning til kontoudtogets slutsaldo
    let cashUpdated = false;
    try {
      await updateCostSettings({
        cashBalance: statement.closingBalance,
        cashBalanceUpdatedAt: new Date().toISOString(),
      });
      cashUpdated = true;
    } catch (e) {
      logger.warn(`[bank-import] kunne ikke opdatere kassebeholdning: ${e instanceof Error ? e.message : e}`);
    }

    return NextResponse.json({
      success: true,
      imported: saved,
      closingBalance: statement.closingBalance,
      accountHolder: statement.accountHolder,
      accountNumber: statement.accountNumber,
      cashUpdated,
    });
  } catch (error) {
    logger.error(`[bank-import] ${error instanceof Error ? error.message : error}`, {
      service: "bank",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import fejlede" },
      { status: 500 }
    );
  }
}
