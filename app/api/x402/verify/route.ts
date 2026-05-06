// Standalone x402 facilitator endpoint. A resource server can offload
// verification + settlement to this URL by POSTing { requirement, payload }.
// Mirrors the facilitator role described in the x402 spec.

import { NextRequest } from "next/server";
import { verifyPayment } from "@/lib/x402";
import { buildSettlement, routeAndRetire } from "@/lib/wire";
import { PaymentPayload, PaymentRequirement } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { requirement, payload } = (await req.json()) as {
    requirement: PaymentRequirement;
    payload: PaymentPayload;
  };
  const v = verifyPayment(requirement, payload);
  if (!v.ok) {
    return Response.json({ ok: false, reason: v.reason }, { status: 402 });
  }
  const route = await routeAndRetire(payload);
  const settlement = buildSettlement(payload, requirement.resource, route);
  return Response.json({ ok: true, settlement });
}
