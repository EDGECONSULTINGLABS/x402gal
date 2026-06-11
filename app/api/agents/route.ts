import { NextRequest } from "next/server";
import { ledger } from "@/lib/ledger";
import { Chain } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ agents: Array.from(ledger().agents.values()) });
}

// Register a connected-wallet agent (or top up an existing one) so it can
// pay x402 requirements from the in-memory ledger. Used by AgentSessionPanel.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const agentId = typeof body?.agentId === "string" ? body.agentId.slice(0, 64) : "";
  if (!agentId.startsWith("agent_")) {
    return Response.json({ error: "agentId required (agent_*)" }, { status: 400 });
  }

  const chain = (body?.chain ?? "base") as Chain;
  const balanceUsdc = Math.max(0, Math.min(1_000_000_000, Number(body?.balanceUsdc ?? 100_000_000)));
  const walletAddress = typeof body?.walletAddress === "string" ? body.walletAddress.slice(0, 64) : "";

  const l = ledger();
  const existing = l.agents.get(agentId);
  if (existing) {
    // Top up only when the agent is running low — keeps repeat calls idempotent.
    if (existing.balanceUsdc < balanceUsdc) existing.balanceUsdc = balanceUsdc;
    return Response.json({ agent: existing, created: false });
  }

  const agent = {
    id: agentId,
    label: `Session ${agentId.slice(6, 14)}`,
    operator: "Connected wallet",
    chain,
    walletAddress: walletAddress || `${chain}_${agentId.slice(6)}`,
    balanceUsdc,
    totalLitersOffset: 0,
    totalQueries: 0,
    joinedAt: Date.now(),
  };
  l.agents.set(agentId, agent);
  return Response.json({ agent, created: true });
}
