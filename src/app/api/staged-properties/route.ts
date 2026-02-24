// ============================================================
// CRUD API for Staged Properties
// GET  /api/staged-properties         – list with filters
// POST /api/staged-properties         – create new staged property
// PUT  /api/staged-properties?id=X    – update
// DELETE /api/staged-properties?id=X  – delete
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  listStagedProperties,
  insertStagedProperty,
  updateStagedProperty,
  deleteStagedProperty,
  getStagedCounts,
} from "@/lib/staging/store";
import type { StagedStage, StagedSource } from "@/lib/staging/store";
import { apiError } from "@/lib/api-error";
import { stagedPropertyCreateSchema, parseBody } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get("stage") as StagedStage | null;
    const source = searchParams.get("source") as StagedSource | null;
    const city = searchParams.get("city");
    const search = searchParams.get("search");
    const countsOnly = searchParams.get("counts") === "true";

    if (countsOnly) {
      const counts = await getStagedCounts();
      return NextResponse.json({ counts });
    }

    const properties = await listStagedProperties({
      stage: stage || undefined,
      source: source || undefined,
      city: city || undefined,
      search: search || undefined,
    });

    return NextResponse.json({ properties });
  } catch (error) {
    logger.error("staged-properties GET error", { service: "api-staged", error: { message: String(error) } });
    return apiError(500, error instanceof Error ? error.message : "Unknown error");
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = parseBody(stagedPropertyCreateSchema, raw);
    if (!parsed.ok) return apiError(400, parsed.error, parsed.detail);

    const property = await insertStagedProperty({
      ...parsed.data,
      source: parsed.data.source || "manual",
    });

    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    logger.error("staged-properties POST error", { service: "api-staged", error: { message: String(error) } });
    return apiError(500, error instanceof Error ? error.message : "Unknown error");
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return apiError(400, "id query param is required");

    const body = await req.json();
    const updated = await updateStagedProperty(id, body);
    if (!updated) return apiError(404, "Not found");

    return NextResponse.json({ property: updated });
  } catch (error) {
    logger.error("staged-properties PUT error", { service: "api-staged", error: { message: String(error) } });
    return apiError(500, error instanceof Error ? error.message : "Unknown error");
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return apiError(400, "id query param is required");

    const ok = await deleteStagedProperty(id);
    if (!ok) return apiError(500, "Delete failed");

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("staged-properties DELETE error", { service: "api-staged", error: { message: String(error) } });
    return apiError(500, error instanceof Error ? error.message : "Unknown error");
  }
}
