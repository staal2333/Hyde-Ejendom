import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, COOKIE_NAME, SESSION_TTL_MS } from "@/lib/session";
import { apiError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  try {
    const { pin } = (await req.json()) as { pin?: string };

    const authPin = process.env.AUTH_PIN;
    if (!authPin) {
      return apiError(500, "AUTH_PIN is not configured on the server");
    }

    if (!pin || pin.trim() !== authPin) {
      return apiError(401, "Forkert kode");
    }

    const token = await createSessionToken();

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });

    return res;
  } catch {
    return apiError(400, "Invalid request body");
  }
}
