import type { CustomerInvoiceResult } from "./invoice-scan";
import type { CaseSale, CaseUpsertInput, CostSettings } from "./types";
import { createDefaultCase, lookupKommuneRate, caseDays } from "./types";

/**
 * Translate a scanned customer invoice into a full Case-input.
 *
 * Salgspriser kommer 1:1 fra fakturaen (hvad bygherre faktureres).
 * Kostpriser auto-beregnes fra cost-settings:
 *   - produktion: areal × produktionKostPerSqm
 *   - montering:  areal × monteringKostPerSqm
 *   - kommune:    1:1 passthrough (= salgspris)
 * Medievisning bliver til ét salg med listpris + rabat.
 */
export function caseFromCustomerInvoice(
  inv: CustomerInvoiceResult,
  settings: CostSettings,
  kommune?: string
): CaseUpsertInput {
  const base = createDefaultCase(1);
  const area = inv.areaSqm || 0;

  // listpris + rabat — foretræk de udtrukne værdier, ellers udled fra netto
  const listpris = inv.medieListpris > 0 ? inv.medieListpris : inv.medieNetto;
  const rabatPct =
    inv.medieListpris > 0 && inv.medieRabatPct > 0
      ? inv.medieRabatPct
      : inv.medieListpris > 0 && inv.medieNetto > 0
        ? Math.max(0, Math.min(100, (1 - inv.medieNetto / inv.medieListpris) * 100))
        : 0;

  const sale: CaseSale = {
    id: `sale-${Date.now()}-1`,
    annoncør: inv.annoncør || inv.bygherre || "",
    fromDate: inv.fromDate || "",
    toDate: inv.toDate || "",
    listpris,
    rabatPct: Number(rabatPct.toFixed(2)),
    salgspris: 0,
    notes: inv.invoiceNumber ? `Fra faktura ${inv.invoiceNumber}` : "",
  };

  // Kostpriser fra settings
  const produktionKost = area * (settings.produktionKostPerSqm || 0);
  const monteringKost = area * (settings.monteringKostPerSqm || 0);

  // Kommune: hvis settings har en rate for kommunen, brug den; ellers passthrough
  const days = caseDays({ startDate: inv.fromDate, endDate: inv.toDate });
  const kommuneRate = kommune
    ? lookupKommuneRate(settings.kommunaleRates || [], kommune)
    : 0;
  const kommunaleSalg =
    inv.kommunaleSalg > 0
      ? inv.kommunaleSalg
      : kommuneRate > 0
        ? area * kommuneRate * days
        : 0;

  return {
    ...base,
    id: undefined,
    title: `${inv.annoncør || "Kampagne"} — ${inv.address || "Stillads"}`,
    address: inv.address || "",
    kommune: kommune || "",
    bygherreNavn: inv.bygherre || "",
    areaSqm: area,
    varighedMaaneder: Math.max(1, Math.min(12, Math.round(days / 30) || 1)),
    startDate: inv.fromDate || "",
    endDate: inv.toDate || "",
    hydeSharePct: settings.defaultHydeSharePct,
    bygherreSharePct: 100 - settings.defaultHydeSharePct,
    sales: listpris > 0 ? [sale] : [],
    costs: {
      produktionSalg: inv.produktionSalg,
      monteringSalg: inv.monteringSalg,
      kommunaleSalg,
      produktionKost,
      monteringKost,
      kommunaleKost: kommunaleSalg, // 1:1 passthrough
      medieSalg: 0,
      kommunaleGebyr: kommunaleSalg,
      internalOverhead: 0,
    },
    status: "tilbud_sendt",
    notes:
      `Auto-oprettet fra kunde-faktura${inv.invoiceNumber ? ` ${inv.invoiceNumber}` : ""}` +
      `${inv.invoiceDate ? ` (${inv.invoiceDate})` : ""}.` +
      ` Kostpriser beregnet: produktion ${settings.produktionKostPerSqm} kr/m², montering ${settings.monteringKostPerSqm} kr/m².` +
      (inv.notes ? ` — Scan-note: ${inv.notes}` : ""),
  };
}
