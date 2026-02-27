// Score a small batch of addresses (BBR fetch + AI scoring + stage qualifying ones).
// Called repeatedly by the frontend to avoid Vercel timeout on large streets.
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getBuildingCandidatesFromAddresses } from "@/lib/discovery/street-scanner";
import { scoreForOutdoorPotential } from "@/lib/discovery/scoring";
import { estimateStreetTraffic } from "@/lib/discovery/traffic";
import { insertStagedProperty, stagedExistsByAddress } from "@/lib/staging/store";
import { ejendomExistsByAddress } from "@/lib/hubspot";
import type { DawaAddress } from "@/types";

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    addresses: DawaAddress[];
    street: string;
    city: string;
    minScore?: number;
    trafficDaily?: number;
  };

  const { addresses, street, city, minScore = 6, trafficDaily } = body;

  if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
    return NextResponse.json({ error: "addresses required" }, { status: 400 });
  }

  try {
    // BBR fetch + pre-filter
    const candidates = await getBuildingCandidatesFromAddresses(addresses);

    if (candidates.length === 0) {
      return NextResponse.json({ scored: [], staged: [], created: 0, alreadyExists: 0, skipped: 0 });
    }

    // Attach traffic data
    const trafficEstimate = estimateStreetTraffic(street, city);
    const dailyTraffic = trafficDaily ?? trafficEstimate.estimatedDailyTraffic;
    for (const c of candidates) {
      c.estimatedDailyTraffic = dailyTraffic;
      c.trafficSource = trafficEstimate.trafficSource;
      c.trafficConfidence = trafficEstimate.confidence;
    }

    // AI scoring (one batch — candidates already ≤15)
    const scored = await scoreForOutdoorPotential(candidates, street, city);

    const qualified = scored.filter((c) => c.outdoorScore >= minScore);

    // Stage qualifying candidates
    const staged: { id: string; address: string }[] = [];
    let created = 0;
    let alreadyExists = 0;
    const skipped = scored.length - qualified.length;

    for (const candidate of qualified) {
      const [existsInStaging, existsInHubSpot] = await Promise.all([
        stagedExistsByAddress(candidate.address),
        ejendomExistsByAddress(candidate.address).catch(() => false),
      ]);

      if (existsInStaging || existsInHubSpot) {
        alreadyExists++;
        continue;
      }

      const trafficStr = dailyTraffic
        ? `~${dailyTraffic.toLocaleString("da-DK")} køretøjer/dag`
        : "Ukendt";

      const notes = [
        `AI Discovery Score: ${candidate.outdoorScore}/10`,
        candidate.scoreReason,
        "",
        "Bygningsdata:",
        candidate.area ? `  Areal: ${candidate.area} m2` : null,
        candidate.floors ? `  Etager: ${candidate.floors}` : null,
        candidate.usageText ? `  Anvendelse: ${candidate.usageText}` : null,
        candidate.buildingYear ? `  Byggeår: ${candidate.buildingYear}` : null,
        "",
        `Trafik: ${trafficStr}`,
      ].filter(Boolean).join("\n");

      const newProp = await insertStagedProperty({
        name: candidate.address,
        address: candidate.address,
        postalCode: candidate.postalCode,
        city: candidate.city,
        outdoorScore: candidate.outdoorScore,
        outdoorNotes: notes,
        dailyTraffic,
        source: "discovery",
      });

      created++;
      staged.push({ id: newProp.id, address: candidate.address });
    }

    return NextResponse.json({
      scored: scored.map((c) => ({ address: c.address, score: c.outdoorScore, reason: c.scoreReason })),
      staged,
      created,
      alreadyExists,
      skipped,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ukendt fejl", scored: [], staged: [], created: 0, alreadyExists: 0, skipped: 0 },
      { status: 500 }
    );
  }
}
