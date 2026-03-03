import { NextResponse } from "next/server";
import { getHydeLogoBuffer } from "@/lib/tilbud/branding.server";

export const runtime = "nodejs";

export async function GET() {
  const logo = getHydeLogoBuffer();
  if (!logo) {
    return NextResponse.json({ error: "Logo ikke fundet" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(logo), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=3600",
      "Content-Length": String(logo.length),
    },
  });
}
