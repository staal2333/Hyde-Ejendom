import { NextRequest, NextResponse } from "next/server";
import { getContactContext } from "@/lib/agents/contact-context";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  try {
    const ctx = await getContactContext(email);
    return NextResponse.json({ success: true, context: ctx });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
