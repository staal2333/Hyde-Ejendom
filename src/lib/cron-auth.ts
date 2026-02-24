// ============================================================
// Standardized CRON_SECRET verification (H1)
// All cron/automated routes use Authorization: Bearer <secret>
// ============================================================

import { NextRequest } from "next/server";
import { apiError } from "./api-error";

/**
 * Verify the cron secret from the request.
 * Accepts `Authorization: Bearer <secret>` header.
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function verifyCronSecret(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return null; // not configured = allow (dev mode)

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) return null;

  return apiError(401, "Unauthorized", "Invalid or missing CRON_SECRET");
}
