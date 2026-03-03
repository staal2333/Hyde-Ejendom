import { NextRequest, NextResponse } from "next/server";
import { getFollowUpSuggestions, generateSingleFollowUp } from "@/lib/agents/followup-agent";
import { fetchEjendommeByStatus } from "@/lib/hubspot";

export const maxDuration = 60;

export async function GET() {
  try {
    const properties = await fetchEjendommeByStatus("FOERSTE_MAIL_SENDT", 50);
    const emails = properties
      .map((p) => p.contactEmail)
      .filter((e): e is string => !!e && e.includes("@"));

    const unique = [...new Set(emails)];
    const suggestions = await getFollowUpSuggestions(unique, 10);
    return NextResponse.json({ success: true, suggestions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    if (!body.email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const suggestion = await generateSingleFollowUp(body.email);
    if (!suggestion) return NextResponse.json({ error: "Could not generate" }, { status: 500 });
    return NextResponse.json({ success: true, suggestion });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
