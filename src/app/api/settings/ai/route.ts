import { NextRequest, NextResponse } from "next/server";
import { getAISettings, saveAISettings } from "@/lib/ai-settings";

export async function GET() {
  try {
    const settings = await getAISettings();
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const updated = await saveAISettings({
      toneOfVoice: typeof body.toneOfVoice === "string" ? body.toneOfVoice : undefined,
      exampleEmails: typeof body.exampleEmails === "string" ? body.exampleEmails : undefined,
      senderName: typeof body.senderName === "string" ? body.senderName : undefined,
    });
    return NextResponse.json({ settings: updated });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
