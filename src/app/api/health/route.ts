// ============================================================
// Health Check Endpoint
// GET /api/health
// ============================================================

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ejendom-ai",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    environment: {
      hubspot: !!process.env.HUBSPOT_ACCESS_TOKEN,
      openai: !!process.env.OPENAI_API_KEY,
    },
  });
}
