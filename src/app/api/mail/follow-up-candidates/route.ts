// ============================================================
// GET /api/mail/follow-up-candidates?days=7
// Returns properties with FOERSTE_MAIL_SENDT where first mail was sent 7+ days ago
// (candidates for sending a follow-up email)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { supabase, HAS_SUPABASE } from "@/lib/supabase";
import { fetchEjendommeByStatus } from "@/lib/hubspot";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get("days")) || 7));
    const since = new Date();
    since.setDate(since.getDate() - days);

    const candidatesByProperty = new Map<string, string>(); // propertyId -> oldest sentAt

    if (HAS_SUPABASE && supabase) {
      const { data: rows, error } = await supabase
        .from("mail_thread_property")
        .select("property_id, created_at")
        .lt("created_at", since.toISOString());
      if (error) {
        logger.warn("Supabase error", { service: "mail-follow-up-candidates" });
        return NextResponse.json({ candidates: [], error: "Kunne ikke hente tråde" }, { status: 500 });
      }
      for (const row of rows || []) {
        if (row.property_id && row.created_at) {
          const existing = candidatesByProperty.get(row.property_id);
          if (!existing || row.created_at < existing) {
            candidatesByProperty.set(row.property_id, row.created_at);
          }
        }
      }
    }

    const candidates: { propertyId: string; sentAt: string }[] = Array.from(candidatesByProperty.entries()).map(([propertyId, sentAt]) => ({ propertyId, sentAt }));

    // Restrict to properties that still have status FOERSTE_MAIL_SENDT
    let propertiesWithStatus: { id: string }[] = [];
    try {
      const list = await fetchEjendommeByStatus("FOERSTE_MAIL_SENDT", 500);
      propertiesWithStatus = list.map((p) => ({ id: p.id }));
    } catch (e) {
      logger.warn("HubSpot fetch failed", { service: "mail-follow-up-candidates" });
    }

    const allowedIds = new Set(propertiesWithStatus.map((p) => p.id));
    const filtered = candidates.filter((c) => allowedIds.has(c.propertyId));

    return NextResponse.json({ candidates: filtered });
  } catch (error) {
    logger.error("Follow-up candidates failed", { service: "mail-follow-up-candidates" });
    return NextResponse.json(
      { candidates: [], error: error instanceof Error ? error.message : "Fejl" },
      { status: 500 }
    );
  }
}
