import { NextRequest, NextResponse } from "next/server";
import { getTemplates, getTemplate, upsertTemplate, seedDemoData } from "@/lib/ooh/store";
import type { Template } from "@/lib/ooh/types";

let seeded = false;
function ensureSeeded() {
  if (!seeded) { seedDemoData(); seeded = true; }
}

export async function GET() {
  ensureSeeded();
  return NextResponse.json({ templates: getTemplates() });
}

export async function POST(req: NextRequest) {
  ensureSeeded();
  const body = await req.json();

  const template: Template = {
    id: `tpl_${Date.now()}`,
    name: body.name,
    driveFileId: body.driveFileId || "",
    totalSlides: body.totalSlides || 4,
    mockupPlacements: body.mockupPlacements || [],
    isDefault: body.isDefault || false,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  upsertTemplate(template);
  return NextResponse.json(template, { status: 201 });
}
