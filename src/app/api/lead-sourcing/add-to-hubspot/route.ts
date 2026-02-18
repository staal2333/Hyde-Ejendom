// POST /api/lead-sourcing/add-to-hubspot – create Company + Contacts in HubSpot

import { NextRequest, NextResponse } from "next/server";
import { createLeadCompany, createLeadContact } from "@/lib/hubspot";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      company,
      contacts = [],
    } = body as {
      company: { name: string; domain?: string; address?: string; city?: string; zip?: string; website?: string; cvr?: string };
      contacts: { email: string; firstname?: string; lastname?: string; jobtitle?: string }[];
    };

    if (!company?.name) {
      return NextResponse.json({ error: "company.name required" }, { status: 400 });
    }

    const companyId = await createLeadCompany({
      name: company.name,
      domain: company.domain,
      address: company.address,
      city: company.city,
      zip: company.zip,
      website: company.website,
      cvr: company.cvr,
    });

    const contactIds: string[] = [];
    for (const c of contacts) {
      if (!c.email) continue;
      const id = await createLeadContact({
        email: c.email,
        firstname: c.firstname,
        lastname: c.lastname,
        jobtitle: c.jobtitle,
        companyId,
      });
      contactIds.push(id);
    }

    return NextResponse.json({
      success: true,
      companyId,
      contactIds,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
