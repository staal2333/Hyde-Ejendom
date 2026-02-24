// POST /api/lead-sourcing/add-to-hubspot – create Company + Contacts in HubSpot

import { NextRequest, NextResponse } from "next/server";
import { createLeadCompany, createLeadContact } from "@/lib/hubspot";
import { apiError } from "@/lib/api-error";
import { isValidEmail } from "@/lib/validation";

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
      return apiError(400, "company.name required");
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
    const skipped: string[] = [];
    for (const c of contacts) {
      if (!c.email) continue;
      if (!isValidEmail(c.email)) {
        skipped.push(c.email);
        continue;
      }
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
      ...(skipped.length > 0 ? { skippedInvalidEmails: skipped } : {}),
    });
  } catch (e) {
    return apiError(500, e instanceof Error ? e.message : "Unknown error");
  }
}
