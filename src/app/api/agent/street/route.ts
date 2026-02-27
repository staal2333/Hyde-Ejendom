// ============================================================
// POST /api/agent/street – Full autonomous street agent
// Chains: discover → stage → research → email draft in one SSE stream
// Properties land in staging – user must approve before HubSpot push.
// ============================================================

export const maxDuration = 300; // 5 min – requires Vercel Pro

import { NextRequest } from "next/server";
import { discoverStreet } from "@/lib/discovery";
import { processStagedProperty } from "@/lib/workflow/engine";
import { listStagedProperties } from "@/lib/staging/store";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { street, city = "København", minScore = 6, minTraffic = 10000, discoveryOnly = false } = body;

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

      // Heartbeat: keep SSE connection alive every 20s (prevents Vercel/proxy timeout)
      const heartbeat = setInterval(() => {
        if (cancelled) { clearInterval(heartbeat); return; }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          cancelled = true;
          clearInterval(heartbeat);
        }
      }, 20_000);

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

        // Fetch staged property IDs for this street so frontend can research individually
        const allStagedAfter = await listStagedProperties({ stage: "new" });
        const streetLowerCheck = street.toLowerCase().trim();
        const streetWordsCheck = streetLowerCheck.split(/[\s,]+/).filter((w: string) => w.length > 2);
        const stagedForStreet = allStagedAfter.filter(p => {
          const addr = (p.address || "").toLowerCase();
          const name = (p.name || "").toLowerCase();
          if (addr.includes(streetLowerCheck) || name.includes(streetLowerCheck)) return true;
          if (streetWordsCheck.length > 0 && streetWordsCheck.every((w: string) => addr.includes(w) || name.includes(w))) return true;
          return false;
        });

        if (createdCount === 0 && discoveryResult.alreadyExists === 0) {
          send({
            phase: "agent_done",
            message: "Agent færdig: Ingen nye ejendomme at researche",
            progress: 100,
            agentPhase: "done",
            stagedPropertyIds: [],
          });
          controller.close();
          return;
        }

        // If discoveryOnly mode: stop here and return the staged property IDs
        // Frontend will research each property individually via /api/run-research
        if (discoveryOnly) {
          send({
            phase: "discovery_complete",
            message: `Discovery færdig: ${createdCount} nye ejendomme staged`,
            progress: 100,
            agentPhase: "discovery",
            stagedPropertyIds: stagedForStreet.map(p => p.id),
            stats: {
              totalBuildings: totalCandidates,
              created: createdCount,
              alreadyExists: discoveryResult.alreadyExists,
              skipped: discoveryResult.skipped,
            },
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

        // Match by street name (normalize spaces, hyphens, accents)
        const streetLower = street.toLowerCase().trim();
        const streetWords = streetLower.split(/[\s,]+/).filter((w: string) => w.length > 2);
        const newProperties = allStaged.filter(p => {
          const addr = (p.address || "").toLowerCase();
          const name = (p.name || "").toLowerCase();
          // Direct includes match
          if (addr.includes(streetLower) || name.includes(streetLower)) return true;
          // Word-based match (all significant words must appear)
          if (streetWords.length > 0 && streetWords.every((w: string) => addr.includes(w) || name.includes(w))) return true;
          return false;
        });

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

        send({
          phase: "research_count",
          message: `Fandt ${newProperties.length} ejendomme til research`,
          progress: 31,
          agentPhase: "research",
        });

        let researchCompleted = 0;
        let researchFailed = 0;
        let emailDraftsGenerated = 0;

        for (let i = 0; i < newProperties.length; i++) {
          if (cancelled) break;

          const stagedProp = newProperties[i];
          const propStartPct = 31 + Math.round((i / newProperties.length) * 64);
          const propEndPct = 31 + Math.round(((i + 1) / newProperties.length) * 64);

          send({
            phase: "research_property",
            message: `[${i + 1}/${newProperties.length}] Researcher: ${stagedProp.address}`,
            detail: `Ejendom ${i + 1} af ${newProperties.length} – OIS → CVR → web → AI → email-udkast`,
            progress: propStartPct,
            agentPhase: "research",
            researchIndex: i + 1,
            researchTotal: newProperties.length,
          });

          // Timeout per property: 90s max — skip and continue if it hangs
          const PROPERTY_TIMEOUT_MS = 90_000;
          let run: Awaited<ReturnType<typeof processStagedProperty>>;
          try {
            run = await Promise.race([
              processStagedProperty(
                stagedProp,
                (event) => {
                  const subPct = event.progress || 0;
                  const scaledPct = propStartPct + Math.round((subPct / 100) * (propEndPct - propStartPct));
                  send({
                    ...event,
                    agentPhase: "research",
                    progress: scaledPct,
                    researchIndex: i + 1,
                    researchTotal: newProperties.length,
                  });
                },
                isCancelled,
                { skipEmailDraft: false }
              ),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Timeout efter 90s")), PROPERTY_TIMEOUT_MS)
              ),
            ]);
          } catch (propErr) {
            researchFailed++;
            send({
              phase: "research_property_failed",
              message: `[${i + 1}/${newProperties.length}] ${stagedProp.address}: ${propErr instanceof Error ? propErr.message : "Fejl"} — springer over`,
              progress: propEndPct,
              agentPhase: "research",
              researchIndex: i + 1,
              researchTotal: newProperties.length,
            });
            continue;
          }

          if (run.status === "completed") {
            researchCompleted++;
            const hasDraft = run.steps.some(
              s => s.stepId === "generate_email_draft" && s.status === "completed"
            );
            if (hasDraft) emailDraftsGenerated++;

            send({
              phase: "research_property_done",
              message: `[${i + 1}/${newProperties.length}] ${stagedProp.address}: Research OK${hasDraft ? " + email-udkast" : ""}`,
              progress: propEndPct,
              agentPhase: "research",
              researchIndex: i + 1,
              researchTotal: newProperties.length,
            });
          } else {
            researchFailed++;
            send({
              phase: "research_property_failed",
              message: `[${i + 1}/${newProperties.length}] ${stagedProp.address}: Fejl – ${run.error || "ukendt"}`,
              progress: propEndPct,
              agentPhase: "research",
              researchIndex: i + 1,
              researchTotal: newProperties.length,
            });
          }
        }

        // ══════════════════════════════════════════════════
        // Phase 3: DONE – Summary
        // ══════════════════════════════════════════════════
        send({
          phase: "agent_done",
          message: `Agent færdig! ${researchCompleted} researched, ${emailDraftsGenerated} email-udkast genereret – godkend & send i Staging`,
          detail: [
            `Gade: ${street}, ${city}`,
            `Bygninger fundet: ${totalCandidates}`,
            `Nye ejendomme staged: ${createdCount}`,
            `Research fuldført: ${researchCompleted}`,
            `Email-udkast: ${emailDraftsGenerated}`,
            `Research fejlet: ${researchFailed}`,
            "Gå til Staging → Godkend & Send",
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
        clearInterval(heartbeat);
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
