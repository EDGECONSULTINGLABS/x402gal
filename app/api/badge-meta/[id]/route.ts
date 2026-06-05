// app/api/badge-meta/[id]/route.ts
// NFT metadata endpoint for INFILTRATE badges (XLS-24 compatible).
// Returns JSON metadata for a given agent number.
//
// GET /api/badge-meta/152
// Returns: { name, description, image, attributes[] }

import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

const redis = Redis.fromEnv();
const DEFAULT_EVENT_ID = process.env.EVENT_ID || "ethconf-nyc-2026";
const IMAGE_BASE = process.env.BADGE_IMAGE_BASE || "https://www.x402gal.com/badge-image";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const agentNumber = params.id;
  const padded = String(agentNumber).padStart(4, "0");
  const eventId = DEFAULT_EVENT_ID;

  // Find agent record by scanning for matching agentNumber
  const members = await redis.smembers(`event:${eventId}:agents`);
  let agentData: Record<string, string> | null = null;

  for (const email of members) {
    const data = await redis.hgetall(`event:${eventId}:agent:${email}`) as Record<string, string> | null;
    if (data && String(data.agentNumber) === String(agentNumber)) {
      agentData = data;
      break;
    }
  }

  if (!agentData) {
    return Response.json(
      { error: "Agent not found", agentNumber },
      { status: 404, headers: CORS }
    );
  }

  const missions = (agentData.missions_completed || "").split(",").filter(Boolean);
  const points = Number(agentData.points) || 0;
  const holo = missions.length >= 6;
  const tier = holo ? "Genesis Holo" : "Verified Agent";
  const name = agentData.name || "Agent";

  const metadata = {
    name: `INFILTRATE Genesis Badge #${padded}`,
    description: `${name} — x402GAL field agent. ETHConf NYC 2026. ${tier}. ${points} points, ${missions.length}/6 missions.`,
    image: `${IMAGE_BASE}/${padded}${holo ? "-holo" : ""}.png`,
    external_url: `https://www.x402gal.com/infiltrateETHConf2026`,
    attributes: [
      { trait_type: "Tier", value: tier },
      { trait_type: "Event", value: "ETHConf NYC 2026" },
      { trait_type: "Points", value: String(points) },
      { trait_type: "Missions", value: `${missions.length}/6` },
      { trait_type: "Agent Number", value: padded },
      ...(agentData.squad ? [{ trait_type: "Squad", value: agentData.squad }] : []),
    ],
  };

  return Response.json(metadata, { headers: CORS });
}
