// PATCH /api/leads/[id] – update status, add note, set followup, edit fields

import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { z } from "zod";

const patchSchema = z.object({
  status: z.enum(["new", "qualified", "contacted", "customer", "lost"]).optional(),
  note: z.string().optional(),
  noteAuthor: z.string().optional(),
  next_followup_at: z.string().optional(),
  contact_email: z.string().optional(),
  contact_phone: z.string().optional(),
  hubspot_company_id: z.string().optional(),
}).refine(data => Object.keys(data).length > 0, { message: "At least one field required" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const raw = await req.json();
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      return apiError(400, "Validation failed", parsed.error.issues.map(i => i.message).join(", "));
    }

    const { updateLeadStatus, addNote, setFollowup, updateLead, getLeadById } =
      await import("@/lib/lead-sourcing/lead-store");

    const data = parsed.data;
    let lead = await getLeadById(id);
    if (!lead) return apiError(404, "Lead not found");

    if (data.status) {
      lead = await updateLeadStatus(id, data.status);
    }

    if (data.note) {
      lead = await addNote(id, data.note, data.noteAuthor);
    }

    if (data.next_followup_at) {
      lead = await setFollowup(id, data.next_followup_at);
    }

    const directFields: Record<string, unknown> = {};
    if (data.contact_email !== undefined) directFields.contact_email = data.contact_email;
    if (data.contact_phone !== undefined) directFields.contact_phone = data.contact_phone;
    if (data.hubspot_company_id !== undefined) directFields.hubspot_company_id = data.hubspot_company_id;

    if (Object.keys(directFields).length > 0) {
      lead = await updateLead(id, directFields);
    }

    return NextResponse.json({ lead });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return apiError(500, msg);
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { getLeadById } = await import("@/lib/lead-sourcing/lead-store");
    const lead = await getLeadById(id);
    if (!lead) return apiError(404, "Lead not found");
    return NextResponse.json({ lead });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return apiError(500, msg);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { deleteLead } = await import("@/lib/lead-sourcing/lead-store");
    const ok = await deleteLead(id);
    if (!ok) return apiError(404, "Lead not found or deletion failed");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return apiError(500, msg);
  }
}
