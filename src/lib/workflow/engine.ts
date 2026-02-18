// ============================================================
// Workflow Engine – Orchestrates the full research pipeline
// PRECISION-FIRST: post-LLM validation, safe mode, quality gates
//
// Key changes:
//   1. Post-LLM validator strips hallucinated emails
//   2. Safe mode prevents HubSpot writes (for testing)
//   3. Quality gates: only KLAR_TIL_UDSENDELSE when quality is high
//   4. MX record validation for email domains
//   5. Raw ResearchData stored per property for debugging
// ============================================================

import {
  fetchEjendommeByStatus,
  updateEjendomResearch,
  upsertContact,
  addDraftNoteToContact,
  createFollowUpTask,
  updateEjendom,
  saveEmailDraft,
} from "../hubspot";
import { researchProperty } from "../research";
import { summarizeResearch, generateEmailDraft } from "../llm";
import { findEmailForPerson, extractCompanyDomain } from "../research/email-finder";
import { validateAnalysis, checkMxRecord, collectAllowedEmails } from "../research/validator";
import { isSupportedLocation, SUPPORTED_CITIES } from "../supported-cities";
import { config } from "../config";
import { logger } from "../logger";
import { updateStagedProperty, listStagedProperties } from "../staging/store";
import type { StagedProperty } from "../staging/store";
import type {
  Property,
  ResearchData,
  WorkflowRunLog,
  WorkflowStepLog,
} from "@/types";

// In-memory storage for workflow runs
const recentRuns: WorkflowRunLog[] = [];
const MAX_STORED_RUNS = 50;

// Raw research data stored per property for debugging
const rawResearchStore: Map<string, { research: ResearchData; timestamp: string; corrections: string[] }> = new Map();
const MAX_RAW_STORE = 100;

// Cross-property contact tracking (resets per batch run)
let batchContactTracker: Map<string, string[]> = new Map();

/** Progress event for live streaming */
export interface WorkflowProgress {
  phase: string;
  message: string;
  detail?: string;
  progress?: number;
  step?: string;
}

export type WorkflowProgressCallback = (event: WorkflowProgress) => void;

/**
 * Execute the full research workflow for all pending properties.
 */
export async function runResearchWorkflow(
  onProgress?: WorkflowProgressCallback,
  isCancelled?: () => boolean
): Promise<WorkflowRunLog[]> {
  const emit = onProgress || (() => {});
  const checkCancelled = isCancelled || (() => false);
  const safeMode = config.researchSafeMode;

  batchContactTracker = new Map();

  if (safeMode) {
    emit({
      phase: "safe_mode",
      message: "⚠️ SAFE MODE AKTIV: Research kører men HubSpot opdateres IKKE",
      detail: "Sæt RESEARCH_SAFE_MODE=false i .env for at aktivere HubSpot-skrivning",
      progress: 0,
    });
    logger.warn("Workflow running in SAFE MODE – no HubSpot writes", { service: "workflow" });
  }

  emit({
    phase: "start",
    message: "Starter research workflow...",
    detail: "Henter ejendomme med status NY_KRAEVER_RESEARCH",
    progress: 0,
  });

  const allProperties = await fetchEjendommeByStatus("NY_KRAEVER_RESEARCH", 50);

  // Filter to only supported cities (5 largest Danish cities)
  const properties = allProperties.filter(p => {
    const check = isSupportedLocation(p.city, p.postalCode);
    if (!check.supported) {
      logger.warn(`Skipping property "${p.address}" – ${check.reason}`, { service: "workflow" });
      emit({
        phase: "city_skip",
        message: `⚠️ Springer over: ${p.address}, ${p.city || "ukendt by"}`,
        detail: check.reason,
      });
      return false;
    }
    return true;
  });

  const skippedCount = allProperties.length - properties.length;

  emit({
    phase: "fetch_done",
    message: `Fandt ${properties.length} ejendomme der kræver research${skippedCount > 0 ? ` (${skippedCount} sprunget over – ikke i understøttet by)` : ""}`,
    detail: skippedCount > 0
      ? `Understøttede byer: ${SUPPORTED_CITIES.map(c => c.name).join(", ")}`
      : undefined,
    progress: 5,
  });

  if (properties.length === 0) {
    emit({
      phase: "done",
      message: skippedCount > 0
        ? `Ingen ejendomme i understøttede byer (${skippedCount} i andre byer sprunget over)`
        : "Ingen ejendomme at researche",
      progress: 100,
    });
    return [];
  }

  const runs: WorkflowRunLog[] = [];

  for (let i = 0; i < properties.length; i++) {
    if (checkCancelled()) {
      emit({
        phase: "cancelled",
        message: `Stoppet af bruger efter ${i} af ${properties.length} ejendomme`,
        progress: 100,
      });
      break;
    }

    const property = properties[i];
    const pctBase = 5 + (i / properties.length) * 90;

    emit({
      phase: "property_start",
      message: `Researcher ejendom ${i + 1}/${properties.length}: ${property.name || property.address}`,
      detail: `${property.address}, ${property.postalCode} ${property.city}`,
      progress: Math.round(pctBase),
    });

    const run = await processProperty(property, (event) => {
      emit({
        ...event,
        progress: Math.round(pctBase + (event.progress || 0) / properties.length * 0.9),
      });
    }, checkCancelled);

    runs.push(run);
    storeRun(run);

    if (!checkCancelled()) {
      emit({
        phase: "property_done",
        message: `${property.name || property.address}: ${run.status === "completed" ? "Fuldført" : "Fejlet"}`,
        detail: run.error || `${run.steps.filter(s => s.status === "completed").length} trin gennemført`,
        progress: Math.round(pctBase + 90 / properties.length),
      });
    }
  }

  emit({
    phase: "done",
    message: `Workflow færdig: ${runs.filter((r) => r.status === "completed").length}/${runs.length} gennemført`,
    progress: 100,
  });

  return runs;
}

/**
 * Run batch research for all staged properties with stage="new".
 * Same idea as runResearchWorkflow but sources from staging.
 */
export async function runStagedResearchBatch(
  onProgress?: WorkflowProgressCallback,
  isCancelled?: () => boolean
): Promise<WorkflowRunLog[]> {
  const emit = onProgress || (() => {});
  const checkCancelled = isCancelled || (() => false);

  emit({
    phase: "staged_start",
    message: "Henter nye staged ejendomme til research...",
    progress: 0,
  });

  const allStaged = await listStagedProperties({ stage: "new" });

  // Filter to supported cities
  const staged = allStaged.filter(p => {
    const check = isSupportedLocation(p.city || "", p.postalCode || "");
    if (!check.supported) {
      emit({
        phase: "city_skip",
        message: `⚠️ Springer over: ${p.address}, ${p.city || "ukendt by"}`,
        detail: check.reason,
      });
      return false;
    }
    return true;
  });

  emit({
    phase: "staged_fetch_done",
    message: `Fandt ${staged.length} staged ejendomme til research${allStaged.length - staged.length > 0 ? ` (${allStaged.length - staged.length} sprunget over)` : ""}`,
    progress: 5,
  });

  if (staged.length === 0) {
    emit({
      phase: "done",
      message: "Ingen nye staged ejendomme at researche",
      progress: 100,
    });
    return [];
  }

  const runs: WorkflowRunLog[] = [];

  for (let i = 0; i < staged.length; i++) {
    if (checkCancelled()) {
      emit({
        phase: "cancelled",
        message: `Stoppet efter ${i} af ${staged.length} staged ejendomme`,
        progress: 100,
      });
      break;
    }

    const sp = staged[i];
    const pctBase = 5 + (i / staged.length) * 90;

    emit({
      phase: "property_start",
      message: `Researcher staged ${i + 1}/${staged.length}: ${sp.name || sp.address}`,
      detail: `${sp.address}, ${sp.postalCode || ""} ${sp.city || ""}`,
      progress: Math.round(pctBase),
    });

    const run = await processStagedProperty(sp, (event) => {
      emit({
        ...event,
        progress: Math.round(pctBase + (event.progress || 0) / staged.length * 0.9),
      });
    }, checkCancelled);

    runs.push(run);

    if (!checkCancelled()) {
      emit({
        phase: "property_done",
        message: `${sp.name || sp.address}: ${run.status === "completed" ? "Fuldført" : "Fejlet"}`,
        detail: run.error || `${run.steps.filter(s => s.status === "completed").length} trin gennemført`,
        progress: Math.round(pctBase + 90 / staged.length),
      });
    }
  }

  emit({
    phase: "done",
    message: `Staged research færdig: ${runs.filter(r => r.status === "completed").length}/${runs.length} gennemført`,
    progress: 100,
  });

  return runs;
}

/**
 * Process a single property through the full pipeline.
 */
export async function processProperty(
  property: Property,
  onProgress?: WorkflowProgressCallback,
  isCancelled?: () => boolean
): Promise<WorkflowRunLog> {
  const emit = onProgress || (() => {});
  const checkCancelled = isCancelled || (() => false);
  const safeMode = config.researchSafeMode;

  const run: WorkflowRunLog = {
    propertyId: property.id,
    propertyName: property.name || property.address,
    startedAt: new Date().toISOString(),
    status: "running",
    steps: [],
  };

  try {
    // ── Step 1: Mark as "research in progress" ──
    const step1 = startStep("mark_in_progress", "Marker som igangsat");
    run.steps.push(step1);
    emit({
      phase: "step",
      step: "mark_in_progress",
      message: safeMode
        ? "🔒 SAFE MODE: Springer HubSpot-markering over"
        : "Markerer ejendom som 'research igangsat' i HubSpot",
      progress: 5,
    });
    if (!safeMode) {
      await updateEjendom(property.id, {
        outreach_status: "RESEARCH_IGANGSAT",
      });
    }
    completeStep(step1);

    // ── Step 2: Deep research ──
    const step2 = startStep("research_property", "Dyb research (OIS → CVR → BBR → web)");
    run.steps.push(step2);

    emit({
      phase: "research_start",
      step: "research_property",
      message: "Starter precision-research...",
      detail: `OIS-strategi → strikt CVR scoring → web → LLM (temp 0.1)`,
      progress: 10,
    });

    const researchData = await researchProperty(property, (event) => {
      emit({
        phase: "research_step",
        step: event.step,
        message: event.message,
        detail: event.detail,
      });
    });

    step2.details = [
      `OIS: ${researchData.oisData ? `✓ Ejer: ${researchData.oisData.owners.map(o => o.name).join(", ") || "?"}` : "✗"}`,
      `CVR: ${researchData.cvrData ? `✓ ${researchData.cvrData.companyName}` : "✗ ikke fundet"}`,
      `BBR: ${researchData.bbrData ? `✓ ${researchData.bbrData.area || "?"}m²` : "✗"}`,
      `Søgninger: ${researchData.companySearchResults.length} resultater`,
      `Emails: ${researchData.websiteContent?.emails.length || 0} fundet`,
    ].join(" | ");

    completeStep(step2);

    emit({
      phase: "research_done",
      step: "research_property",
      message: `Research færdig – ${researchData.companySearchResults.length} resultater, ${researchData.websiteContent?.emails.length || 0} emails`,
      progress: 45,
    });

    if (checkCancelled()) {
      run.status = "failed";
      run.error = "Stoppet af bruger";
      run.completedAt = new Date().toISOString();
      return run;
    }

    // ── Step 3: Split LLM analysis ──
    const step3 = startStep("llm_summarize", "AI analyse (2-fase: ejer + kontakt-ranking)");
    run.steps.push(step3);

    emit({
      phase: "llm_start",
      step: "llm_summarize",
      message: "AI Phase 1: Vurderer ejer + datakvalitet (temp 0.1)...",
      detail: "Bruger KUN OIS/CVR/BBR data – ingen websøgning, ingen email-gæt",
      progress: 50,
    });

    let analysis = await summarizeResearch(property, researchData);

    emit({
      phase: "llm_phase1_done",
      step: "llm_summarize",
      message: `Phase 1: Ejer: ${analysis.ownerCompanyName} | Kvalitet: ${analysis.dataQuality}`,
      detail: `Phase 2: ${analysis.recommendedContacts.length} kontakter ranket`,
      progress: 55,
    });

    // ── Step 3.5: POST-LLM VALIDATION (THE CRITICAL GUARD) ──
    const stepValidate = startStep("validate_llm", "Post-LLM validering");
    run.steps.push(stepValidate);

    emit({
      phase: "validation_start",
      step: "validate_llm",
      message: "Validerer LLM-output mod faktiske datakilder...",
      detail: `Tjekker emails mod ${collectAllowedEmails(researchData).size} kendte emails`,
      progress: 56,
    });

    const { cleaned, corrections } = validateAnalysis(
      analysis,
      researchData,
      property.address
    );

    analysis = cleaned;

    if (corrections.length > 0) {
      emit({
        phase: "validation_corrections",
        step: "validate_llm",
        message: `⚠️ Validator: ${corrections.length} korrektioner foretaget`,
        detail: corrections.join("\n"),
        progress: 57,
      });

      for (const c of corrections) {
        logger.warn(`Validator: ${c}`, { service: "validator", propertyAddress: property.address });
      }
    } else {
      emit({
        phase: "validation_clean",
        step: "validate_llm",
        message: "✓ Validering OK – ingen korrektioner nødvendige",
        progress: 57,
      });
    }

    stepValidate.details = `${corrections.length} korrektioner | dataQuality: ${analysis.dataQuality}`;
    completeStep(stepValidate);

    const qualityEmoji = analysis.dataQuality === "high" ? "🟢" : analysis.dataQuality === "medium" ? "🟡" : "🔴";

    const contactSummary = analysis.recommendedContacts
      .slice(0, 3)
      .map(c => `${c.fullName || "?"} (${c.role || "?"}, ${c.relevance || "?"}) – ${c.email || "ingen email"} [${Math.round((c.confidence || 0) * 100)}%]`)
      .join("\n");

    emit({
      phase: "llm_done",
      step: "llm_summarize",
      message: `Datakvalitet: ${qualityEmoji} ${analysis.dataQuality.toUpperCase()} | ${analysis.recommendedContacts.length} kontakter`,
      detail: `Kontakter:\n${contactSummary}\nOutdoor score: ${analysis.outdoorPotentialScore}/10`,
      progress: 58,
    });

    completeStep(step3);

    if (analysis.dataQuality === "low") {
      emit({
        phase: "data_quality_warning",
        step: "llm_summarize",
        message: `⚠️ LAV DATAKVALITET: ${analysis.dataQualityReason}`,
        detail: "Kontakter kan være forkerte. Anbefaler manuel gennemgang.",
        progress: 58,
      });
    }

    // ── Step 3.5a: RELEVANCE FILTER – Penalize cross-property contacts ──
    for (const contact of analysis.recommendedContacts) {
      if (!contact.email) continue;
      const emailLower = contact.email.toLowerCase();
      const seenFor = batchContactTracker.get(emailLower) || [];

      if (seenFor.length > 0) {
        const penalty = Math.min(seenFor.length * 0.25, 0.6);
        const oldConfidence = contact.confidence;
        contact.confidence = Math.max(contact.confidence - penalty, 0.05);
        if (contact.relevance !== "direct") {
          contact.relevance = "indirect";
        }

        emit({
          phase: "relevance_check",
          step: "relevance_filter",
          message: `"${contact.fullName}" bruges for ${seenFor.length} andre ejendomme – sænket fra ${Math.round(oldConfidence * 100)}% til ${Math.round(contact.confidence * 100)}%`,
          progress: 59,
        });
      }

      // ── CROSS-PROPERTY HARD CUT: if 3+ properties → "indirect" only ──
      if (seenFor.length >= 3) {
        contact.relevance = "indirect";
        contact.confidence = Math.min(contact.confidence, 0.15);
        emit({
          phase: "relevance_hard_cut",
          step: "relevance_filter",
          message: `"${contact.email}" set i 3+ ejendomme – klassificeret som "indirect", max confidence 15%`,
          progress: 59,
        });
      }
    }

    // Re-sort contacts
    analysis.recommendedContacts.sort((a, b) => {
      if (a.relevance === "direct" && b.relevance !== "direct") return -1;
      if (b.relevance === "direct" && a.relevance !== "direct") return 1;
      return b.confidence - a.confidence;
    });

    // ── Step 3.5b: EMAIL HUNT – Only if we have a VERIFIED domain ──
    const bestContactSoFar = analysis.recommendedContacts[0] || null;
    const hasEmail = bestContactSoFar?.email
      && !bestContactSoFar.email.startsWith("info@")
      && !bestContactSoFar.email.startsWith("kontakt@")
      && bestContactSoFar.confidence >= 0.3;

    if (!hasEmail) {
      const stepEmailHunt = startStep("email_hunt", "Aktiv email-jagt");
      run.steps.push(stepEmailHunt);

      // Determine if we have a verified domain (CVR website or confirmed company site)
      const verifiedDomain = analysis.companyDomain || null;

      emit({
        phase: "email_hunt_start",
        step: "email_hunt",
        message: verifiedDomain
          ? `Søger email med verificeret domæne: ${verifiedDomain}`
          : "Ingen verificeret domæne – begrænset email-søgning",
        detail: `Søger email til: ${bestContactSoFar?.fullName || analysis.ownerCompanyName}`,
        progress: 60,
      });

      // Only run aggressive email hunt if we have a verified domain
      for (const contact of analysis.recommendedContacts) {
        if (contact.email && !contact.email.startsWith("info@") && !contact.email.startsWith("kontakt@")) continue;
        if (!contact.fullName) continue;

        const result = await findEmailForPerson({
          personName: contact.fullName,
          companyName: analysis.ownerCompanyName,
          companyDomain: verifiedDomain || undefined,
          knownEmails: researchData.websiteContent?.emails || [],
          websiteUrl: analysis.companyWebsite || researchData.websiteContent?.url || undefined,
          propertyAddress: property.address,
          propertyCity: property.city,
          onProgress: (event) => {
            emit({
              phase: "email_hunt_step",
              step: event.step,
              message: event.message,
              detail: event.detail,
            });
          },
        });

        if (result.email) {
          // ── MX RECORD CHECK ──
          const domain = result.email.split("@")[1];
          let mxValid = true;
          if (domain) {
            mxValid = await checkMxRecord(domain);
            if (!mxValid) {
              emit({
                phase: "mx_check_failed",
                step: "email_hunt",
                message: `❌ MX-check fejlet for ${domain} – email ${result.email} nedgraderet`,
                progress: 62,
              });
              result.confidence = Math.min(result.confidence, 0.2);
            } else {
              emit({
                phase: "mx_check_ok",
                step: "email_hunt",
                message: `✓ MX-check OK for ${domain}`,
                progress: 62,
              });
            }
          }

          contact.email = result.email;
          contact.confidence = Math.max(contact.confidence, mxValid ? result.confidence : 0.2);
          contact.source = result.source;

          emit({
            phase: "email_hunt_found",
            step: "email_hunt",
            message: `Email: ${result.email} (${Math.round(contact.confidence * 100)}% konfidens${mxValid ? "" : ", MX fejlet"})`,
            progress: 63,
          });

          break;
        }
      }

      const foundEmails = analysis.recommendedContacts.filter(c => c.email).length;
      stepEmailHunt.details = `${foundEmails} emails fundet`;
      completeStep(stepEmailHunt);
    } else {
      emit({
        phase: "email_hunt_skip",
        step: "email_hunt",
        message: `Email allerede fundet: ${bestContactSoFar?.email}`,
        progress: 65,
      });
    }

    if (checkCancelled()) {
      run.status = "failed";
      run.error = "Stoppet af bruger";
      run.completedAt = new Date().toISOString();
      return run;
    }

    // ── STORE RAW RESEARCH DATA FOR DEBUGGING ──
    storeRawResearch(property.id, researchData, corrections);

    // ── Step 4: Update ejendom in HubSpot (respects safe mode) ──
    const step4 = startStep("hubspot_update_ejendom", "Opdater ejendom i HubSpot");
    run.steps.push(step4);

    const sourceLinks = [
      ...(researchData.cvrData ? [`CVR: ${researchData.cvrData.cvr}`] : []),
      ...(researchData.websiteContent ? [`Website: ${researchData.websiteContent.url}`] : []),
      ...researchData.companySearchResults.slice(0, 5).map((r) => r.url),
    ].join("\n");

    if (safeMode) {
      emit({
        phase: "safe_mode_skip",
        step: "hubspot_update_ejendom",
        message: "🔒 SAFE MODE: Logger resultater – springer HubSpot-opdatering over",
        detail: `Ejer: ${analysis.ownerCompanyName} | Score: ${analysis.outdoorPotentialScore}/10 | Kvalitet: ${analysis.dataQuality}`,
        progress: 70,
      });
      logger.info(`SAFE MODE – would update: owner=${analysis.ownerCompanyName}, quality=${analysis.dataQuality}`, {
        service: "workflow",
        propertyAddress: property.address,
      });
    } else {
      await updateEjendomResearch(property.id, {
        ownerCompanyName: analysis.ownerCompanyName,
        ownerCompanyCvr: analysis.ownerCompanyCvr,
        outdoorScore: analysis.outdoorPotentialScore,
        researchSummary: analysis.keyInsights,
        researchLinks: sourceLinks,
        outreachStatus: "RESEARCH_DONE_CONTACT_PENDING",
      });
      emit({
        phase: "hubspot_updated",
        step: "hubspot_update_ejendom",
        message: "Ejendom opdateret i HubSpot",
        progress: 70,
      });
    }
    completeStep(step4);

    // ── Step 5: Upsert contacts (safe mode aware) ──
    const step5 = startStep("hubspot_upsert_contacts", "Opret kontaktpersoner i HubSpot");
    run.steps.push(step5);

    const validContacts = analysis.recommendedContacts.filter(c => {
      if (!c.fullName && !c.email) return false;
      if (c.email && (
        c.email.includes("@ukendt") ||
        c.email.includes("@unknown") ||
        !c.email.includes(".") ||
        c.email.length < 6
      )) return false;
      // NEW: Don't create contacts without email AND without explicit role
      if (!c.email && !c.role) return false;
      return true;
    });

    const contactIds: string[] = [];

    if (safeMode) {
      emit({
        phase: "safe_mode_skip",
        step: "hubspot_upsert_contacts",
        message: `🔒 SAFE MODE: ${validContacts.length} kontakter ville oprettes`,
        detail: validContacts.map(c =>
          `${c.fullName || "?"}: ${c.email || "INGEN"} (${c.role || "?"}, ${Math.round((c.confidence || 0) * 100)}%)`
        ).join("\n"),
        progress: 78,
      });
    } else {
      for (const contact of validContacts) {
        try {
          emit({
            phase: "contact_create",
            step: "hubspot_upsert_contacts",
            message: `Opretter kontakt: ${contact.fullName || "ukendt"} (${contact.role || "?"})`,
            detail: `Email: ${contact.email || "MANGLER"} | Konfidens: ${Math.round((contact.confidence || 0) * 100)}%`,
          });
          const contactId = await upsertContact(contact, property.id);
          contactIds.push(contactId);
        } catch (e) {
          console.warn(`Failed to upsert contact ${contact.fullName}:`, e);
        }
      }
    }

    step5.details = safeMode
      ? `SAFE MODE: ${validContacts.length} kontakter (ikke oprettet)`
      : `${contactIds.length}/${validContacts.length} kontakter oprettet`;
    completeStep(step5);

    // ── Step 6: Generate email draft ──
    const step6 = startStep("generate_email_draft", "AI genererer mailudkast");
    run.steps.push(step6);

    const bestContact =
      analysis.recommendedContacts.length > 0
        ? analysis.recommendedContacts
            .filter(c => c.email)
            .reduce((a, b) => (a?.confidence || 0) >= (b?.confidence || 0) ? a : b, analysis.recommendedContacts[0])
        : null;

    if (bestContact && bestContact.email) {
      emit({
        phase: "email_start",
        step: "generate_email_draft",
        message: `Skriver mail til ${bestContact.fullName || "kontaktperson"}...`,
        progress: 82,
      });

      const draft = await generateEmailDraft(property, bestContact, analysis);

      if (safeMode) {
        emit({
          phase: "safe_mode_skip",
          step: "generate_email_draft",
          message: `🔒 SAFE MODE: Mailudkast genereret men IKKE gemt`,
          detail: `Emne: "${draft.subject}"\n${draft.bodyText.substring(0, 150)}...`,
          progress: 90,
        });
      } else {
        const step7 = startStep("save_draft", "Gem mailudkast i HubSpot");
        run.steps.push(step7);

        await saveEmailDraft(
          property.id,
          draft.subject,
          draft.bodyText,
          draft.shortInternalNote
        );

        if (contactIds.length > 0) {
          const primaryContactId = contactIds[0];
          const noteBody = `Subject: ${draft.subject}\n\n${draft.bodyText}\n\n---\nIntern note: ${draft.shortInternalNote}`;

          await addDraftNoteToContact(
            primaryContactId,
            "Udkast: outreach mail #1 (autogenereret)",
            noteBody
          );

          await createFollowUpTask(
            primaryContactId,
            `Gennemgå og send outreach-mail: ${property.name || property.address}`,
            2,
            "HIGH"
          );
        }

        completeStep(step7);
      }
    } else {
      step6.details = "Ingen kontaktperson med email fundet";
      step6.status = "skipped";
    }
    completeStep(step6);

    // ── Track selected contact for cross-property dedup ──
    if (bestContact?.email) {
      const emailLower = bestContact.email.toLowerCase();
      const existing = batchContactTracker.get(emailLower) || [];
      existing.push(property.address || property.id);
      batchContactTracker.set(emailLower, existing);
    }

    // ── Step 8: Final status with QUALITY GATES ──
    const step8 = startStep("update_status_ready", "Opdater endelig status (quality gate)");
    run.steps.push(step8);

    // QUALITY GATE: Research never sets KLAR_TIL_UDSENDELSE – user chooses "Push til pipeline" in UI
    const gateReason: string =
      !bestContact || !bestContact.email
        ? "Ingen kontakt med email fundet"
        : analysis.dataQuality === "low"
          ? `Lav datakvalitet (${analysis.dataQualityReason}) – kræver manuel review`
          : bestContact.confidence < 0.7 && analysis.dataQuality !== "high"
            ? `Kontakt confidence ${Math.round(bestContact.confidence * 100)}% < 70% og kvalitet er ikke "high" – kræver manuel review`
            : bestContact.relevance === "indirect" && bestContact.confidence < 0.8
              ? `Kontakt er "indirect" med confidence ${Math.round(bestContact.confidence * 100)}% – kræver godkendelse`
              : `Kvalitet: ${analysis.dataQuality}, Kontakt: ${bestContact.fullName} (${Math.round(bestContact.confidence * 100)}%, ${bestContact.relevance})`;
    const gatesPassed =
      bestContact?.email &&
      analysis.dataQuality !== "low" &&
      (bestContact.confidence >= 0.7 || analysis.dataQuality === "high") &&
      (bestContact.relevance !== "indirect" || bestContact.confidence >= 0.8);

    emit({
      phase: "quality_gate",
      step: "update_status_ready",
      message: gatesPassed
        ? "✅ Research færdig – vælg «Push til pipeline» i Ejendomme når du er klar"
        : `⏸️ Research færdig (review anbefales): ${gateReason}`,
      detail: gateReason,
      progress: 96,
    });

    // Always RESEARCH_DONE_CONTACT_PENDING; user explicitly marks "Klar" via UI
    const finalStatus = "RESEARCH_DONE_CONTACT_PENDING";
    if (!safeMode) {
      await updateEjendomResearch(property.id, {
        outreachStatus: finalStatus,
      });
    } else {
      logger.info(`SAFE MODE – would set status: ${finalStatus} (${gateReason})`, {
        service: "workflow",
        propertyAddress: property.address,
      });
    }

    completeStep(step8);

    // ── Done ──
    run.status = "completed";
    run.completedAt = new Date().toISOString();

    emit({
      phase: "complete",
      message: `Research færdig for ${property.name || property.address}`,
      detail: `Ejer: ${analysis.ownerCompanyName} | ${analysis.recommendedContacts.length} kontakter | Score: ${analysis.outdoorPotentialScore}/10 | Status: ${finalStatus} | Korrektioner: ${corrections.length}`,
      progress: 100,
    });
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message : "Unknown error";
    run.completedAt = new Date().toISOString();

    if (!config.researchSafeMode) {
      try {
        await updateEjendom(property.id, {
          outreach_status: "FEJL",
          research_summary: `Workflow fejlede: ${run.error}`,
        });
      } catch {
        // ignore
      }
    }

    emit({
      phase: "error",
      message: `Fejl: ${run.error}`,
      progress: 100,
    });

    logger.error(`Workflow failed for ${property.address}: ${run.error}`, {
      service: "workflow",
      propertyAddress: property.address,
    });
  }

  return run;
}

/**
 * Get recent workflow runs.
 */
export function getRecentRuns(): WorkflowRunLog[] {
  return [...recentRuns].reverse();
}

/**
 * Get raw research data for a property (for debugging).
 */
export function getRawResearch(propertyId: string) {
  return rawResearchStore.get(propertyId) || null;
}

/**
 * Get all stored raw research entries (for debugging dashboard).
 */
export function getAllRawResearch() {
  return Array.from(rawResearchStore.entries()).map(([id, data]) => ({
    propertyId: id,
    ...data,
  }));
}

// ─── Process Staged Property ─────────────────────────────────
// Runs the same research pipeline but reads from / writes to
// the local Supabase staging table instead of HubSpot.
// ──────────────────────────────────────────────────────────────

/**
 * Process a staged property through the research pipeline.
 * Research results are written back to Supabase staging, NOT HubSpot.
 */
export interface ProcessStagedOptions {
  /** When true, only run research and mark as "researched"; do not generate email draft. User approves in Staging, then draft is generated. */
  skipEmailDraft?: boolean;
}

export async function processStagedProperty(
  staged: StagedProperty,
  onProgress?: WorkflowProgressCallback,
  isCancelled?: () => boolean,
  options?: ProcessStagedOptions
): Promise<WorkflowRunLog> {
  const skipEmailDraft = options?.skipEmailDraft === true;
  const emit = onProgress || (() => {});
  const checkCancelled = isCancelled || (() => false);

  // Convert staged to Property-like shape for reuse of research logic
  const property: Property = {
    id: staged.id,
    name: staged.name,
    address: staged.address,
    postalCode: staged.postalCode || "",
    city: staged.city || "",
    outreachStatus: "NY_KRAEVER_RESEARCH",
    outdoorScore: staged.outdoorScore,
    outdoorPotentialNotes: staged.outdoorNotes,
  };

  const run: WorkflowRunLog = {
    propertyId: staged.id,
    propertyName: staged.name || staged.address,
    startedAt: new Date().toISOString(),
    status: "running",
    steps: [],
  };

  try {
    // ── Step 1: Mark as researching in staging ──
    const step1 = startStep("mark_in_progress", "Marker som igangsat (staging)");
    run.steps.push(step1);
    emit({
      phase: "step",
      step: "mark_in_progress",
      message: "Markerer ejendom som 'researching' i staging",
      progress: 5,
    });
    await updateStagedProperty(staged.id, {
      stage: "researching",
      researchStartedAt: new Date().toISOString(),
    });
    completeStep(step1);

    // ── Step 2: Deep research ──
    const step2 = startStep("research_property", "Dyb research (OIS → CVR → BBR → web)");
    run.steps.push(step2);
    emit({
      phase: "research_start",
      step: "research_property",
      message: "Starter precision-research...",
      detail: "OIS-strategi → strikt CVR scoring → web → LLM (temp 0.1)",
      progress: 10,
    });

    const researchData = await researchProperty(property, (event) => {
      emit({
        phase: "research_step",
        step: event.step,
        message: event.message,
        detail: event.detail,
      });
    });

    step2.details = [
      `OIS: ${researchData.oisData ? `✓ Ejer: ${researchData.oisData.owners.map(o => o.name).join(", ") || "?"}` : "✗"}`,
      `CVR: ${researchData.cvrData ? `✓ ${researchData.cvrData.companyName}` : "✗ ikke fundet"}`,
      `BBR: ${researchData.bbrData ? `✓ ${researchData.bbrData.area || "?"}m²` : "✗"}`,
      `Søgninger: ${researchData.companySearchResults.length} resultater`,
      `Emails: ${researchData.websiteContent?.emails.length || 0} fundet`,
    ].join(" | ");
    completeStep(step2);

    emit({
      phase: "research_done",
      step: "research_property",
      message: `Research færdig – ${researchData.companySearchResults.length} resultater, ${researchData.websiteContent?.emails.length || 0} emails`,
      progress: 45,
    });

    if (checkCancelled()) {
      run.status = "failed";
      run.error = "Stoppet af bruger";
      run.completedAt = new Date().toISOString();
      return run;
    }

    // ── Step 3: LLM analysis ──
    const step3 = startStep("llm_summarize", "AI analyse (ejer + kontakt-ranking)");
    run.steps.push(step3);
    emit({
      phase: "llm_start",
      step: "llm_summarize",
      message: "AI Phase 1: Vurderer ejer + datakvalitet...",
      progress: 50,
    });

    let analysis = await summarizeResearch(property, researchData);

    // ── Step 3.5: Post-LLM validation ──
    const stepValidate = startStep("validate_llm", "Post-LLM validering");
    run.steps.push(stepValidate);
    const { cleaned, corrections } = validateAnalysis(analysis, researchData, property.address);
    analysis = cleaned;

    if (corrections.length > 0) {
      emit({
        phase: "validation_corrections",
        step: "validate_llm",
        message: `⚠️ Validator: ${corrections.length} korrektioner`,
        detail: corrections.join("\n"),
        progress: 57,
      });
    }
    completeStep(stepValidate);
    completeStep(step3);

    // ── Email hunt if no email yet ──
    const bestContactSoFar = analysis.recommendedContacts[0] || null;
    const hasEmail = bestContactSoFar?.email && bestContactSoFar.email.includes("@") && !bestContactSoFar.email.includes("@ukendt");

    if (!hasEmail && analysis.ownerCompanyName) {
      const knownEmails = researchData.websiteContent?.emails || [];
      const domain = extractCompanyDomain(
        knownEmails,
        analysis.ownerCompanyName,
        researchData.websiteContent?.url
      );
      if (domain) {
        const mxValid = await checkMxRecord(domain);
        if (mxValid) {
          for (const contact of analysis.recommendedContacts) {
            if (contact.email) continue;
            if (!contact.fullName) continue;
            const result = await findEmailForPerson({
              personName: contact.fullName,
              companyName: analysis.ownerCompanyName,
              companyDomain: domain,
              knownEmails,
            });
            if (result.email) {
              contact.email = result.email;
              contact.confidence = Math.max(contact.confidence, 0.65);
            }
          }
        }
      }
    }

    // ── Step 4: Write research results back to STAGING (not HubSpot) ──
    const step4 = startStep("staging_update", "Opdater staging med research-resultater");
    run.steps.push(step4);

    const bestContact = analysis.recommendedContacts.filter(c => c.email)[0] || analysis.recommendedContacts[0] || null;
    const sourceLinks = [
      ...(researchData.cvrData ? [`CVR: ${researchData.cvrData.cvr}`] : []),
      ...(researchData.websiteContent ? [`Website: ${researchData.websiteContent.url}`] : []),
      ...researchData.companySearchResults.slice(0, 5).map(r => r.url),
    ].join("\n");

    await updateStagedProperty(staged.id, {
      ownerCompany: analysis.ownerCompanyName,
      ownerCvr: analysis.ownerCompanyCvr || undefined,
      outdoorScore: analysis.outdoorPotentialScore,
      researchSummary: analysis.keyInsights,
      researchLinks: sourceLinks,
      contactPerson: bestContact?.fullName || undefined,
      contactEmail: bestContact?.email || undefined,
      contactPhone: bestContact?.phone || undefined,
    });

    emit({
      phase: "staging_updated",
      step: "staging_update",
      message: "Research-resultater gemt i staging",
      detail: `Ejer: ${analysis.ownerCompanyName} | Kontakt: ${bestContact?.fullName || "ingen"} | Email: ${bestContact?.email || "ingen"}`,
      progress: 75,
    });
    completeStep(step4);

    // ── Step 5: Generate email draft (store in staging) – skipped when skipEmailDraft (e.g. Gade-Agent: user approves after research, then draft in Staging) ──
    if (!skipEmailDraft) {
      const step5 = startStep("generate_email_draft", "AI genererer mailudkast");
      run.steps.push(step5);

      if (bestContact && bestContact.email) {
        emit({
          phase: "email_start",
          step: "generate_email_draft",
          message: `Skriver mail til ${bestContact.fullName || "kontaktperson"}...`,
          progress: 82,
        });

        const draft = await generateEmailDraft(property, bestContact, analysis);

        await updateStagedProperty(staged.id, {
          emailDraftSubject: draft.subject,
          emailDraftBody: draft.bodyText,
          emailDraftNote: draft.shortInternalNote,
        });

        emit({
          phase: "email_done",
          step: "generate_email_draft",
          message: `Mailudkast gemt i staging: "${draft.subject}"`,
          progress: 90,
        });
      } else {
        step5.details = "Ingen kontaktperson med email fundet";
        step5.status = "skipped";
      }
      completeStep(step5);

      if (checkCancelled()) {
        run.status = "failed";
        run.error = "Stoppet af bruger";
        run.completedAt = new Date().toISOString();
        return run;
      }
    }

    // ── Step 6: Mark as researched in staging ──
    const step6 = startStep("mark_researched", "Marker som researched i staging");
    run.steps.push(step6);

    try {
      await updateStagedProperty(staged.id, {
        stage: "researched",
        researchCompletedAt: new Date().toISOString(),
      });
    } catch (updateErr) {
      logger.warn(`Staged update failed (research data ok): ${staged.address}`, {
        service: "workflow",
        error: { message: updateErr instanceof Error ? updateErr.message : String(updateErr) },
      });
      emit({
        phase: "staging_update_warning",
        message: "Research færdig, men staging-tabel opdatering fejlede – tjek Staging-fanen",
        progress: 97,
      });
    }

    emit({
      phase: "staging_researched",
      step: "mark_researched",
      message: skipEmailDraft
        ? "Ejendom markeret som \"researched\" – godkend i Staging, derefter genereres mail-udkast (intet push til HubSpot endnu)"
        : "Ejendom markeret som \"researched\" – afventer godkendelse i staging queue",
      progress: 96,
    });
    completeStep(step6);

    // ── Store raw research data ──
    try {
      storeRawResearch(staged.id, researchData, corrections);
    } catch { /* non-fatal */ }

    // ── Done ──
    run.status = "completed";
    run.completedAt = new Date().toISOString();

    emit({
      phase: "complete",
      message: `Research færdig for ${staged.name || staged.address} (staging)`,
      detail: `Ejer: ${analysis.ownerCompanyName} | ${analysis.recommendedContacts.length} kontakter | Score: ${analysis.outdoorPotentialScore}/10`,
      progress: 100,
    });
  } catch (error) {
    run.status = "failed";
    run.error = error instanceof Error ? error.message : "Unknown error";
    run.completedAt = new Date().toISOString();

    emit({
      phase: "error",
      message: `Fejl: ${run.error}`,
      progress: 100,
    });

    logger.error(`Staged workflow failed for ${staged.address}: ${run.error}`, {
      service: "workflow",
      propertyAddress: staged.address,
    });
  }

  storeRun(run);
  return run;
}

// ─── Helpers ────────────────────────────────────────────────

function startStep(id: string, name: string): WorkflowStepLog {
  return {
    stepId: id,
    stepName: name,
    status: "running",
    startedAt: new Date().toISOString(),
  };
}

function completeStep(step: WorkflowStepLog): void {
  if (step.status === "running") {
    step.status = "completed";
  }
  step.completedAt = new Date().toISOString();
}

function storeRun(run: WorkflowRunLog): void {
  recentRuns.push(run);
  if (recentRuns.length > MAX_STORED_RUNS) {
    recentRuns.shift();
  }
}

function storeRawResearch(propertyId: string, research: ResearchData, corrections: string[]): void {
  rawResearchStore.set(propertyId, {
    research,
    timestamp: new Date().toISOString(),
    corrections,
  });
  // Evict oldest if over limit
  if (rawResearchStore.size > MAX_RAW_STORE) {
    const oldestKey = rawResearchStore.keys().next().value;
    if (oldestKey) rawResearchStore.delete(oldestKey);
  }
}
