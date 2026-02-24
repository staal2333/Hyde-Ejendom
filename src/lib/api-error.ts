// ============================================================
// Standardized API error / success response helpers (H3)
// ============================================================

import { NextResponse } from "next/server";

export function apiError(
  status: number,
  message: string,
  detail?: string,
): NextResponse {
  return NextResponse.json(
    { error: message, ...(detail ? { detail } : {}) },
    { status },
  );
}

export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
