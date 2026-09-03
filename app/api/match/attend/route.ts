// app/api/match/attend/route.ts
// Summit attendee capture. Same storage pattern as /api/capture (Upstash Redis),
// same-origin only, no CORS. One record per email per event; later posts patch it.
//
// POST { name, email, company, role, source, consent, badgeCode, metro?, assessmentGallons?, ... }
// → { ok: true, badgeCode }

import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { SUMMIT_EVENT_ID, validateAttendee, type AttendeeRecord } from "@/lib/match/attendee";

export const runtime = "nodejs";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Server-side twin of badgeCodeFor() — the booth code must not depend on the phone. */
function badgeCode(email: string, eventId: string): string {
  const digest = createHash("sha256").update(`${eventId}:${email.trim().toLowerCase()}`).digest();
  let out = "";
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[digest[i] % CODE_ALPHABET.length];
  return `HC-${out.slice(0, 3)}-${out.slice(3)}`;
}

function redis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  return Redis.fromEnv();
}

function attendeeKeys(eventId: string) {
  return {
    set: `summit:${eventId}:attendees`,
    record: (email: string) => `summit:${eventId}:attendee:${email.toLowerCase()}`,
  };
}

export async function POST(req: NextRequest) {
  let body: Partial<AttendeeRecord>;
  try {
    body = (await req.json()) as Partial<AttendeeRecord>;
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const checked = validateAttendee(body);
  if (!checked.ok) return Response.json({ ok: false, error: checked.error }, { status: 400 });
  const input = checked.value;
  const eventId = SUMMIT_EVENT_ID;
  const code = badgeCode(input.email, eventId);

  const store = redis();
  if (!store) {
    // Not configured (local dev). The phone keeps its copy and retries later.
    return Response.json({ ok: false, error: "Capture store is not configured.", badgeCode: code }, { status: 503 });
  }

  const keys = attendeeKeys(eventId);
  const now = new Date().toISOString();
  try {
    const existing = await store.hgetall<Record<string, string>>(keys.record(input.email));
    const record: Record<string, string> = {
      eventId,
      name: input.name,
      email: input.email,
      company: input.company,
      role: input.role,
      source: input.source,
      consent: "true",
      consentAt: existing?.consentAt || (typeof body.consentAt === "string" ? body.consentAt : now),
      createdAt: existing?.createdAt || (typeof body.createdAt === "string" ? body.createdAt : now),
      updatedAt: now,
      badgeCode: code,
    };
    // Optional progress fields — only patch when present.
    for (const k of ["metro", "metroAt", "assessmentVersion", "assessedAt", "badgeAt"] as const) {
      const v = body[k];
      if (typeof v === "string" && v) record[k] = v;
    }
    if (typeof body.assessmentGallons === "number" && Number.isFinite(body.assessmentGallons)) {
      record.assessmentGallons = String(body.assessmentGallons);
    }
    await store.hset(keys.record(input.email), record);
    await store.sadd(keys.set, input.email);
    return Response.json({ ok: true, badgeCode: code });
  } catch (err) {
    console.error("[attend] error:", err);
    return Response.json({ ok: false, error: "Could not save.", badgeCode: code }, { status: 500 });
  }
}
