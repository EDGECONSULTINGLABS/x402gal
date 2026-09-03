// app/api/match/attendees/route.ts
// Admin CSV export of Summit attendees for the CRM. Gated by the existing /leads
// session cookie (see lib/leadsAuth.ts, /api/leads-auth). Same-origin, no CORS.
//
// GET /api/match/attendees            → text/csv
// GET /api/match/attendees?format=json → JSON

import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";
import { LEADS_COOKIE, verifyLeadsToken } from "@/lib/leadsAuth";
import { SUMMIT_EVENT_ID } from "@/lib/match/attendee";

export const runtime = "nodejs";

const COLUMNS = [
  "createdAt",
  "name",
  "email",
  "company",
  "role",
  "source",
  "consent",
  "consentAt",
  "metro",
  "metroAt",
  "assessmentGallons",
  "assessmentVersion",
  "assessedAt",
  "badgeCode",
  "badgeAt",
  "updatedAt",
] as const;

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  if (!verifyLeadsToken(req.cookies.get(LEADS_COOKIE)?.value)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return Response.json({ ok: false, error: "Capture store is not configured." }, { status: 503 });
  }
  const redis = Redis.fromEnv();
  const eventId = SUMMIT_EVENT_ID;

  try {
    const emails = (await redis.smembers(`summit:${eventId}:attendees`)) as string[];
    const rows = await Promise.all(
      emails.map(async (email) => (await redis.hgetall<Record<string, string>>(`summit:${eventId}:attendee:${email}`)) ?? { email })
    );
    rows.sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));

    if (req.nextUrl.searchParams.get("format") === "json") {
      return Response.json({ ok: true, eventId, total: rows.length, attendees: rows });
    }

    const lines = [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(","))];
    return new Response(lines.join("\r\n") + "\r\n", {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="summit-attendees-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[attendees] error:", err);
    return Response.json({ ok: false, error: String((err as Error).message || err) }, { status: 500 });
  }
}
