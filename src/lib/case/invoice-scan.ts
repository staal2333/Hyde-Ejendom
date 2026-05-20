// ============================================================
// Invoice scanner — extract structured cost data from a supplier
// invoice (PDF or image) so it can be applied to a case.
//
// Flow:
//   - PDF (text-based) → extract text via pdfjs-dist → text prompt
//   - PDF (image-based, e.g. scanned) → fall back to vision
//   - Image (JPG/PNG) → GPT-4o-mini vision
//
// The model categorises each line as produktion / montering /
// kommunale / overhead / andet so the UI can apply the right
// totals to the case's costs object.
// ============================================================

import OpenAI from "openai";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: config.openai.apiKey() });
  }
  return _client;
}

export type InvoiceLineType =
  | "produktion"
  | "montering"
  | "kommunale"
  | "overhead"
  | "medie"      // Medievisning — IKKE en kost, ignoreres i rollup
  | "andet";

export interface InvoiceLine {
  description: string;
  type: InvoiceLineType;
  amount: number;          // net amount (excl. VAT) in DKK
  quantity?: number;       // m² or units, when extractable
  unitPrice?: number;      // amount / quantity
  confidence: number;      // 0-1
}

export interface InvoiceScanResult {
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  totalNet: number;
  totalVat: number;
  totalGross: number;
  currency: string;
  lines: InvoiceLine[];
  notes: string;
  rawTextSample: string;
}

const SYSTEM_PROMPT = `Du er en præcis dansk faktura-scanner. Du modtager teksten eller billedet af en LEVERANDØRFAKTURA og udtrækker strukturerede data.

Hver linje på fakturaen skal kategoriseres som ÉN af:
- "medie"       → medievisning, banner-display, kampagne-eksponering, ad-impressions
                  (DETTE ER IKKE EN OMKOSTNING — det er en omsætning/sale. Ignoreres i kostpris-rollup.)
- "produktion"  → tryk/produktion af banner, print, vinyl, mesh (alt der involverer at lave selve mediet)
- "montering"   → opsætning, montering, nedtagning, ophæng, kran/lift
- "kommunale"   → kommunale gebyrer, vejmyndighed, ansøgninger til myndigheder, "kommune afgift"
- "overhead"    → administration, transport, kørsel, planlægning
- "andet"       → alt andet (forsikring, materialer, etc.)

Vær KONSERVATIV med kategorisering — hvis du ikke er sikker, vælg "andet" med lav confidence.
ALDRIG putte medievisning, "medie", "kampagne", eller "exposure" i "andet" — det skal være "medie".
Beløb er ALTID i DKK ekskl. moms (netto). Hvis fakturaen viser brutto, beregn netto.
Hvis m² er angivet (fx "100 m² x 150,00"), udfyld quantity og unitPrice.

Svar i JSON:
{
  "vendor": "Leverandørens firmanavn",
  "invoice_number": "Fakturanummer eller tom streng",
  "invoice_date": "YYYY-MM-DD eller tom streng",
  "total_net": <netto beløb>,
  "total_vat": <moms beløb>,
  "total_gross": <brutto beløb>,
  "currency": "DKK",
  "lines": [
    {
      "description": "Linjebeskrivelse fra fakturaen",
      "type": "medie | produktion | montering | kommunale | overhead | andet",
      "amount": <netto beløb for linjen>,
      "quantity": <m² eller stk, hvis angivet>,
      "unit_price": <pris pr. enhed, hvis beregnelig>,
      "confidence": 0.0-1.0
    }
  ],
  "notes": "Kort note om usikkerheder eller specielle observationer"
}

REGLER:
- Opfind ALDRIG tal der ikke står på fakturaen
- confidence 0.9+ kun hvis kategori er åbenlys
- confidence 0.5 hvis tvivlsom
- Hvis fakturaen er svær at læse, beskriv det i notes`;

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import — pdfjs-dist is heavy and only needed when scanning
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const uint8 = new Uint8Array(buffer);
    const loadingTask = pdfjs.getDocument({ data: uint8, useSystemFonts: true });
    const doc = await loadingTask.promise;

    const pages: string[] = [];
    const maxPages = Math.min(doc.numPages, 5);
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ("str" in item ? (item as { str: string }).str : ""))
        .join(" ");
      pages.push(text);
    }
    return pages.join("\n\n").trim();
  } catch (err) {
    logger.warn(`[invoice-scan] PDF text extraction failed: ${err instanceof Error ? err.message : err}`);
    return "";
  }
}

function parseResponse(raw: string, textSample: string): InvoiceScanResult {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.error(`[invoice-scan] Invalid JSON from LLM: ${raw.slice(0, 200)}`);
  }

  const linesRaw = Array.isArray(parsed.lines) ? parsed.lines : [];
  const lines: InvoiceLine[] = linesRaw.map((l) => {
    const line = l as Record<string, unknown>;
    const typeRaw = String(line.type || "andet").toLowerCase();
    const validTypes = ["medie", "produktion", "montering", "kommunale", "overhead", "andet"];
    let type: InvoiceLineType = (validTypes.includes(typeRaw) ? typeRaw : "andet") as InvoiceLineType;

    // Safety net: hvis AI alligevel kategoriserer som "andet" men description ligner medie,
    // promovér til "medie" så det IKKE ryger i overhead-rollup.
    const desc = String(line.description || "").toLowerCase();
    if (type === "andet" && /medievisning|medie\b|kampagne.eksponering|impression/.test(desc)) {
      type = "medie";
    }
    return {
      description: String(line.description || ""),
      type,
      amount: Number(line.amount || 0),
      quantity: line.quantity != null ? Number(line.quantity) : undefined,
      unitPrice: line.unit_price != null ? Number(line.unit_price) : undefined,
      confidence: Math.max(0, Math.min(1, Number(line.confidence ?? 0.5))),
    };
  });

  return {
    vendor: String(parsed.vendor || ""),
    invoiceNumber: String(parsed.invoice_number || ""),
    invoiceDate: String(parsed.invoice_date || ""),
    totalNet: Number(parsed.total_net || 0),
    totalVat: Number(parsed.total_vat || 0),
    totalGross: Number(parsed.total_gross || 0),
    currency: String(parsed.currency || "DKK"),
    lines,
    notes: String(parsed.notes || ""),
    rawTextSample: textSample.slice(0, 600),
  };
}

export async function scanInvoiceFromText(text: string): Promise<InvoiceScanResult> {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Her er fakturaens tekst:\n\n${text}` },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "";
  return parseResponse(content, text);
}

export async function scanInvoiceFromImage(
  buffer: Buffer,
  mimeType: string
): Promise<InvoiceScanResult> {
  const client = getClient();
  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const response = await client.chat.completions.create({
    model: config.openai.model, // gpt-4o-mini supports vision
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Ekstrahér data fra denne faktura:" },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "";
  return parseResponse(content, "[image input]");
}

/**
 * Auto-detect file type and route to text or vision extraction.
 * PDFs with embedded text use text extraction; image PDFs or empty
 * extractions fall back to vision.
 */
export async function scanInvoiceFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<InvoiceScanResult> {
  const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isImage = mimeType.startsWith("image/");

  if (isPdf) {
    const text = await extractPdfText(buffer);
    if (text.length >= 80) {
      logger.info(`[invoice-scan] Using text extraction (${text.length} chars)`);
      return scanInvoiceFromText(text);
    }
    // PDF text extraction returned little/nothing — likely a scanned image PDF.
    // Without a rasterizer in scope we fail clearly instead of silently producing garbage.
    throw new Error(
      "Kunne ikke udtrække tekst fra PDF. Hvis fakturaen er en scannet billede-PDF, så upload den som JPG/PNG i stedet."
    );
  }

  if (isImage) {
    logger.info(`[invoice-scan] Using vision (mime=${mimeType})`);
    return scanInvoiceFromImage(buffer, mimeType);
  }

  throw new Error(`Filtype understøttes ikke: ${mimeType}. Brug PDF, JPG eller PNG.`);
}

// ════════════════════════════════════════════════════════════
// KUNDE-FAKTURA SCAN — udgående faktura (Hyde → bygherre).
// Udtrækker hele case-strukturen: medievisning (listpris+rabat),
// produktion/montering/kommune salgspriser, areal, bygherre, periode.
// ════════════════════════════════════════════════════════════

export interface CustomerInvoiceResult {
  bygherre: string;          // fakturamodtager
  annoncør: string;          // kunden der reklamerer
  address: string;           // hvor stilladset står
  areaSqm: number;
  fromDate: string;          // YYYY-MM-DD eller ""
  toDate: string;
  invoiceNumber: string;
  invoiceDate: string;
  medieListpris: number;     // enhedspris før rabat
  medieRabatPct: number;
  medieNetto: number;        // pris efter rabat
  produktionSalg: number;
  monteringSalg: number;
  kommunaleSalg: number;
  notes: string;
}

const CUSTOMER_SYSTEM_PROMPT = `Du scanner en KUNDE-FAKTURA som et out-of-home media-bureau har sendt til en bygherre/kunde for en stillads-reklamekampagne.

Fakturaen har typisk disse linjer:
1. MEDIEVISNING — har en Enhedspris (listepris FØR rabat), en Rabat i %, og en endelig Pris (netto EFTER rabat). Beskrivelsen indeholder ofte areal + adresse, fx "170 m2 Gammel Kongevej 49".
2. PRODUKTION — tryk/print af banner. Beskrivelse ofte "170*150 DKK/m2". Brug linjens samlede Pris.
3. MONTERING — opsætning/nedtagning af banner.
4. KOMMUNE AFGIFT — kommunalt gebyr.

Udtræk følgende. Brug 0 / tom streng hvis noget mangler — opfind ALDRIG tal.

Svar i JSON:
{
  "bygherre": "Fakturamodtagerens firmanavn (øverst på fakturaen)",
  "annoncoer": "Annoncøren/kunden der reklamerer — ofte i 'Kunde:'-feltet",
  "address": "Adressen hvor stilladset står (fra medievisning-linjens beskrivelse)",
  "area_sqm": <areal i m², fx 170>,
  "from_date": "YYYY-MM-DD hvis kampagne-startdato kan udledes, ellers tom",
  "to_date": "YYYY-MM-DD hvis slutdato kan udledes, ellers tom",
  "invoice_number": "Fakturanummer",
  "invoice_date": "YYYY-MM-DD fakturadato",
  "medie_listpris": <medievisningens Enhedspris FØR rabat>,
  "medie_rabat_pct": <rabatprocent på medievisning, fx 84.28>,
  "medie_netto": <medievisningens endelige Pris EFTER rabat>,
  "produktion_salg": <produktion-linjens samlede pris>,
  "montering_salg": <montering-linjens samlede pris>,
  "kommunale_salg": <kommune-afgift-linjens pris>,
  "notes": "Kort note om usikkerheder eller manglende felter"
}

VIGTIGT:
- medie_listpris er Enhedsprisen FØR rabat — ofte et stort tal
- medie_netto er den endelige Pris EFTER rabat
- Hvis kun "Uge X" er angivet, prøv at udlede datoer ud fra fakturadatoens år
- Alle beløb er ekskl. moms (netto)`;

function parseCustomerResponse(raw: string): CustomerInvoiceResult {
  let p: Record<string, unknown> = {};
  try {
    p = JSON.parse(raw);
  } catch {
    logger.error(`[customer-invoice] Invalid JSON from LLM: ${raw.slice(0, 200)}`);
  }
  return {
    bygherre: String(p.bygherre || ""),
    annoncør: String(p.annoncoer || p.annoncør || ""),
    address: String(p.address || ""),
    areaSqm: Number(p.area_sqm || 0),
    fromDate: String(p.from_date || ""),
    toDate: String(p.to_date || ""),
    invoiceNumber: String(p.invoice_number || ""),
    invoiceDate: String(p.invoice_date || ""),
    medieListpris: Number(p.medie_listpris || 0),
    medieRabatPct: Math.max(0, Math.min(100, Number(p.medie_rabat_pct || 0))),
    medieNetto: Number(p.medie_netto || 0),
    produktionSalg: Number(p.produktion_salg || 0),
    monteringSalg: Number(p.montering_salg || 0),
    kommunaleSalg: Number(p.kommunale_salg || 0),
    notes: String(p.notes || ""),
  };
}

export async function scanCustomerInvoiceFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<CustomerInvoiceResult> {
  const client = getClient();
  const isPdf = mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
  const isImage = mimeType.startsWith("image/");

  let userContent: OpenAI.Chat.ChatCompletionContentPart[] | string;

  if (isPdf) {
    const text = await extractPdfText(buffer);
    if (text.length < 80) {
      throw new Error(
        "Kunne ikke udtrække tekst fra PDF. Hvis fakturaen er en scannet billede-PDF, så upload den som JPG/PNG i stedet."
      );
    }
    userContent = `Her er kunde-fakturaens tekst:\n\n${text}`;
  } else if (isImage) {
    const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    userContent = [
      { type: "text", text: "Ekstrahér case-data fra denne kunde-faktura:" },
      { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
    ];
  } else {
    throw new Error(`Filtype understøttes ikke: ${mimeType}. Brug PDF, JPG eller PNG.`);
  }

  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: "system", content: CUSTOMER_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 1500,
  });

  return parseCustomerResponse(response.choices[0]?.message?.content || "");
}

/**
 * Roll up scanned lines into the case's cost fields.
 * Lines are summed by type; "andet" goes into overhead.
 */
export function rollupForCase(result: InvoiceScanResult): {
  produktionKost: number;
  monteringKost: number;
  kommunaleGebyr: number;
  internalOverhead: number;
} {
  let produktion = 0;
  let montering = 0;
  let kommunale = 0;
  let overhead = 0;
  for (const line of result.lines) {
    const amt = Math.max(0, line.amount || 0);
    switch (line.type) {
      case "produktion":
        produktion += amt;
        break;
      case "montering":
        montering += amt;
        break;
      case "kommunale":
        kommunale += amt;
        break;
      case "overhead":
      case "andet":
        overhead += amt;
        break;
      case "medie":
        // Medievisning er ikke en omkostning — skal ikke med i cost-rollup.
        break;
    }
  }
  return {
    produktionKost: produktion,
    monteringKost: montering,
    kommunaleGebyr: kommunale,
    internalOverhead: overhead,
  };
}
