// ============================================================
// OOH Proposal Service – Full orchestration
// mockup generation → Drive upload → Slides creation → PDF → email
// ============================================================

import { compositeMultiplePlacements } from "./image-processor";
import { uploadFile, downloadFile, ensureOohFolders, copySlides, exportSlidesPdf, getDirectUrl } from "./google-drive";
import { replaceTextPlaceholders, applyMockupPlacements, getSlidesUrl } from "./google-slides";
import { sendEmail } from "../email-sender";
import { getFrame, getCreative, getProposal, upsertProposal, getDefaultTemplate, getTemplate } from "./store";
import { loadImageBuffer } from "./load-image";
import type { GenerateProposalInput, Proposal, ProposalStatus } from "./types";
import { logger } from "../logger";

type ProgressCallback = (status: ProposalStatus, message: string, progress: number) => void;

function uid(): string {
  return `prop_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Generate a full proposal: mockup → upload → (slides → PDF) → ready
 */
export async function generateProposal(
  input: GenerateProposalInput,
  onProgress?: ProgressCallback
): Promise<Proposal> {
  const emit = onProgress || (() => {});
  const now = new Date().toISOString();

  // Create proposal record
  const proposal: Proposal = {
    id: uid(),
    frameId: input.frameId,
    creativeId: input.creativeId,
    clientEmail: input.clientEmail,
    clientCompany: input.clientCompany,
    clientContactName: input.clientContactName,
    status: "pending",
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  upsertProposal(proposal);

  try {
    // ── Validate inputs ──
    const frame = await getFrame(input.frameId);
    if (!frame) throw new Error(`Frame ${input.frameId} not found`);

    const creative = await getCreative(input.creativeId);
    if (!creative) throw new Error(`Creative ${input.creativeId} not found`);

    proposal.status = "processing";
    upsertProposal(proposal);
    emit("processing", "Genererer mockup...", 10);

    // ── Step 1: Generate mockup image ──
    let frameBuffer: Buffer;
    let creativeBuffer: Buffer;

    // Load frame image
    if (frame.driveFileId) {
      frameBuffer = await downloadFile(frame.driveFileId);
    } else {
      frameBuffer = await loadImageBuffer(frame.frameImageUrl);
    }

    // Load creative image
    if (creative.driveFileId) {
      creativeBuffer = await downloadFile(creative.driveFileId);
    } else if (creative.thumbnailUrl) {
      creativeBuffer = await loadImageBuffer(creative.thumbnailUrl);
    } else {
      throw new Error("Creative has no image source");
    }

    emit("processing", "Compositing billede...", 25);

    // Use client-provided placements (most up-to-date) or fall back to DB
    const placements =
      (Array.isArray(input.framePlacements) && input.framePlacements.length > 0)
        ? input.framePlacements
        : (frame.placements?.length > 0 ? frame.placements : [frame.placement]);
    const assignmentsList: { placement: typeof placements[number]; creativeBuffer: Buffer }[] = [];

    for (let i = 0; i < placements.length; i++) {
      const cId = input.creativeAssignments?.[i] || input.creativeId;
      if (!cId) continue;
      if (cId === input.creativeId) {
        assignmentsList.push({ placement: placements[i], creativeBuffer });
      } else {
        const altCreative = await getCreative(cId);
        if (!altCreative) continue;
        let altBuf: Buffer;
        if (altCreative.driveFileId) {
          altBuf = await downloadFile(altCreative.driveFileId);
        } else if (altCreative.thumbnailUrl) {
          altBuf = await loadImageBuffer(altCreative.thumbnailUrl);
        } else {
          continue;
        }
        assignmentsList.push({ placement: placements[i], creativeBuffer: altBuf });
      }
    }

    const mockupBuffer = await compositeMultiplePlacements(
      frameBuffer, assignmentsList, frame.frameWidth, frame.frameHeight
    );

    // Store preview as base64 (compositor outputs JPEG)
    proposal.mockupBuffer = `data:image/jpeg;base64,${mockupBuffer.toString("base64")}`;
    proposal.status = "mockup_ready";
    upsertProposal(proposal);
    emit("mockup_ready", "Mockup genereret!", 40);

    // ── Step 2: Upload mockup to Google Drive ──
    try {
      const folders = await ensureOohFolders();
      const filename = `mockup-${input.clientCompany.replace(/\s/g, "-")}-${Date.now()}.png`;

      emit("mockup_ready", "Uploader til Google Drive...", 50);

      const uploaded = await uploadFile(
        mockupBuffer,
        filename,
        "image/png",
        folders.generatedId
      );

      proposal.mockupDriveId = uploaded.fileId;
      proposal.mockupUrl = uploaded.webViewLink;
      upsertProposal(proposal);

      emit("mockup_ready", "Mockup uploadet til Drive", 55);
    } catch (e) {
      logger.warn(`Drive upload failed (continuing without): ${e}`, { service: "ooh-proposal" });
    }

    // ── Step 3: Generate Google Slides (if template available) ──
    const template = input.templateId
      ? getTemplate(input.templateId)
      : getDefaultTemplate();

    if (template && template.driveFileId) {
      try {
        emit("mockup_ready", "Genererer Google Slides proposal...", 60);

        const today = new Date().toLocaleDateString("da-DK", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const slidesTitle = `OOH Proposal – ${input.clientCompany} – ${today}`;
        const slidesId = await copySlides(template.driveFileId, slidesTitle);

        await replaceTextPlaceholders(slidesId, {
          "{{CLIENT_NAME}}": input.clientContactName || input.clientCompany,
          "{{CLIENT_COMPANY}}": input.clientCompany,
          "{{ADDRESS}}": frame.locationAddress || frame.name,
          "{{CITY}}": frame.locationCity || "",
          "{{DATE}}": today,
          "{{PRICE}}": frame.listPrice
            ? `${frame.listPrice.toLocaleString("da-DK")} DKK`
            : "Pris efter aftale",
          "{{TRAFFIC}}": frame.dailyTraffic
            ? `~${frame.dailyTraffic.toLocaleString("da-DK")} dagligt`
            : "N/A",
          "{{FRAME_TYPE}}": frame.frameType,
        });

        if (proposal.mockupDriveId) {
          const mockupUrl = getDirectUrl(proposal.mockupDriveId);
          await applyMockupPlacements(slidesId, mockupUrl, template.mockupPlacements);
        }

        proposal.slidesId = slidesId;
        proposal.slidesUrl = getSlidesUrl(slidesId);
        proposal.status = "slides_ready";
        upsertProposal(proposal);
        emit("slides_ready", "Google Slides oprettet!", 75);

        // ── Step 4: Export PDF ──
        try {
          emit("slides_ready", "Eksporterer PDF...", 80);

          const pdfBuffer = await exportSlidesPdf(slidesId);
          const pdfFilename = `Proposal-${input.clientCompany.replace(/\s/g, "-")}-${new Date().toISOString().split("T")[0]}.pdf`;

          const folders = await ensureOohFolders();
          const pdfUploaded = await uploadFile(
            pdfBuffer,
            pdfFilename,
            "application/pdf",
            folders.generatedId
          );

          proposal.pdfDriveId = pdfUploaded.fileId;
          proposal.pdfUrl = pdfUploaded.webViewLink;
          proposal.pdfFilename = pdfFilename;
          proposal.status = "pdf_ready";
          upsertProposal(proposal);
          emit("pdf_ready", "PDF eksporteret!", 90);
        } catch (e) {
          logger.warn(`PDF export failed: ${e}`, { service: "ooh-proposal" });
        }
      } catch (e) {
        logger.warn(`Slides generation failed (continuing with mockup only): ${e}`, {
          service: "ooh-proposal",
        });
      }
    }

    // ── Done ──
    const endStatus = proposal.status === "pdf_ready"
      ? "pdf_ready"
      : proposal.status === "slides_ready"
        ? "slides_ready"
        : "mockup_ready";

    proposal.status = endStatus;
    proposal.completedAt = new Date().toISOString();
    proposal.processingDurationMs = Date.now() - new Date(proposal.startedAt!).getTime();
    upsertProposal(proposal);

    emit(endStatus, `Proposal klar! (${(proposal.processingDurationMs / 1000).toFixed(1)}s)`, 100);

    logger.info(`Proposal generated for ${input.clientCompany}: ${endStatus}`, {
      service: "ooh-proposal",
      metadata: { proposalId: proposal.id, duration: proposal.processingDurationMs },
    });

    return proposal;
  } catch (error) {
    proposal.status = "error";
    proposal.errorMessage = error instanceof Error ? error.message : String(error);
    proposal.completedAt = new Date().toISOString();
    upsertProposal(proposal);
    emit("error", proposal.errorMessage, 100);

    logger.error(`Proposal generation failed: ${proposal.errorMessage}`, {
      service: "ooh-proposal",
    });

    return proposal;
  }
}

/**
 * Send a completed proposal via email.
 */
export async function sendProposalEmail(
  proposalId: string,
  customMessage?: string
): Promise<{ success: boolean; error?: string }> {
  const proposal = getProposal(proposalId);
  if (!proposal) return { success: false, error: "Proposal not found" };

  const frame = await getFrame(proposal.frameId);
  const frameName = frame?.name || "N/A";

  const subject = `OOH Proposal: ${frameName} – ${proposal.clientCompany}`;

  const body = customMessage || [
    `Hej ${proposal.clientContactName || proposal.clientCompany},`,
    "",
    `Hermed sender vi vores forslag til outdoor reklame på ${frameName}.`,
    "",
    frame?.dailyTraffic
      ? `Lokationen har estimeret ~${frame.dailyTraffic.toLocaleString("da-DK")} daglige forbipasserende.`
      : "",
    "",
    proposal.slidesUrl ? `Se den fulde præsentation her: ${proposal.slidesUrl}` : "",
    proposal.pdfUrl ? `Download PDF: ${proposal.pdfUrl}` : "",
    "",
    "Vi ser frem til at høre fra jer.",
    "",
    "Venlig hilsen,",
    "Mads – Hyde Media",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await sendEmail({
    to: proposal.clientEmail,
    subject,
    body,
    contactName: proposal.clientContactName,
    propertyId: proposalId,
  });

  if (result.success) {
    proposal.status = "sent";
    proposal.sentAt = new Date().toISOString();
    upsertProposal(proposal);
  }

  return result;
}
