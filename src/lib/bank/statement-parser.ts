import { createHash } from "crypto";
import { logger } from "@/lib/logger";
import { categorizeTransaction } from "./categorize";
import type { BankTransaction } from "./types";

export interface ParsedStatement {
  accountHolder: string;
  accountNumber: string;
  openingBalance: number;
  closingBalance: number;
  transactions: BankTransaction[];
}

/** Parse a Danish-formatted number: "224.783,03" → 224783.03, "-52.843,41" → -52843.41 */
function parseDaNumber(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

// Danish money token: optional minus, thousands with dots, two decimals
const NUM_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const LINE_RE = /^(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2})\s+(.+)$/;

function isoDate(da: string): string {
  // DD.MM.YYYY → YYYY-MM-DD
  const [d, m, y] = da.split(".");
  return `${y}-${m}-${d}`;
}

/**
 * Parse a Lunar account-statement PDF (text already extracted) into transactions.
 * Each line: "DD.MM.YYYY HH.MM  <title>  <amount>  <balance>"
 * FX lines have a third number: "<title> <fxAmount> EUR <dkkAmount> <balance>"
 */
export function parseStatementText(text: string): ParsedStatement {
  const lines = text.split(/\r?\n/);

  let accountHolder = "";
  let accountNumber = "";
  let openingBalance = 0;
  let closingBalance = 0;

  const transactions: BankTransaction[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Metadata
    const openM = line.match(/Opening Balance:\s*([\d.,-]+)/i);
    if (openM) openingBalance = parseDaNumber(openM[1]);
    const closeM = line.match(/Closing Balance:\s*([\d.,-]+)/i);
    if (closeM) closingBalance = parseDaNumber(closeM[1]);
    const accM = line.match(/^(\d{10,})$/);
    if (accM && !accountNumber) accountNumber = accM[1];

    // Transaction line
    const m = line.match(LINE_RE);
    if (!m) continue;

    const [, dateRaw, timeRaw, rest] = m;
    const nums = [...rest.matchAll(NUM_RE)];
    if (nums.length < 2) continue;

    const balance = parseDaNumber(nums[nums.length - 1][0]);
    const amount = parseDaNumber(nums[nums.length - 2][0]);

    // FX: 3+ money tokens → first is foreign amount, currency code follows it
    let fxAmount: number | null = null;
    let fxCurrency: string | null = null;
    if (nums.length >= 3) {
      fxAmount = parseDaNumber(nums[0][0]);
      const afterFx = rest.slice((nums[0].index ?? 0) + nums[0][0].length).trimStart();
      const curM = afterFx.match(/^([A-Z]{3})\b/);
      fxCurrency = curM ? curM[1] : null;
    }

    // Title = text before the first money token
    const title = rest.slice(0, nums[0].index ?? rest.length).trim();
    const postedDate = isoDate(dateRaw);

    const hash = createHash("sha1")
      .update(`${postedDate}|${timeRaw}|${title}|${amount}|${balance}`)
      .digest("hex")
      .slice(0, 24);

    transactions.push({
      id: `tx-${hash}`,
      postedDate,
      postedTime: timeRaw,
      title,
      amount,
      balance,
      fxAmount,
      fxCurrency,
      category: categorizeTransaction(title, amount),
      account: "",
    });
  }

  // Account holder: linje efter "Account holder"
  const holderIdx = lines.findIndex((l) => /^Account holder/i.test(l.trim()));
  if (holderIdx >= 0) {
    for (let j = holderIdx + 1; j < Math.min(holderIdx + 4, lines.length); j++) {
      const v = lines[j].trim();
      if (v) {
        accountHolder = v;
        break;
      }
    }
  }

  if (transactions.length === 0) {
    logger.warn("[statement-parser] No transactions parsed from statement");
  }

  // Closing balance fallback: nyeste transaktions saldo
  if (!closingBalance && transactions.length > 0) {
    const sorted = [...transactions].sort((a, b) =>
      b.postedDate.localeCompare(a.postedDate)
    );
    closingBalance = sorted[0].balance;
  }

  return { accountHolder, accountNumber, openingBalance, closingBalance, transactions };
}
