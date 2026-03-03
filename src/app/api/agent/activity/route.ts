// Agent Activity API – shared real-time status across all users.
// GET  → returns all runs from the last 2 hours
// POST → upsert current run (start, update phase, mark done)
// DELETE → mark a run as stopped

import { NextRequest, NextResponse } from "next/server";
import { supabase, HAS_SUPABASE } from "@/lib/supabase";

export interface AgentActivityRow {
  id: string;
  street: string;
  city: string;
  phase: "discovery" | "scoring" | "research" | "done" | "stopped";
  progress: number;
  message?: string | null;
  buildings_found?: number | null;
  created_count?: number | null;
  research_completed?: number | null;
  research_total?: number | null;
  started_at: string;
  updated_at: string;
  completed_at?: string | null;
}

// GET – active runs in the last 2 hours
export async function GET() {
  if (!HAS_SUPABASE || !supabase) {
    return NextResponse.json({ runs: [] });
  }

  try {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("agent_activity")
      .select("*")
      .gte("started_at", since)
      .order("started_at", { ascending: false });

    if (error) {
      // Table may not exist yet — return empty gracefully
      if (error.code === "42P01") return NextResponse.json({ runs: [] });
      return NextResponse.json({ runs: [] });
    }

    return NextResponse.json({ runs: data || [] });
  } catch {
    return NextResponse.json({ runs: [] });
  }
}

// POST – create or update an activity run
export async function POST(req: NextRequest) {
  if (!HAS_SUPABASE || !supabase) {
    return NextResponse.json({ ok: true });
  }

  let body: Partial<AgentActivityRow>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (!body.id || !body.street || !body.city) {
      return NextResponse.json({ error: "id, street, city required" }, { status: 400 });
    }

    const row = {
      id: body.id,
      street: body.street,
      city: body.city,
      phase: body.phase || "discovery",
      progress: body.progress ?? 0,
      message: body.message ?? null,
      buildings_found: body.buildings_found ?? null,
      created_count: body.created_count ?? null,
      research_completed: body.research_completed ?? null,
      research_total: body.research_total ?? null,
      started_at: body.started_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: body.completed_at ?? null,
    };

    const { error } = await supabase
      .from("agent_activity")
      .upsert(row, { onConflict: "id" });

    if (error && error.code !== "42P01") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Fail silently — not critical
  }
}

// DELETE – mark run as stopped
export async function DELETE(req: NextRequest) {
  if (!HAS_SUPABASE || !supabase) return NextResponse.json({ ok: true });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    await supabase
      .from("agent_activity")
      .update({ phase: "stopped", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
  } catch { /* fail silently */ }

  return NextResponse.json({ ok: true });
}
