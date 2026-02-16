// ============================================================
// Shared helper: load an image buffer from a URL or local path
// Works with both Supabase Storage URLs (https://...) and local
// paths (/ooh/frames/...) in development.
// ============================================================

/**
 * Load an image buffer from an HTTP(S) URL or a local public/ path.
 * Validates paths to prevent directory traversal.
 */
export async function loadImageBuffer(urlOrPath: string): Promise<Buffer> {
  if (!urlOrPath || typeof urlOrPath !== "string") {
    throw new Error("loadImageBuffer: urlOrPath is required");
  }

  if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${urlOrPath}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // Local path: sanitize and read from public/ directory
  const fs = await import("fs/promises");
  const path = await import("path");

  // Prevent path traversal
  const sanitized = urlOrPath.replace(/\.\./g, "").replace(/^\/+/, "");
  const publicDir = path.join(process.cwd(), "public");
  const resolved = path.resolve(publicDir, sanitized);

  if (!resolved.startsWith(publicDir)) {
    throw new Error("loadImageBuffer: path traversal detected");
  }

  return fs.readFile(resolved);
}
