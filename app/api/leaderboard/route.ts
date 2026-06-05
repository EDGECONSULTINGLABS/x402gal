// app/api/leaderboard/route.ts
// Public leaderboard for INFILTRATE. Returns ranked agents sorted by points.
// Names are hidden by default — agents must opt-in to show their name.
//
// GET /api/leaderboard
// Returns: { agents: [...], total }
//
// POST /api/leaderboard  { email, visible: true|false }
// Toggles visibility preference for the agent.

import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

const redis = Redis.fromEnv();
const DEFAULT_EVENT_ID = process.env.EVENT_ID || "ethconf-nyc-2026";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

interface LeaderboardEntry {
  rank: number;
  agentNumber: string;
  name: string | null;       // null if hidden
  points: number;
  missions: number;
  tier: string;
  squad: string | null;
  holo: boolean;
  minted: boolean;
}

export async function GET() {
  const eventId = DEFAULT_EVENT_ID;
  const members = await redis.smembers(`event:${eventId}:agents`);

  const agents: LeaderboardEntry[] = [];

  for (const email of members) {
    const data = await redis.hgetall(`event:${eventId}:agent:${email}`) as Record<string, string> | null;
    if (!data || !data.agentNumber) continue;

    const missions = (data.missions_completed || "").split(",").filter(Boolean);
    const points = Number(data.points) || 0;
    const holo = missions.length >= 6;
    const visible = data.leaderboard_visible === "true";

    agents.push({
      rank: 0, // assigned after sort
      agentNumber: String(data.agentNumber).padStart(4, "0"),
      name: visible ? (data.name || "Agent") : null,
      points,
      missions: missions.length,
      tier: holo ? "Genesis Holo" : missions.length >= 4 ? "Verified Agent" : "In Progress",
      squad: data.squad || null,
      holo,
      minted: !!(data.nft_id),
    });
  }

  // Sort by points descending, then by agent number ascending as tiebreaker
  agents.sort((a, b) => b.points - a.points || Number(a.agentNumber) - Number(b.agentNumber));

  // Assign ranks
  agents.forEach((a, i) => { a.rank = i + 1; });

  return Response.json({ agents, total: agents.length }, { headers: CORS });
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400, headers: CORS });
  }

  const email = body.email as string | undefined;
  const visible = body.visible as boolean | undefined;

  if (!email || typeof visible !== "boolean") {
    return Response.json(
      { ok: false, error: "requires { email, visible: true|false }" },
      { status: 400, headers: CORS }
    );
  }

  const eventId = DEFAULT_EVENT_ID;
  const agentKey = `event:${eventId}:agent:${email.toLowerCase()}`;

  const exists = await redis.exists(agentKey);
  if (!exists) {
    return Response.json({ ok: false, error: "agent not found" }, { status: 404, headers: CORS });
  }

  await redis.hset(agentKey, { leaderboard_visible: String(visible) });

  return Response.json({ ok: true, visible }, { headers: CORS });
}
