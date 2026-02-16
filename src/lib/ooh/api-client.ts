/**
 * Shared OOH API client.
 * Reduces repeated fetch+json+error boilerplate across components.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  // For DELETE that returns empty body
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  const data = await res.json();
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data);
  }
  return data as T;
}

export const oohApi = {
  // ── Frames ────────────────────────────────────
  getFrames: () => request<{ frames: unknown[] }>("/api/ooh/frames").then((d) => d.frames || []),
  createFrame: (data: unknown) => request("/api/ooh/frames", { method: "POST", body: JSON.stringify(data) }),
  updateFrame: (id: string, data: unknown) => request(`/api/ooh/frames?id=${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteFrame: (id: string) => request(`/api/ooh/frames?id=${id}`, { method: "DELETE" }),

  // ── Creatives ─────────────────────────────────
  getCreatives: (q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    return request<{ items: unknown[] }>(`/api/ooh/creatives${qs}`).then((d) => d.items || []);
  },
  deleteCreative: (id: string) => request(`/api/ooh/creatives?id=${id}`, { method: "DELETE" }),

  // ── Proposals ─────────────────────────────────
  getProposals: () => request<{ items: unknown[] }>("/api/ooh/proposals").then((d) => d.items || []),

  // ── Networks ──────────────────────────────────
  getNetworks: () => request<{ items: unknown[] }>("/api/ooh/networks").then((d) => d.items || []),
  createNetwork: (data: unknown) => request("/api/ooh/networks", { method: "POST", body: JSON.stringify(data) }),
  deleteNetwork: (id: string) => request(`/api/ooh/networks?id=${id}`, { method: "DELETE" }),

  // ── Templates ─────────────────────────────────
  getTemplates: () => request<{ items: unknown[] }>("/api/ooh/presentation-templates").then((d) => d.items || []),
  deleteTemplate: (id: string) => request(`/api/ooh/presentation-templates?id=${id}`, { method: "DELETE" }),
  saveTemplate: (data: unknown) => request("/api/ooh/presentation-templates", { method: "POST", body: JSON.stringify(data) }),

  // ── Contacts ──────────────────────────────────
  getContacts: () => request<{ items: unknown[] }>("/api/ooh/contacts").then((d) => d.items || []),
  saveContact: (data: unknown) => request("/api/ooh/contacts", { method: "POST", body: JSON.stringify(data) }),
  deleteContact: (id: string) => request(`/api/ooh/contacts?id=${id}`, { method: "DELETE" }),

  // ── Campaigns ─────────────────────────────────
  getCampaigns: () => request<{ items: unknown[] }>("/api/ooh/campaigns").then((d) => d.items || []),
  saveCampaign: (data: unknown) => request("/api/ooh/campaigns", { method: "POST", body: JSON.stringify(data) }),
  deleteCampaign: (id: string) => request(`/api/ooh/campaigns?id=${id}`, { method: "DELETE" }),
  sendCampaign: (campaignId: string) => request("/api/ooh/send-campaign", { method: "POST", body: JSON.stringify({ campaignId }) }),

  // ── Sends ─────────────────────────────────────
  getSends: (campaignId?: string) => {
    const qs = campaignId ? `?campaignId=${campaignId}` : "";
    return request<{ items: unknown[] }>(`/api/ooh/sends${qs}`).then((d) => d.items || []);
  },
  updateSend: (id: string, data: unknown) => request(`/api/ooh/sends?id=${id}`, { method: "PUT", body: JSON.stringify(data) }),

  // ── Follow-up ─────────────────────────────────
  sendFollowUp: (sendId: string) => request("/api/ooh/follow-up", { method: "POST", body: JSON.stringify({ sendId }) }),

  // ── HubSpot Sync ──────────────────────────────
  syncHubSpot: () => request("/api/ooh/hubspot-sync", { method: "POST" }),
  getHubSpotContacts: () => request<{ contacts: unknown[] }>("/api/ooh/hubspot-contacts").then((d) => d.contacts || []),

  // ── Mockup / PDF ──────────────────────────────
  downloadMockup: (data: unknown) =>
    fetch("/api/ooh/download-mockup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  generatePresentation: (data: unknown) =>
    fetch("/api/ooh/generate-presentation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  batchMockup: (data: unknown) =>
    fetch("/api/ooh/batch-mockup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
};
