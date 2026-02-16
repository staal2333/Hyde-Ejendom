// ============================================================
// HubSpot Write-Back – syncs outreach events back to HubSpot
//
// - Creates engagement notes when emails are sent
// - Updates custom property `outreach_status` on contact changes
// - Gracefully fails (non-blocking) if HubSpot is not configured
// ============================================================

const BASE_URL = "https://api.hubapi.com";

function getToken(): string | null {
  return process.env.HUBSPOT_ACCESS_TOKEN || null;
}

function getHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Find a HubSpot contact ID by email address.
 * Returns null if not found or not configured.
 */
async function findContactByEmail(email: string): Promise<string | null> {
  const token = getToken();
  if (!token || !email) return null;

  try {
    const res = await fetch(
      `${BASE_URL}/crm/v3/objects/contacts/search`,
      {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                { propertyName: "email", operator: "EQ", value: email },
              ],
            },
          ],
          limit: 1,
        }),
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Create a note engagement on a HubSpot contact.
 * Used when an email is sent or a follow-up occurs.
 */
export async function createHubSpotNote(
  contactEmail: string,
  noteBody: string
): Promise<void> {
  const token = getToken();
  if (!token) return;

  try {
    const hsContactId = await findContactByEmail(contactEmail);
    if (!hsContactId) return;

    // Create a note
    const noteRes = await fetch(`${BASE_URL}/crm/v3/objects/notes`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({
        properties: {
          hs_note_body: noteBody,
          hs_timestamp: new Date().toISOString(),
        },
        associations: [
          {
            to: { id: hsContactId },
            types: [
              {
                associationCategory: "HUBSPOT_DEFINED",
                associationTypeId: 202, // note-to-contact
              },
            ],
          },
        ],
      }),
    });

    if (!noteRes.ok) {
      console.error(
        "[hubspot-sync] Failed to create note:",
        noteRes.status,
        await noteRes.text().catch(() => "")
      );
    }
  } catch (err) {
    console.error("[hubspot-sync] Error creating note:", err);
  }
}

/**
 * Update the outreach_status property on a HubSpot contact.
 * Creates the property if it doesn't exist (first-time setup).
 */
export async function updateHubSpotOutreachStatus(
  contactEmail: string,
  status: string
): Promise<void> {
  const token = getToken();
  if (!token) return;

  try {
    const hsContactId = await findContactByEmail(contactEmail);
    if (!hsContactId) return;

    // Map internal statuses to human-readable labels
    const LABELS: Record<string, string> = {
      sent: "Email sendt",
      opened: "Email åbnet",
      replied: "Besvaret",
      meeting: "Møde aftalt",
      sold: "Solgt",
      rejected: "Afvist",
    };

    const res = await fetch(
      `${BASE_URL}/crm/v3/objects/contacts/${hsContactId}`,
      {
        method: "PATCH",
        headers: getHeaders(token),
        body: JSON.stringify({
          properties: {
            outreach_status: LABELS[status] || status,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      // If the property doesn't exist, try creating it first
      if (errText.includes("outreach_status") && (errText.includes("not exist") || errText.includes("invalid"))) {
        console.log("[hubspot-sync] Creating outreach_status property...");
        await ensureOutreachStatusProperty(token);
        // Retry the update
        await fetch(`${BASE_URL}/crm/v3/objects/contacts/${hsContactId}`, {
          method: "PATCH",
          headers: getHeaders(token),
          body: JSON.stringify({
            properties: { outreach_status: LABELS[status] || status },
          }),
        });
      } else {
        console.error("[hubspot-sync] Failed to update status:", res.status, errText);
      }
    }
  } catch (err) {
    console.error("[hubspot-sync] Error updating status:", err);
  }
}

/**
 * Create the outreach_status custom property in HubSpot if it doesn't exist.
 */
async function ensureOutreachStatusProperty(token: string): Promise<void> {
  try {
    await fetch(`${BASE_URL}/crm/v3/properties/contacts`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify({
        name: "outreach_status",
        label: "OOH Outreach Status",
        type: "string",
        fieldType: "text",
        groupName: "contactinformation",
        description: "Current status of OOH outreach from Ejendom AI",
      }),
    });
  } catch {
    // Property may already exist, that's fine
  }
}

/**
 * Convenience: sync both note and status in one call.
 * Call after sending emails, follow-ups, or status changes.
 */
export async function syncToHubSpot(opts: {
  contactEmail: string;
  status: string;
  noteBody?: string;
}): Promise<void> {
  const { contactEmail, status, noteBody } = opts;

  // Run both in parallel (non-blocking)
  const promises: Promise<void>[] = [
    updateHubSpotOutreachStatus(contactEmail, status),
  ];

  if (noteBody) {
    promises.push(createHubSpotNote(contactEmail, noteBody));
  }

  await Promise.allSettled(promises);
}
