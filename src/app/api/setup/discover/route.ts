// ============================================================
// Discovery endpoint – find all properties on the Ejendomme custom object
// GET /api/setup/discover
// ============================================================

import { NextResponse } from "next/server";
import { config } from "@/lib/config";

const EJENDOMME_OBJECT_TYPE = "0-420";

export async function GET() {
  const token = config.hubspot.accessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const results: Record<string, unknown> = { objectType: EJENDOMME_OBJECT_TYPE };

  // Try 1: Get properties schema
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/properties/${EJENDOMME_OBJECT_TYPE}`,
      { headers }
    );
    const data = await res.json();
    results.propertiesStatus = res.status;
    results.properties = data.results?.map((p: { name: string; label: string; type: string }) => ({
      name: p.name, label: p.label, type: p.type,
    })) || data;
  } catch (e) {
    results.propertiesError = String(e);
  }

  // Try 2: Get records
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/${EJENDOMME_OBJECT_TYPE}?limit=3`,
      { headers }
    );
    const data = await res.json();
    results.recordsStatus = res.status;
    results.records = data.results || data;
  } catch (e) {
    results.recordsError = String(e);
  }

  // Try 3: Also try p_ejendomme (fully qualified name)
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/objects/p_ejendomme?limit=2`,
      { headers }
    );
    const data = await res.json();
    results.byNameStatus = res.status;
    results.byNameRecords = data.results || data;
  } catch (e) {
    results.byNameError = String(e);
  }

  // Try 4: List all custom object schemas
  try {
    const res = await fetch(
      `https://api.hubapi.com/crm/v3/schemas`,
      { headers }
    );
    const data = await res.json();
    results.schemasStatus = res.status;
    results.schemas = data.results?.map((s: { objectTypeId: string; name: string; labels: { singular: string } }) => ({
      objectTypeId: s.objectTypeId,
      name: s.name,
      label: s.labels?.singular,
    })) || data;
  } catch (e) {
    results.schemasError = String(e);
  }

  return NextResponse.json(results);
}
