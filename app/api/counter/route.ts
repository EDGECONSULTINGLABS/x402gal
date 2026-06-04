// app/api/counter/route.ts
// Live agent count for the entry-screen "Agents on the floor" tag.
// Ported from api/counter.js (PointJournal Vercel project).
//
// GET /api/counter?eventId=ethconf-nyc-2026 -> { liveCount }

import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const redis = Redis.fromEnv();
const SEED = Number(process.env.AGENT_NUMBER_SEED || 141);
const DEFAULT_EVENT_ID = process.env.EVENT_ID || "ethconf-nyc-2026";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("eventId") || DEFAULT_EVENT_ID;

  try {
    const real = await redis.scard(`event:${eventId}:agents`);
    return Response.json({ ok: true, eventId, liveCount: SEED + (real || 0) }, { headers: CORS });
  } catch (err) {
    console.error("[counter] error:", err);
    return Response.json({ ok: false, eventId, liveCount: SEED, degraded: true }, { headers: CORS });
  }
}
