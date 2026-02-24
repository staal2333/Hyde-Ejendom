// ============================================================
// Auth middleware – protects all /api/* routes except public ones
// Runs on the Edge runtime (lightweight, fast)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, COOKIE_NAME } from "@/lib/session";

const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/health",
  "/api/ooh/track/",
  "/api/status",
];

function isCronRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/auto-research" ||
    pathname === "/api/run-research"
  );
}

function hasBearerToken(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return !!auth && auth.startsWith("Bearer ");
}

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Body size limit for POST/PUT/PATCH
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: "Request body too large", detail: "Max 2 MB" },
        { status: 413 },
      );
    }
  }

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (isCronRoute(pathname) && hasBearerToken(req)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const valid = await verifySessionToken(token);
  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
