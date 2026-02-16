import { NextRequest, NextResponse } from "next/server";
import { getContacts, getContact, upsertContact, deleteContact } from "@/lib/ooh/store";
import type { OOHContact } from "@/lib/ooh/types";

export const runtime = "nodejs";

/** GET /api/ooh/contacts – List all contacts */
export async function GET(req: NextRequest) {
  try {
    const search = req.nextUrl.searchParams.get("search") || undefined;
    const city = req.nextUrl.searchParams.get("city") || undefined;
    const industry = req.nextUrl.searchParams.get("industry") || undefined;

    const contacts = await getContacts({ search, city, industry });
    return NextResponse.json({ contacts });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[contacts]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/ooh/contacts – Create a new contact */
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name || !body.email) {
    return NextResponse.json(
      { error: "Name and email are required" },
      { status: 400 }
    );
  }

  const contact: OOHContact = {
    id: `contact_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: body.name,
    email: body.email,
    phone: body.phone || undefined,
    company: body.company || "",
    industry: body.industry || undefined,
    city: body.city || undefined,
    notes: body.notes || undefined,
    tags: body.tags || [],
    lastContactedAt: undefined,
    totalProposalsSent: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await upsertContact(contact);
  return NextResponse.json(contact, { status: 201 });
}

/** PUT /api/ooh/contacts – Update a contact */
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existing = await getContact(id);
  if (!existing) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const updated: OOHContact = {
    ...existing,
    ...updates,
    id: existing.id,
    updatedAt: new Date().toISOString(),
  };
  await upsertContact(updated);
  return NextResponse.json(updated);
}

/** DELETE /api/ooh/contacts?id=xxx – Delete a contact */
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const existed = await deleteContact(id);
  if (!existed) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  return NextResponse.json({ success: true, id });
}
