// ============================================================
// POST /api/agent/street – Full autonomous street agent
// Chains: discover → stage → research → email draft in one SSE stream
// Properties land in staging – user must approve before HubSpot push.
// ============================================================

import { NextRequest } from "next/server";
import { discoverStreet } from "@/lib/discovery";
import { processStagedProperty } from "@/lib/workflow/engine";
import { listStagedProperties } from "@/lib/staging/store";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { street, city = "København", minScore = 6, minTraffic = 10000 } = body;

  if (!street) {
    return new Response(JSON.stringify({ error: "street is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let cancelled = false;

      const send = (event: Record<string, unknown>) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          cancelled = true;
        }
      };

      const isCancelled = () => cancelled;

      try {
        // ══════════════════════════════════════════════════
        // Phase 1: DISCOVERY – Find buildings on the street
        // ══════════════════════════════════════════════════
        send({
          phase: "agent_start",
          message: `Agent starter: ${street}, ${city}`,
          detail: "Fase 1: Finder bygninger → Fase 2: Researcher ejere → Fase 3: Genererer mails",
          progress: 0,
          agentPhase: "discovery",
        });

        const discoveryResult = await discoverStreet(
          street,
          city,
          minScore,
          minTraffic,
          (event) => {
            send({
              ...event,
              agentPhase: "discovery",
              // Scale discovery progress to 0-30%
              progress: event.progress ? Math.round(event.progress * 0.3) : undefined,
            });
          },
          isCancelled
        );

        if (cancelled) return;

        const createdCount = discoveryResult.created;
        const totalCandidates = discoveryResult.candidates.length;

        send({
          phase: "discovery_complete",
          message: `Fase 1 færdig: ${createdCount} nye ejendomme staged (${discoveryResult.alreadyExists} fandtes allerede)`,
          detail: `${totalCandidates} bygninger vurderet, ${createdCount} kvalificeret → staging`,
          progress: 30,
          agentPhase: "discovery",
          stats: {
            totalBuildings: totalCandidates,
            created: createdCount,
            alreadyExists: discoveryResult.alreadyExists,
            skipped: discoveryResult.skipped,
          },
        });

        if (createdCount === 0 && discoveryResult.alreadyExists === 0) {
          send({
            phase: "agent_done",
            message: "Agent færdig: Ingen nye ejendomme at researche",
            progress: 100,
            agentPhase: "done",
          });
          controller.close();
          return;
        }

        // ══════════════════════════════════════════════════
        // Phase 2: RESEARCH – Run full pipeline on each new property
        // ══════════════════════════════════════════════════
        send({
          phase: "research_start",
          message: `Fase 2: Researcher ${createdCount} ejendomme (OIS → CVR → web → AI)...`,
          progress: 31,
          agentPhase: "research",
        });

        // Fetch the newly staged properties from Supabase
        const allStaged = await listStagedProperties({ stage: "new" });

        // Filter to only properties from this street
        const streetLower = street.toLowerCase();
        const newProperties = allStaged.filter(p =>
          p.address?.toLowerCase().includes(streetLower) ||
          p.name?.toLowerCase().includes(streetLower)
        );

        if (newProperties.length === 0) {
          send({
            phase: "agent_done",
            message: "Ingen nye ejendomme fundet til research (de kan allerede være researched)",
            progress: 100,
            agentPhase: "done",
          });
          controller.close();
          return;
        }

        let researchCompleted = 0;
        let researchFailed = 0;
        let emailDraftsGenerated = 0;

        for (let i = 0; i < newProperties.length; i++) {
          if (cancelled) break;

          const stagedProp = newProperties[i];
          const propPct = 31 + Math.round((i / newProperties.length) * 60); // 31-91%

          send({
            phase: "research_property",
            message: `Researcher ${i + 1}/${newProperties.length}: ${stagedProp.address}`,
            progress: propPct,
            agentPhase: "research",
          });

          const run = await processStagedProperty(
            stagedProp,
            (event) => {
              send({
                ...event,
                agentPhase: "research",
                progress: propPct + Math.round((event.progress || 0) / newProperties.length * 0.6),
              });
            },
            isCancelled
          );

          if (run.status === "completed") {
            researchCompleted++;
            // Check if an email draft was generated
            const hasDraft = run.steps.some(
              s => s.stepId === "generate_email_draft" && s.status === "completed"
            );
            if (hasDraft) emailDraftsGenerated++;

            send({
              phase: "research_property_done",
              message: `${stagedProp.address}: Research fuldført${hasDraft ? " + email-udkast genereret" : ""}`,
              progress: propPct,
              agentPhase: "research",
            });
          } else {
            researchFailed++;
            send({
              phase: "research_property_failed",
              message: `${stagedProp.address}: Research fejlede – ${run.error || "ukendt fejl"}`,
              progress: propPct,
              agentPhase: "research",
            });
          }
        }

        // ══════════════════════════════════════════════════
        // Phase 3: DONE – Summary
        // ══════════════════════════════════════════════════
        send({
          phase: "agent_done",
          message: `Agent færdig! ${researchCompleted} researched i staging, ${emailDraftsGenerated} email-udkast klar – godkend i Staging Queue`,
          detail: [
            `Gade: ${street}, ${city}`,
            `Bygninger fundet: ${totalCandidates}`,
            `Nye ejendomme: ${createdCount}`,
            `Research fuldført: ${researchCompleted}`,
            `Research fejlet: ${researchFailed}`,
            `Email-udkast klar: ${emailDraftsGenerated}`,
          ].join("\n"),
          progress: 100,
          agentPhase: "done",
          stats: {
            totalBuildings: totalCandidates,
            created: createdCount,
            alreadyExists: discoveryResult.alreadyExists,
            researchCompleted,
            researchFailed,
            emailDraftsGenerated,
          },
        });
      } catch (error) {
        if (!cancelled) {
          send({
            phase: "error",
            message: `Agent fejl: ${error instanceof Error ? error.message : "Ukendt fejl"}`,
            progress: 100,
            agentPhase: "error",
          });
        }
      } finally {
        if (!cancelled) {
          try { controller.close(); } catch { /* already closed */ }
        }
      }
    },
    cancel() {
      // Client disconnected
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
