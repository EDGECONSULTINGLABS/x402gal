// app/api/leads/route.ts
// Returns all registered agents for INFILTRATE as a JSON table.
// Also returns funnel drop-off counters per screen.
// Protected by LEADS_SECRET env var — set this in Vercel.
//
// GET /api/leads?eventId=ethconf-nyc-2026&secret=...
// Returns: { agents: [...], funnel: { view: {...}, abandon: {...} }, total }

import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const redis = Redis.fromEnv();
const DEFAULT_EVENT_ID = process.env.EVENT_ID || "ethconf-nyc-2026";
const LEADS_SECRET = process.env.LEADS_SECRET || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || req.headers.get("x-leads-secret") || "";
  // Fail closed: if LEADS_SECRET is unset, reject everything rather than
  // exposing attendee records. Never run this endpoint without the secret set.
  if (!LEADS_SECRET || secret !== LEADS_SECRET) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const eventId = req.nextUrl.searchParams.get("eventId") || DEFAULT_EVENT_ID;

  try {
    // All registered agent emails for this event
    const emails = await redis.smembers(`event:${eventId}:agents`) as string[];

    // Fetch each agent record in parallel
    const agents = await Promise.all(
      emails.map(async (email) => {
        const data = await redis.hgetall(`event:${eventId}:agent:${email}`);
        return data || { email };
      })
    );

    // Sort by agentNumber ascending
    agents.sort((a, b) => Number((a as Record<string, unknown>).agentNumber || 0) - Number((b as Record<string, unknown>).agentNumber || 0));

    // Funnel counters
    const screens = ["entry", "capture", "missions", "badge"];
    const funnelView: Record<string, number> = {};
    const funnelAbandon: Record<string, number> = {};

    await Promise.all(screens.map(async (screen) => {
      const v = await redis.get(`event:${eventId}:funnel:view:${screen}`);
      const a = await redis.get(`event:${eventId}:funnel:abandon:${screen}`);
      funnelView[screen] = Number(v || 0);
      funnelAbandon[screen] = Number(a || 0);
    }));

    return Response.json({
      ok: true,
      eventId,
      total: agents.length,
      agents,
      funnel: { view: funnelView, abandon: funnelAbandon },
    }, { headers: CORS });
  } catch (err) {
    console.error("[leads] error:", err);
    return Response.json({ ok: false, error: String((err as Error).message || err) }, { status: 500, headers: CORS });
  }
}
