import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const { email, firstname, lastname, company, phone } = await request.json();
    if (!email) return NextResponse.json({ error: "Email er påkrævet" }, { status: 400 });

    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.hubspot.accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          email,
          ...(firstname && { firstname }),
          ...(lastname && { lastname }),
          ...(company && { company }),
          ...(phone && { phone }),
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 409) {
        return NextResponse.json({ error: "Kontakten findes allerede i HubSpot", exists: true }, { status: 409 });
      }
      logger.error(`[hubspot] Create contact failed: ${JSON.stringify(err)}`);
      return NextResponse.json({ error: err.message || "Kunne ikke oprette kontakt" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      success: true,
      contactId: data.id,
      hubspotUrl: `https://app.hubspot.com/contacts/contact/${data.id}`,
    });
  } catch (error) {
    logger.error(`[hubspot] Create contact error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ error: "Serverfejl" }, { status: 500 });
  }
}
