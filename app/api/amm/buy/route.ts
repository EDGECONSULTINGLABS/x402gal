// AMM buy endpoint: top up an agent's HYDRO balance with USDC.

import { NextRequest } from "next/server";
import { executeBuyHydro } from "@/lib/amm";
import { ledger } from "@/lib/ledger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { agentId, usdc } = await req.json();
  const usdcMicros = Math.round(Number(usdc) * 1_000_000);
  if (!Number.isFinite(usdcMicros) || usdcMicros <= 0) {
    return Response.json({ error: "invalid usdc" }, { status: 400 });
  }
  if (!ledger().agents.has(agentId)) {
    return Response.json({ error: "unknown agent" }, { status: 404 });
  }
  const quote = executeBuyHydro(usdcMicros, agentId);
  return Response.json({ ok: true, quote });
}
