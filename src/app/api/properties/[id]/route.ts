// ============================================================
// PATCH /api/properties/[id] – Update ejendom (contact, mail, phone, name)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { updateEjendom } from "@/lib/hubspot";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Manglende ejendoms-id" }, { status: 400 });
  }

  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ugyldig JSON" }, { status: 400 });
  }

  const properties: Record<string, string> = {};
  if (typeof body.kontaktperson === "string") properties.kontaktperson = body.kontaktperson;
  if (typeof body.mailadresse === "string") properties.mailadresse = body.mailadresse;
  if (typeof body.telefonnummer === "string") properties.telefonnummer = body.telefonnummer;
  if (typeof body.hs_name === "string") properties.hs_name = body.hs_name;
  if (typeof body.name === "string") properties.hs_name = body.name;
  if (typeof body.outreach_status === "string") properties.outreach_status = body.outreach_status;

  if (Object.keys(properties).length === 0) {
    return NextResponse.json(
      { error: "Ingen gyldige felter at opdatere (kontaktperson, mailadresse, telefonnummer, name, outreach_status)" },
      { status: 400 }
    );
  }

  try {
    await updateEjendom(id, properties);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] PATCH property failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opdatere ejendom" },
      { status: 500 }
    );
  }
}
