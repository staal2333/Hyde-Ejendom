// ============================================================
// POST /api/leads/auto-enrich
// Batch auto-enrichment agent for leads.
// Streams progress via Server-Sent Events.
//
// For each lead (filtered by status and missing data):
//   1. CVR lookup by company name (if no CVR)
//   2. Proff financials (egenkapital, resultat, omsaetning)
//   3. Proff leadership (decision makers)
//   4. Website scraping (contacts + email)
//   5. Email finding for marketing contacts
//   6. Priority sorting (marketing/salg first)
//
// Query params:
//   ?status=new         – only process leads with this status (default: new)
//   ?limit=20           – max leads to process per run (default: 20)
//   ?ids=id1,id2        – process specific lead IDs
// ============================================================

import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import type { LeadStatus } from "@/lib/lead-sourcing/lead-store";

export const maxDuration = 300; // 5 minutes max

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get("status") || "new";
  const limitParam = parseInt(url.searchParams.get("limit") || "20", 10);
  const idsParam = url.searchParams.get("ids");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* client disconnected */ }
      };

      try {
        const { getLeads, getLeadById, updateLead } = await import("@/lib/lead-sourcing/lead-store");
        const { enrichLeadFull } = await import("@/lib/lead-sourcing/lead-enrichment");

        // ── Fetch leads to process ──
        let leads;
        if (idsParam) {
          const ids = idsParam.split(",").filter(Boolean);
          const fetched = await Promise.all(ids.map(id => getLeadById(id)));
          leads = fetched.filter((l): l is NonNullable<typeof l> => l !== null);
        } else {
          // Process all active statuses by default, or the specified one
          const statuses: LeadStatus[] = statusFilter === "all"
            ? ["new", "qualified", "contacted"]
            : [statusFilter as LeadStatus];
          leads = await getLeads({ statuses, limit: limitParam });
        }

        // Filter: only process leads that are missing CVR or contacts or financials
        const toProcess = leads.filter(l =>
          !l.cvr ||
          (l.contacts || []).length === 0 ||
          l.egenkapital == null
        );

        emit({
          phase: "start",
          total: toProcess.length,
          message: `Agent starter: ${toProcess.length} leads skal beriges`,
        });

        if (toProcess.length === 0) {
          emit({ phase: "done", total: 0, processed: 0, message: "Alle leads er allerede beriget" });
          controller.close();
          return;
        }

        let processed = 0;
        let enriched = 0;
        let cvrFound = 0;
        let contactsFound = 0;
        let financialsFound = 0;

        for (const lead of toProcess) {
          emit({
            phase: "processing",
            leadId: lead.id,
            leadName: lead.name,
            current: processed + 1,
            total: toProcess.length,
            progress: Math.round((processed / toProcess.length) * 100),
            message: `Beriger: ${lead.name}`,
          });

          try {
            const result = await enrichLeadFull({
              name: lead.name,
              cvr: lead.cvr,
              domain: lead.domain,
              website: lead.website,
              address: lead.address,
              industry: lead.industry,
            });

            // Build update object
            const updates: Record<string, unknown> = {};

            if (result.cvr && result.cvr !== lead.cvr) {
              updates.cvr = result.cvr;
              cvrFound++;
            }
            if (result.egenkapital != null && lead.egenkapital == null) {
              updates.egenkapital = result.egenkapital;
              financialsFound++;
            }
            if (result.resultat != null && lead.resultat == null) updates.resultat = result.resultat;
            if (result.omsaetning != null && lead.omsaetning == null) updates.omsaetning = result.omsaetning;
            if (result.website && !lead.website) updates.website = result.website;
            if (result.domain && !lead.domain) updates.domain = result.domain;
            if (result.contact_email && !lead.contact_email) updates.contact_email = result.contact_email;
            if (result.contact_phone && !lead.contact_phone) updates.contact_phone = result.contact_phone;
            if (result.contacts.length > 0 && (lead.contacts || []).length === 0) {
              updates.contacts = JSON.stringify(result.contacts);
              contactsFound++;
            }

            if (Object.keys(updates).length > 0) {
              await updateLead(lead.id, updates);
              enriched++;
            }

            emit({
              phase: "lead_done",
              leadId: lead.id,
              leadName: lead.name,
              cvr: result.cvr,
              contactsCount: result.contacts.length,
              primaryContact: result.contact_name,
              primaryRole: result.contact_role,
              hasEmail: !!result.contact_email,
              hasFinancials: result.egenkapital != null,
              updated: Object.keys(updates).length > 0,
              message: result.contact_name
                ? `${lead.name}: Fandt ${result.contacts.length} kontakter (${result.contact_role || "?"}) ${result.cvr ? `· CVR: ${result.cvr}` : ""}`
                : `${lead.name}: Ingen nye data fundet`,
            });

          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            logger.warn(`[auto-enrich] Failed for "${lead.name}": ${msg}`, { service: "lead-sourcing" });
            emit({
              phase: "lead_error",
              leadId: lead.id,
              leadName: lead.name,
              error: msg,
              message: `${lead.name}: Fejl – ${msg.slice(0, 80)}`,
            });
          }

          processed++;

          // Small delay to avoid hammering external APIs
          await new Promise(r => setTimeout(r, 500));
        }

        emit({
          phase: "done",
          total: toProcess.length,
          processed,
          enriched,
          cvrFound,
          contactsFound,
          financialsFound,
          message: `Agent færdig: ${enriched}/${processed} leads beriget (${cvrFound} CVR fundet, ${contactsFound} med kontakter, ${financialsFound} med finansdata)`,
        });

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger.error(`[auto-enrich] Fatal error: ${msg}`, { service: "lead-sourcing" });
        emit({ phase: "error", message: `Fejl: ${msg}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
