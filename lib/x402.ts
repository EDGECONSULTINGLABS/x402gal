// x402 facilitator helpers.
// We follow the v1 "exact" scheme as described at https://www.x402.org/
// and https://github.com/coinbase/x402: the resource server returns 402 with
// a JSON body listing accepted PaymentRequirements; the client retries with
// an `X-PAYMENT` header containing a base64-encoded payment payload.
// Settlement is direct to XRPL — no intermediate layer.

import { PaymentPayload, PaymentRequirement, FootprintBlock } from "./types";
import {
  FACILITATOR_URL,
  RESOURCE_DEFAULTS,
  TREASURY_ADDRESS,
  litersToDrops,
} from "./constants";
import { calculateFootprint } from "./footprint";
import { ledger } from "./ledger";
import { dropsToUsdcMicros } from "./amm";
import { verifyOnChain } from "./chainVerifier";

export interface RequirementOpts {
  tokens_in?: number;
  tokens_out?: number;
  mode?: "site" | "source" | "lifecycle";
}

export function buildRequirement(
  resource: string,
  opts: RequirementOpts = {},
): PaymentRequirement {
  const meta = RESOURCE_DEFAULTS[resource];
  if (!meta) throw new Error(`Unknown resource ${resource}`);

  const result = calculateFootprint({
    tokens_in: opts.tokens_in ?? meta.tokens_in_default,
    tokens_out: opts.tokens_out ?? meta.tokens_out_default,
    model_tier: meta.model_tier,
    infra_tier: meta.infra_tier,
    mode: opts.mode ?? "site",
    e_overhead_kwh: meta.e_overhead_kwh,
  });

  const offsetHydroDrops = Math.max(1, litersToDrops(result.water_l));
  const amountUsdc = dropsToUsdcMicros(offsetHydroDrops);

  const footprint: FootprintBlock = {
    mode: result.mode,
    water_l: result.water_l,
    water_ml: result.water_ml,
    inputs: result.inputs,
    methodology: result.methodology,
    uncertainty: result.uncertainty,
  };

  return {
    x402Version: 1,
    scheme: "exact",
    network: "xrpl",
    asset: "USDC",
    amountUsdc,
    offsetHydroDrops,
    estimatedLiters: result.water_l,
    estimatedMl: result.water_ml,
    recipient: TREASURY_ADDRESS,
    resource,
    description: `402GAL water-offset for ${meta.description}`,
    nonce: cryptoNonce(),
    expiresAt: Date.now() + 60_000,
    facilitator: FACILITATOR_URL,
    footprint,
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
    if (parsed.asset !== "USDC") return null;
    if (!parsed.sourceChain) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
}

export async function verifyPayment(
  req: PaymentRequirement,
  payload: PaymentPayload,
): Promise<VerifyResult> {
  if (payload.recipient !== req.recipient) return { ok: false, reason: "recipient mismatch" };
  if (payload.amountUsdc < req.amountUsdc) return { ok: false, reason: "underpayment" };
  if (!payload.signature || payload.signature.length < 16) {
    return { ok: false, reason: "invalid signature" };
  }
  const agent = ledger().agents.get(payload.payer);
  if (!agent) return { ok: false, reason: "unknown payer" };
  if (agent.balanceUsdc < payload.amountUsdc) {
    return { ok: false, reason: "insufficient USDC balance" };
  }
  // On-chain RPC verification — uses real RPC when env vars are set, ledger fallback otherwise
  const onChain = await verifyOnChain(req, payload);
  if (!onChain.ok) return { ok: false, reason: onChain.reason };
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
        "X-402GAL-Facilitator": FACILITATOR_URL,
        "X-402GAL-Settlement": "xrpl",
      },
    },
  );
}
