// ============================================================
// /api/discovery-config – CRUD for auto-discovery configuration
// GET    → list configs (query: ?active=true&type=street)
// POST   → create/update config
// DELETE → remove config (body: { id })
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import {
  listDiscoveryConfigs,
  upsertDiscoveryConfig,
  deleteDiscoveryConfig,
} from "@/lib/discovery/config-store";
import type { DiscoveryType } from "@/lib/discovery/config-store";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const activeOnly = searchParams.get("active") === "true";
  const type = searchParams.get("type") as DiscoveryType | null;

  const configs = await listDiscoveryConfigs({
    activeOnly: activeOnly || undefined,
    type: type || undefined,
  });

  return NextResponse.json(configs);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, type, city, street, minScore, minTraffic, isActive } = body;

    if (!type || !city) {
      return NextResponse.json(
        { error: "type and city are required" },
        { status: 400 }
      );
    }

    if (type === "street" && !street) {
      return NextResponse.json(
        { error: "street is required for type 'street'" },
        { status: 400 }
      );
    }

    const config = await upsertDiscoveryConfig({
      id,
      type,
      city,
      street: street || null,
      minScore,
      minTraffic,
      isActive,
    });

    if (!config) {
      return NextResponse.json(
        { error: "Failed to save config – check Supabase connection" },
        { status: 500 }
      );
    }

    return NextResponse.json(config);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const ok = await deleteDiscoveryConfig(id);
    return NextResponse.json({ ok });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
