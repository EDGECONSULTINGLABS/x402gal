// Demo AI inference endpoint, gated by x402.
// First call without an X-PAYMENT header → 402 with payment requirements.
// Second call with valid payment → returns a synthetic completion plus the
// settlement record so the client can show the water it just offset.

import { NextRequest } from "next/server";
import { build402Response, buildRequirement, decodePayment, verifyPayment } from "@/lib/x402";
import { buildSettlement, routeAndRetire } from "@/lib/wire";

export const runtime = "nodejs";

const RESOURCE = "/api/ai/chat";

// Tiny deterministic "model" for the demo. Real deployments would proxy a real LLM.
function fakeCompletion(prompt: string): string {
  const reflections = [
    "From a systems lens",
    "Considering the second-order effects",
    "If we model this as a feedback loop",
    "Treating this as an optimization over constraints",
  ];
  const r = reflections[prompt.length % reflections.length];
  return `${r}, the most defensible answer to "${prompt.slice(0, 80)}" is to scope the question, identify the binding constraint, and ship the smallest reversible change that tests it.`;
}

export async function POST(req: NextRequest) {
  const requirement = buildRequirement(RESOURCE);
  const payload = decodePayment(req.headers.get("x-payment"));

  if (!payload) return build402Response(requirement);

  const verify = verifyPayment(requirement, payload);
  if (!verify.ok) {
    return new Response(
      JSON.stringify({ error: "payment invalid", reason: verify.reason }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  const route = await routeAndRetire(payload);
  const settlement = buildSettlement(payload, RESOURCE, route);

  let prompt = "";
  try {
    const body = await req.json();
    prompt = String(body?.prompt ?? "").slice(0, 500);
  } catch {
    /* empty body is allowed */
  }

  return new Response(
    JSON.stringify({
      completion: fakeCompletion(prompt || "your question"),
      settlement,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT-RESPONSE": Buffer.from(JSON.stringify({ settlementId: settlement.id })).toString("base64"),
      },
    },
  );
}
