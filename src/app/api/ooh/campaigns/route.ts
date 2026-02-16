import { NextRequest, NextResponse } from "next/server";
import { getCampaigns, getCampaign, upsertCampaign, deleteCampaign } from "@/lib/ooh/store";
import type { OOHCampaign } from "@/lib/ooh/types";

export const runtime = "nodejs";

/** GET /api/ooh/campaigns – List all campaigns */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const campaigns = await getCampaigns({ status });
  return NextResponse.json({ campaigns });
}

/** POST /api/ooh/campaigns – Create a new campaign */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const campaign: OOHCampaign = {
    id: `camp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: body.name || "Ny kampagne",
    status: "draft",
    networkId: body.networkId || undefined,
    frameIds: body.frameIds || [],
    creativeId: body.creativeId || undefined,
    templateId: body.templateId || undefined,
    contactIds: body.contactIds || [],
    emailSubject: body.emailSubject || "",
    emailBody: body.emailBody || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await upsertCampaign(campaign);
  return NextResponse.json(campaign, { status: 201 });
}

/** PUT /api/ooh/campaigns – Update a campaign */
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getCampaign(id);
  if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const updated: OOHCampaign = {
    ...existing,
    ...updates,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  await upsertCampaign(updated);
  return NextResponse.json(updated);
}

/** DELETE /api/ooh/campaigns?id=xxx – Delete a campaign */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existed = await deleteCampaign(id);
    if (!existed) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[campaigns]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
