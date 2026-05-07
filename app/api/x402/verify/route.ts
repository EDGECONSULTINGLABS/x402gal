// Standalone x402 facilitator endpoint. A resource server can offload
// verification + settlement to this URL by POSTing { requirement, payload }.
// Mirrors the facilitator role described in the x402 spec.

import { NextRequest } from "next/server";
import { verifyPayment } from "@/lib/x402";
import { addToBatch, drainBatch } from "@/lib/ledger";
import { settleBatch } from "@/lib/wire";
import { PaymentPayload, PaymentRequirement } from "@/lib/types";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const { requirement, payload } = (await req.json()) as {
    requirement: PaymentRequirement;
    payload: PaymentPayload;
  };
  const v = verifyPayment(requirement, payload);
  if (!v.ok) {
    return Response.json({ ok: false, reason: v.reason }, { status: 402 });
  }
  const { shouldFlush } = addToBatch({
    agentId: payload.payer,
    resource: requirement.resource,
    amountDrops: payload.amountDrops,
    waterMl: requirement.estimatedMl,
    sourceChain: payload.sourceChain,
    nonce: payload.nonce,
    ts: Date.now(),
  });
  const settlement = shouldFlush ? await settleBatch(drainBatch()) : null;
  return Response.json({ ok: true, batched: true, settlement });
}
