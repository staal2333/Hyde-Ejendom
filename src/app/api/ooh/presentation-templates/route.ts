// ============================================================
// /api/ooh/presentation-templates – CRUD for presentation templates
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  getPresentationTemplates,
  getPresentationTemplate,
  upsertPresentationTemplate,
  deletePresentationTemplate,
} from "@/lib/ooh/store";
import type { PresentationTemplate } from "@/lib/ooh/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const templates = await getPresentationTemplates();
    return NextResponse.json(templates);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[presentation-templates]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const template: PresentationTemplate = {
      id: `ptpl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: body.name || "Untitled Template",
      pdfFileUrl: body.pdfFileUrl,
      pageCount: body.pageCount || 0,
      pages: body.pages || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await upsertPresentationTemplate(template);
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[presentation-templates]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body.id;

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existing = await getPresentationTemplate(id);
    if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const updated: PresentationTemplate = {
      ...existing,
      name: body.name ?? existing.name,
      pdfFileUrl: body.pdfFileUrl ?? existing.pdfFileUrl,
      pageCount: body.pageCount ?? existing.pageCount,
      pages: body.pages ?? existing.pages,
      updatedAt: new Date().toISOString(),
    };

    await upsertPresentationTemplate(updated);
    return NextResponse.json(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[presentation-templates]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const existed = await deletePresentationTemplate(id);
    if (!existed) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[presentation-templates]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
