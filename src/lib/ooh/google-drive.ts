// ============================================================
// OOH Google Drive Service – File storage and management
// Uses the same OAuth2 credentials as Gmail
// ============================================================

import { google } from "googleapis";
import { config } from "../config";
import { Readable } from "stream";

// Lazy singleton
let _drive: ReturnType<typeof google.drive> | null = null;

function getDriveClient() {
  if (!_drive) {
    const clientId = config.gmail.clientId();
    const clientSecret = config.gmail.clientSecret();
    const refreshToken = config.gmail.refreshToken();

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "Google API not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN."
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      "https://developers.google.com/oauthplayground"
    );

    oauth2Client.setCredentials({ refresh_token: refreshToken });

    _drive = google.drive({ version: "v3", auth: oauth2Client });
  }

  return _drive;
}

// ── Folder Management ────────────────────────────────────

/**
 * Find or create the OOH folder structure in Drive.
 */
export async function ensureOohFolders(): Promise<{
  rootId: string;
  framesId: string;
  creativesId: string;
  generatedId: string;
  templatesId: string;
}> {
  const root = await findOrCreateFolder("OOH-Proposals");
  const [framesId, creativesId, generatedId, templatesId] = await Promise.all([
    findOrCreateFolder("Frames", root),
    findOrCreateFolder("Creatives", root),
    findOrCreateFolder("Generated", root),
    findOrCreateFolder("Templates", root),
  ]);

  return { rootId: root, framesId, creativesId, generatedId, templatesId };
}

async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const drive = getDriveClient();

  const query = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  // Create folder
  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    },
    fields: "id",
  });

  return createRes.data.id!;
}

// ── File Operations ──────────────────────────────────────

/**
 * Upload a file to Google Drive.
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDriveClient();

  const res = await drive.files.create({
    requestBody: {
      name: filename,
      mimeType,
      parents: folderId ? [folderId] : undefined,
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink",
  });

  // Make file accessible via link
  await drive.permissions.create({
    fileId: res.data.id!,
    requestBody: {
      role: "reader",
      type: "anyone",
    },
  });

  return {
    fileId: res.data.id!,
    webViewLink: res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`,
  };
}

/**
 * Download a file from Google Drive.
 */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();

  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(res.data as ArrayBuffer);
}

/**
 * Get a thumbnail URL for a Drive file.
 */
export function getThumbnailUrl(fileId: string, size = 400): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}

/**
 * Get a direct download URL for a Drive file.
 */
export function getDirectUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * List files in a Drive folder.
 */
export async function listFiles(
  folderId: string,
  mimeTypeFilter?: string
): Promise<Array<{ id: string; name: string; mimeType: string; size: string; thumbnailLink: string | null }>> {
  const drive = getDriveClient();

  let query = `'${folderId}' in parents and trashed=false`;
  if (mimeTypeFilter) {
    query += ` and mimeType contains '${mimeTypeFilter}'`;
  }

  const res = await drive.files.list({
    q: query,
    fields: "files(id, name, mimeType, size, thumbnailLink, imageMediaMetadata)",
    orderBy: "modifiedTime desc",
    pageSize: 100,
  });

  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name!,
    mimeType: f.mimeType!,
    size: f.size || "0",
    thumbnailLink: f.thumbnailLink || null,
  }));
}

// ── Google Slides ────────────────────────────────────────

/**
 * Copy a Google Slides template and return the new presentation ID.
 */
export async function copySlides(
  templateFileId: string,
  newTitle: string
): Promise<string> {
  const drive = getDriveClient();

  const res = await drive.files.copy({
    fileId: templateFileId,
    requestBody: { name: newTitle },
    fields: "id",
  });

  return res.data.id!;
}

/**
 * Export a Google Slides presentation as PDF.
 */
export async function exportSlidesPdf(slidesId: string): Promise<Buffer> {
  const drive = getDriveClient();

  const res = await drive.files.export(
    { fileId: slidesId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" }
  );

  return Buffer.from(res.data as ArrayBuffer);
}
