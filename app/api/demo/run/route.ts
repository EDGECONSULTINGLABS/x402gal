// Server-side demo runner: executes one or more full x402 round-trips on
// behalf of an agent so the dashboard can show the entire flow with one
// click. With `count > 1` (default 1) it fires repeated paid calls so the
// user can drive the pending batch toward an XRPL settlement flush in real time.

import { NextRequest } from "next/server";
import { buildRequirement, encodePayment } from "@/lib/x402";
import { ledger } from "@/lib/ledger";
import { PaymentPayload } from "@/lib/types";

export const runtime = "nodejs";

const RESOURCE = "/api/ai/chat";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const agentId = body.agentId ?? "agent_meridian_v3";
  const prompt = body.prompt ?? "How should I price autonomous AI inference?";
  const count = Math.max(1, Math.min(500, Number(body.count ?? 1)));
  const tokens_in = Number.isFinite(body.tokens_in) ? Number(body.tokens_in) : undefined;
  const tokens_out = Number.isFinite(body.tokens_out) ? Number(body.tokens_out) : undefined;

  const agent = ledger().agents.get(agentId);
  if (!agent) return Response.json({ error: "unknown agent" }, { status: 404 });

  const url = new URL(RESOURCE, req.nextUrl.origin);
  const results: Array<{ status: number; pricing: unknown; batch: unknown; settlement: unknown }> = [];
  let completion = "";
  let lastRequirement: ReturnType<typeof buildRequirement> | null = null;

  for (let i = 0; i < count; i++) {
    // Each call gets a fresh requirement (new nonce + identical pricing).
    const requirement = buildRequirement(RESOURCE, { tokens_in, tokens_out });
    lastRequirement = requirement;

    if (agent.balanceUsdc < requirement.amountUsdc) {
      return Response.json(
        { error: "insufficient USDC; top up the agent wallet first", at: i },
        { status: 402 },
      );
    }

    const payload: PaymentPayload = {
      x402Version: 1,
      scheme: "exact",
      network: requirement.network,
      asset: "USDC",
      amountUsdc: requirement.amountUsdc,
      offsetHydroDroplets: requirement.offsetHydroDroplets,
      payer: agent.id,
      recipient: requirement.recipient,
      nonce: requirement.nonce,
      signature:
        "sig_" + Buffer.from(`${agent.id}|${requirement.nonce}`).toString("hex").slice(0, 48),
      sourceChain: agent.chain,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-PAYMENT": encodePayment(payload) },
      body: JSON.stringify({ prompt, tokens_in, tokens_out }),
    });
    const data = await res.json();
    if (data.completion) completion = data.completion;
    results.push({
      status: res.status,
      pricing: data.pricing,
      batch: data.batch,
      settlement: data.settlement,
    });
  }

  const flushed = results.map((r) => r.settlement).filter(Boolean);
  return Response.json({
    ok: true,
    count,
    completion,
    requirement: lastRequirement,
    pending: ledger().pendingTotals,
    flushed_settlements: flushed,
    last_batch_state: results[results.length - 1]?.batch,
  });
}
