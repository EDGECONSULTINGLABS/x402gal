// app/api/leads-auth/route.ts
// Validates email + password for the /leads dashboard.
// POST { email, password } → { ok: true } or { ok: false, error: string }
// Password is read from LEADS_PASSWORD env var (server-side only, never exposed to client).

import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { createLeadsToken, LEADS_COOKIE, LEADS_SESSION_TTL_MS } from "@/lib/leadsAuth";

export const runtime = "nodejs";

const APPROVED_DOMAINS = ["edgeconsultinglabs.com"];
const APPROVED_EMAILS = ["ty@digitalstormwater.com", "joe@parjanaeng.com"];

function isApprovedEmail(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  if (APPROVED_EMAILS.includes(normalized)) return true;
  const domain = normalized.split("@")[1];
  return APPROVED_DOMAINS.includes(domain);
}

export async function POST(req: NextRequest) {
  const leadsPassword = process.env.LEADS_PASSWORD;
  if (!leadsPassword) {
    return Response.json({ ok: false, error: "Server misconfigured: LEADS_PASSWORD not set." }, { status: 500 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = (body.email || "").toLowerCase().trim();
  const password = body.password || "";

  if (!isApprovedEmail(email)) {
    return Response.json({ ok: false, error: "Unauthorized email address." }, { status: 403 });
  }

  const a = Buffer.from(password, "utf8");
  const b = Buffer.from(leadsPassword, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ ok: false, error: "Invalid password." }, { status: 401 });
  }

  const token = createLeadsToken(email);
  if (!token) {
    return Response.json({ ok: false, error: "Server misconfigured: session secret not set." }, { status: 500 });
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${LEADS_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(LEADS_SESSION_TTL_MS / 1000)}`,
      },
    }
  );
}
