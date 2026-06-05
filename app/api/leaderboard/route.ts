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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

    agents.push({
      rank: 0, // assigned after sort
      agentNumber: String(data.agentNumber).padStart(4, "0"),
      name: null, // names are always hidden
      points,
      missions: missions.length,
      tier: holo ? "Genesis Holo" : missions.length >= 4 ? "Verified Agent" : "In Progress",
      squad: null, // hidden — no identity info on leaderboard
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

