import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const PREVIEW_COOKIE = "x402_preview";
export const PREVIEW_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const PREVIEW_DOMAINS = ["parjanaeng.com", "edgeconsultinglabs.com"] as const;

/** Gate is for Vercel preview only — never x402gal.com / production. */
export function isPreviewGateOn(): boolean {
  if (process.env.FORCE_PREVIEW_GATE === "1") return true;
  return process.env.VERCEL_ENV === "preview";
}

function secret(): string | null {
  return process.env.PREVIEW_SESSION_SECRET || process.env.PREVIEW_PASSWORD || null;
}

export function previewPassword(): string | null {
  return process.env.PREVIEW_PASSWORD || null;
}

export function isApprovedPreviewEmail(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  const at = normalized.lastIndexOf("@");
  if (at < 1) return false;
  const domain = normalized.slice(at + 1);
  return (PREVIEW_DOMAINS as readonly string[]).includes(domain);
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function createPreviewToken(email: string): string | null {
  const key = secret();
  if (!key) return null;
  const payload = `${Buffer.from(email.toLowerCase().trim()).toString("base64url")}.${Date.now() + PREVIEW_SESSION_TTL_MS}`;
  return `${payload}.${sign(payload, key)}`;
}

export function verifyPreviewToken(token: string | undefined | null): string | null {
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
    const email = Buffer.from(emailB64, "base64url").toString("utf8");
    return isApprovedPreviewEmail(email) ? email : null;
  } catch {
    return null;
  }
}

export function getPreviewEmail(): string | null {
  return verifyPreviewToken(cookies().get(PREVIEW_COOKIE)?.value);
}

export function previewCookieHeader(token: string, secure: boolean): string {
  const maxAge = Math.floor(PREVIEW_SESSION_TTL_MS / 1000);
  const parts = [
    `${PREVIEW_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearPreviewCookieHeader(secure: boolean): string {
  const parts = [`${PREVIEW_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
