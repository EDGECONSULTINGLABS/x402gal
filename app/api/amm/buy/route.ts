// Wallet top-up endpoint: fund an agent's USDC balance. Agents pay for water
// offsets in USDC, so a top-up simply credits their micro-USDC balance.

import { NextRequest } from "next/server";
import { ledger } from "@/lib/ledger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { agentId, usdc } = await req.json();
  const usdcMicros = Math.round(Number(usdc) * 1_000_000);
  if (!Number.isFinite(usdcMicros) || usdcMicros <= 0) {
    return Response.json({ error: "invalid usdc" }, { status: 400 });
  }
  const agent = ledger().agents.get(agentId);
  if (!agent) {
    return Response.json({ error: "unknown agent" }, { status: 404 });
  }
  agent.balanceUsdc += usdcMicros;
  return Response.json({ ok: true, balanceUsdc: agent.balanceUsdc });
}
