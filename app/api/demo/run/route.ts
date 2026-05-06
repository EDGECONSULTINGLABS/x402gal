// Server-side demo runner: executes a full x402 round-trip on behalf of
// an agent so the dashboard can show the entire flow with one click.
// We call the chat endpoint with no payment (expect 402), then retry with
// a signed payload — exactly what an x402 client SDK would do in production.

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

  const agent = ledger().agents.get(agentId);
  if (!agent) return Response.json({ error: "unknown agent" }, { status: 404 });

  // Step 1: discover. In a real x402 client we'd actually fetch and parse 402.
  const requirement = buildRequirement(RESOURCE);
  if (agent.balanceDrops < requirement.amountDrops) {
    return Response.json(
      { error: "insufficient HYDRO; top up agent at the AMM first" },
      { status: 402 },
    );
  }

  // Step 2: sign + pay.
  const payload: PaymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: requirement.network,
    asset: "HYDRO",
    amountDrops: requirement.amountDrops,
    payer: agent.id,
    recipient: requirement.recipient,
    nonce: requirement.nonce,
    signature: "sig_" + Buffer.from(`${agent.id}|${requirement.nonce}`).toString("hex").slice(0, 48),
    routedVia: "wire-utl",
    sourceChain: agent.chain,
  };

  // Step 3: call internally. We invoke the route handler over HTTP so the
  // demo exercises the same code path as an external client would.
  const url = new URL(RESOURCE, req.nextUrl.origin);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": encodePayment(payload),
    },
    body: JSON.stringify({ prompt }),
  });
  const data = await res.json();
  return Response.json({ ok: res.ok, status: res.status, ...data, requirement });
}
