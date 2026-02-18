// GET /api/lead-sourcing/blocklist – domains + company IDs from HubSpot Contacts (for dedupe)

import { NextResponse } from "next/server";
import { getBlocklist } from "@/lib/lead-sourcing/dedupe";

export async function GET() {
  try {
    const blocklist = await getBlocklist();
    return NextResponse.json({
      domains: [...blocklist.domains],
      companyIds: [...blocklist.companyIds],
      count: blocklist.domains.size + blocklist.companyIds.size,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
