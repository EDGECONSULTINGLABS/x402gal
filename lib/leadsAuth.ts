// lib/leadsAuth.ts
// Server-side session tokens for the /leads dashboard.
// Tokens are HMAC-SHA256 signed with LEADS_SESSION_SECRET (falls back to
// LEADS_PASSWORD) and carried in an HttpOnly cookie so PII endpoints can
// verify access without any client-side trust.

import { createHmac, timingSafeEqual } from "crypto";

export const LEADS_COOKIE = "leads_session";
export const LEADS_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function secret(): string | null {
  return process.env.LEADS_SESSION_SECRET || process.env.LEADS_PASSWORD || null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

/** Create a signed session token: base64(email).expiresAtMs.hmac */
export function createLeadsToken(email: string): string | null {
  const key = secret();
  if (!key) return null;
  const payload = `${Buffer.from(email.toLowerCase().trim()).toString("base64url")}.${Date.now() + LEADS_SESSION_TTL_MS}`;
  return `${payload}.${sign(payload, key)}`;
}

/** Verify a session token. Returns the email if valid, otherwise null. */
export function verifyLeadsToken(token: string | undefined | null): string | null {
  const key = secret();
  if (!key || !token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [emailB64, expiresAt, mac] = parts;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return null;
  const expected = sign(`${emailB64}.${expiresAt}`, key);
  const a = Buffer.from(mac, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(emailB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
}
