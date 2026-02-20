// ============================================================
// POST /api/mail/prepare-follow-ups
// For each follow-up candidate (7+ days, FOERSTE_MAIL_SENDT), generate
// an AI follow-up email draft and save it on the property in HubSpot.
// Body: { days?: number, limit?: number } (default days=7, limit=20)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { config } from "@/lib/config";
import { fetchEjendomById, saveEmailDraft } from "@/lib/hubspot";
import { supabase, HAS_SUPABASE } from "@/lib/supabase";

const openai = new OpenAI({ apiKey: config.openai.apiKey() });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(90, Math.max(1, Number(body.days) || 7));
    const limit = Math.min(50, Math.max(1, Number(body.limit) || 20));

    const since = new Date();
    since.setDate(since.getDate() - days);

    const candidatesByProperty = new Map<string, string>();
    if (HAS_SUPABASE && supabase) {
      const { data: rows, error } = await supabase
        .from("mail_thread_property")
        .select("property_id, created_at")
        .lt("created_at", since.toISOString());
      if (error) {
        return NextResponse.json({ error: "Kunne ikke hente tråde", prepared: 0, failed: 0 }, { status: 500 });
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

    const { fetchEjendommeByStatus } = await import("@/lib/hubspot");
    const sentList = await fetchEjendommeByStatus("FOERSTE_MAIL_SENDT", 500);
    const allowedIds = new Set(sentList.map((p) => p.id));
    const candidates = Array.from(candidatesByProperty.entries())
      .filter(([id]) => allowedIds.has(id))
      .slice(0, limit)
      .map(([propertyId, sentAt]) => ({ propertyId, sentAt }));

    const tone = config.toneOfVoice;
    const results: { propertyId: string; success: boolean; error?: string }[] = [];

    for (const { propertyId, sentAt } of candidates) {
      try {
        const prop = await fetchEjendomById(propertyId);
        const contactName = prop.contactPerson || prop.ownerCompanyName || "modtager";
        const address = [prop.address, prop.postalCode, prop.city].filter(Boolean).join(", ");
        const previousSubject = prop.emailDraftSubject || "udendørs reklame / outdoor";
        const sentDate = new Date(sentAt);
        const daysAgo = Math.max(1, Math.floor((Date.now() - sentDate.getTime()) / (24 * 60 * 60 * 1000)));

        const completion = await openai.chat.completions.create({
          model: config.openai.model,
          messages: [
            {
              role: "system",
              content: `Du er en medarbejder hos Hyde Media. Du skriver en kort, venlig opfølgning på dansk. Tone: ${tone}. Vi sendte en første mail for ${daysAgo} dage siden og har ikke hørt. Skriv KUN brødteksten (ingen emnefelt, ingen signatur). Hold det kort (2-4 sætninger).`,
            },
            {
              role: "user",
              content: `Ejendom: ${address}. Kontakt: ${contactName}. Vores første mail handlede om: ${previousSubject}. Skriv en kort opfølgning der genopfrisker henvendelsen og inviterer til at vende tilbage.`,
            },
          ],
          temperature: 0.3,
          max_tokens: 300,
        });

        const bodyText = completion.choices?.[0]?.message?.content?.trim() || "Vi skrev til jer for nogle dage siden. Håber I har haft mulighed for at kigge på det – vi hører gerne fra jer.";
        const subject = previousSubject.startsWith("Opfølgning") ? previousSubject : `Opfølgning: ${previousSubject}`;

        await saveEmailDraft(propertyId, subject, bodyText, `Opfølgning genereret (sendt for ${daysAgo} dage siden)`);
        results.push({ propertyId, success: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Ukendt fejl";
        console.warn(`[prepare-follow-ups] ${propertyId}:`, msg);
        results.push({ propertyId, success: false, error: msg });
      }
    }

    const prepared = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    return NextResponse.json({
      ok: true,
      prepared,
      failed,
      total: candidates.length,
      results,
    });
  } catch (error) {
    console.error("[API] prepare-follow-ups failed:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Fejl", prepared: 0, failed: 0 },
      { status: 500 }
    );
  }
}
