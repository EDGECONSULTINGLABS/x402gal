// app/api/capture/route.ts
// Lead capture + backend-issued agent numbers for INFILTRATE.
// Ported from api/capture.js (PointJournal Vercel project).
//
// POST /api/capture
// On `register`: atomic INCR for agent number (idempotent on email),
// persist agent record, return { agentNumber, liveCount }.
// On mission / claim / mint events: update the agent record.
//
// Storage: Upstash Redis via @upstash/redis

import { Redis } from "@upstash/redis";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

const redis = Redis.fromEnv();
const SEED = Number(process.env.AGENT_NUMBER_SEED || 141);
const DEFAULT_EVENT_ID = process.env.EVENT_ID || "ethconf-nyc-2026";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function mapIntent(role: string) {
  return (
    ({ investor: "INVESTOR", builder: "BUILDER", operator: "CUSTOMER", curious: "OTHER" } as Record<string, string>)[role] || "OTHER"
  );
}

function validEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function liveCount(eventId: string) {
  const real = await redis.scard(`event:${eventId}:agents`);
  return SEED + (real || 0);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400, headers: CORS });
  }

  const eventId = (String(body.eventId || DEFAULT_EVENT_ID));
  const event = body.event as string;
  const email = body.email as string;

  if (!event) return Response.json({ ok: false, error: "missing event" }, { status: 400, headers: CORS });
  if (!validEmail(email)) return Response.json({ ok: false, error: "invalid email" }, { status: 400, headers: CORS });

  const agentKey = `event:${eventId}:agent:${email.toLowerCase()}`;
  const cohortKey = `event:${eventId}:agents`;
  const counterKey = `event:${eventId}:agent_count`;
  const ts = (body.ts as string) || new Date().toISOString();

  try {
    // -------- REGISTER --------
    if (event === "register") {
      const existing = await redis.hget(agentKey, "agentNumber");
      let agentNumber: number;
      if (existing != null) {
        agentNumber = Number(existing);
      } else {
        const raw = await redis.incr(counterKey);
        agentNumber = SEED + Number(raw);
        await redis.hset(agentKey, {
          eventId,
          agentNumber,
          name: (body.name as string) || "",
          email: email.toLowerCase(),
          company: (body.company as string) || "",
          squad: (body.squad as string) || "",
          role: (body.role as string) || "",
          intent: mapIntent(body.role as string),
          capturedAt: (body.capturedAt as string) || ts,
          registeredAt: ts,
        });
        await redis.sadd(cohortKey, email.toLowerCase());
      }
      return Response.json({ ok: true, agentNumber, liveCount: await liveCount(eventId) }, { headers: CORS });
    }

    // -------- MISSION COMPLETION --------
    if (event.startsWith("mission:")) {
      const missionId = event.slice("mission:".length);
      const patch: Record<string, unknown> = {
        [`mission_${missionId}_completed_at`]: ts,
        points: Number(body.points) || 0,
        missions_completed: ((body.missionsCompleted as string[]) || []).join(","),
      };
      const proof = body.socialProof as Record<string, string> | undefined;
      if (proof?.drop) patch.drop_proof_url = proof.drop;
      await redis.hset(agentKey, patch);
      return Response.json({ ok: true }, { headers: CORS });
    }

    // -------- CLAIM (wallet or email) --------
    if (event.startsWith("claim:")) {
      const claimType = event.slice("claim:".length);
      await redis.hset(agentKey, {
        wallet: (body.wallet as string) || "",
        claim_type: claimType,
        claimed_at: ts,
      });
      return Response.json({ ok: true }, { headers: CORS });
    }

    // -------- MINT RECEIPT --------
    if (event === "mint:testnet") {
      const nft = (body.nft as Record<string, string>) || {};
      await redis.hset(agentKey, {
        nft_id: nft.nftokenID || "",
        nft_tx: nft.txHash || "",
        nft_offer: nft.offerIndex || "",
        minted_at: ts,
      });
      return Response.json({ ok: true }, { headers: CORS });
    }

    return Response.json({ ok: true, note: "accepted, no-op" }, { headers: CORS });
  } catch (err) {
    console.error("[capture] error:", err);
    return Response.json({ ok: false, error: String((err as Error).message || err) }, { status: 500, headers: CORS });
  }
}
