// ============================================================
// Session token helpers – HMAC-based stateless sessions
// Works in both Edge (middleware) and Node.js (API routes)
// ============================================================

const COOKIE_NAME = "ejendom_session";
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getSecret(): string {
  const pin = process.env.AUTH_PIN;
  if (!pin && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_PIN environment variable is required in production");
  }
  return pin || "dev-only-default-secret";
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const sig = await hmacSign(payload, getSecret());
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;

  const payload = token.substring(0, dot);
  const sig = token.substring(dot + 1);
  const expected = await hmacSign(payload, getSecret());

  if (sig !== expected) return false;

  const expiresAt = parseInt(payload, 10);
  if (Number.isNaN(expiresAt)) return false;

  return Date.now() < expiresAt;
}

export { COOKIE_NAME, SESSION_TTL_MS };
