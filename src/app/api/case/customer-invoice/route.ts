// ============================================================
// POST /api/case/customer-invoice
// Scanner en udgående kunde-faktura (PDF/billede), udtrækker hele
// case-strukturen og opretter en ny case i databasen.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { scanCustomerInvoiceFile } from "@/lib/case/invoice-scan";
import { caseFromCustomerInvoice } from "@/lib/case/from-customer-invoice";
import { getCostSettings } from "@/lib/case/settings-store";
import { upsertCase } from "@/lib/case/store";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const kommune = (formData.get("kommune") as string | null) || undefined;
    const previewOnly = formData.get("previewOnly") === "true";

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
    const mime = file.type || "application/octet-stream";

    const scan = await scanCustomerInvoiceFile(buffer, mime, file.name);
    const settings = await getCostSettings();
    const caseInput = caseFromCustomerInvoice(scan, settings, kommune);

    // previewOnly: returnér uden at gemme (bruges hvis UI vil vise review først)
    if (previewOnly) {
      return NextResponse.json({ success: true, scan, caseInput });
    }

    const saved = await upsertCase(caseInput);
    return NextResponse.json({ success: true, scan, case: saved });
  } catch (error) {
    logger.error(`[customer-invoice] ${error instanceof Error ? error.message : error}`, {
      service: "case",
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan fejlede" },
      { status: 500 }
    );
  }
}
