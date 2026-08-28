import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  clearPreviewCookieHeader,
  createPreviewToken,
  isApprovedPreviewEmail,
  previewCookieHeader,
  previewPassword,
} from "@/lib/previewAuth";

export const runtime = "nodejs";

function isSecure(req: NextRequest): boolean {
  return req.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production";
}

export async function POST(req: NextRequest) {
  const expected = previewPassword();
  if (!expected) {
    return Response.json({ ok: false, error: "Could not sign in." }, { status: 500 });
  }

  let body: { email?: string; password?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (body.action === "logout") {
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": clearPreviewCookieHeader(isSecure(req)) } }
    );
  }

  const email = (body.email || "").toLowerCase().trim();
  const password = body.password || "";

  if (!isApprovedPreviewEmail(email)) {
    return Response.json({ ok: false, error: "Could not sign in." }, { status: 403 });
  }

  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ ok: false, error: "Could not sign in." }, { status: 401 });
  }

  const token = createPreviewToken(email);
  if (!token) {
    return Response.json({ ok: false, error: "Could not sign in." }, { status: 500 });
  }

  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": previewCookieHeader(token, isSecure(req)) } }
  );
}
