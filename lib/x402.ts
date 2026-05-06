// x402 facilitator helpers.
// We follow the v1 "exact" scheme as described at https://www.x402.org/
// and https://github.com/coinbase/x402: the resource server returns 402 with
// a JSON body listing accepted PaymentRequirements; the client retries with
// an `X-PAYMENT` header containing a base64-encoded payment payload.

import { PaymentPayload, PaymentRequirement } from "./types";
import { DROPS_PER_HYDRO, FACILITATOR_URL, RESOURCE_COSTS, TREASURY_ADDRESS } from "./constants";
import { ledger } from "./ledger";

export function buildRequirement(resource: string): PaymentRequirement {
  const meta = RESOURCE_COSTS[resource];
  if (!meta) throw new Error(`Unknown resource ${resource}`);
  const amountDrops = Math.round(meta.liters * DROPS_PER_HYDRO);
  return {
    x402Version: 1,
    scheme: "exact",
    network: "wire-utl",
    asset: "HYDRO",
    amountDrops,
    estimatedLiters: meta.liters,
    recipient: TREASURY_ADDRESS,
    resource,
    description: `Meraxis water-offset for ${meta.description}`,
    nonce: cryptoNonce(),
    expiresAt: Date.now() + 60_000,
    facilitator: FACILITATOR_URL,
  };
}

export function cryptoNonce() {
  // Lightweight nonce; production would use crypto.randomBytes.
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function encodePayment(p: PaymentPayload): string {
  return Buffer.from(JSON.stringify(p)).toString("base64");
}

export function decodePayment(header: string | null): PaymentPayload | null {
  if (!header) return null;
  try {
    const json = Buffer.from(header, "base64").toString("utf8");
    const parsed = JSON.parse(json) as PaymentPayload;
    if (parsed.x402Version !== 1) return null;
    if (parsed.scheme !== "exact") return null;
    if (parsed.asset !== "HYDRO") return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export function verifyPayment(req: PaymentRequirement, payload: PaymentPayload): VerifyResult {
  if (payload.recipient !== req.recipient) return { ok: false, reason: "recipient mismatch" };
  if (payload.amountDrops < req.amountDrops) return { ok: false, reason: "underpayment" };
  if (!payload.signature || payload.signature.length < 16) {
    return { ok: false, reason: "invalid signature" };
  }
  const agent = ledger().agents.get(payload.payer);
  if (!agent) return { ok: false, reason: "unknown payer" };
  if (agent.balanceDrops < payload.amountDrops) {
    return { ok: false, reason: "insufficient HYDRO balance" };
  }
  return { ok: true };
}

export function build402Response(req: PaymentRequirement): Response {
  return new Response(
    JSON.stringify({
      x402Version: 1,
      error: "Payment Required",
      accepts: [req],
    }),
    {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "X-Meraxis-Facilitator": FACILITATOR_URL,
      },
    },
  );
}
