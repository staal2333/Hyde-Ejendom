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

    // Udtræk tekst med pdf-parse
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = (result.text || "").trim();
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
