import { NextRequest, NextResponse } from "next/server";
import { parseNaturalRequest, suggestTilbud, type TilbudRequest } from "@/lib/agents/tilbud-agent";
import { listPlacements } from "@/lib/tilbud/placement-store";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { text?: string; request?: TilbudRequest };

    let request: TilbudRequest;
    if (body.text) {
      request = await parseNaturalRequest(body.text);
    } else if (body.request) {
      request = body.request;
    } else {
      return NextResponse.json({ error: "Provide 'text' or 'request'" }, { status: 400 });
    }

    const placementResult = await listPlacements();
    const result = await suggestTilbud(request, placementResult.items);

    return NextResponse.json({ success: true, ...result, parsedRequest: request });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
