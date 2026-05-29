/**
 * 402GAL XRPL Facilitator Endpoint
 *
 * POST /api/x402/facilitate
 *
 * This is the HTTP entry point for the x402 XRPL network adapter.
 * Any x402-client or x402-hono integration can point its facilitatorUrl here
 * and XRPL settlement is handled automatically.
 *
 * Request body:
 *   {
 *     requirement: X402Requirement,  // the 402 requirement from the resource server
 *     payload: X402Payload           // the payment payload from the agent
 *   }
 *
 * Response (200):
 *   {
 *     isValid: boolean,
 *     invalidReason?: string,
 *     success: boolean,
 *     txHash?: string,              // XRPL swap hop (issuer → treasury)
 *     retirementTxHash?: string,    // XRPL retirement hop (treasury → issuer = burn)
 *     network: "xrpl",
 *     simulated?: boolean           // true when running without XRPL env vars
 *   }
 *
 * Response (400):
 *   { error: "missing requirement or payload" }
 *
 * The settlement also accumulates into the 402GAL batch ledger so the
 * dashboard reflects the payment in the live settlement stream.
 */

import { NextRequest } from "next/server";
import { xrplVerify, xrplSettle, X402Requirement, X402Payload } from "@/lib/x402XrplAdapter";
import { pullUsdcToTreasury, isEvmTreasuryConfigured } from "@/lib/evmTreasury";
import { addToBatch, drainBatch } from "@/lib/ledger";
import { settleBatch } from "@/lib/settlement";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.requirement || !body?.payload) {
    return Response.json(
      { error: "missing requirement or payload" },
      { status: 400 },
    );
  }

  const requirement = body.requirement as X402Requirement;
  const payload = body.payload as X402Payload;

  // ── Step 1: Verify ──────────────────────────────────────────────────────────
  const verifyResult = await xrplVerify(payload, requirement);

  if (!verifyResult.isValid) {
    return Response.json(
      {
        isValid: false,
        invalidReason: verifyResult.invalidReason,
        success: false,
        network: "xrpl",
      },
      { status: 402 },
    );
  }

  // ── Step 2: Pull USDC to EVM treasury (if configured + auth has v/r/s) ──────
  const auth = payload.payload?.authorization;
  let usdcPull: { success: boolean; skipped?: boolean; txHash?: string; explorer?: string; error?: string } =
    { success: true, skipped: true };

  if (isEvmTreasuryConfigured() && auth?.v && auth?.r && auth?.s) {
    const pullResult = await pullUsdcToTreasury({
      from:        auth.from,
      to:          auth.to,
      value:       auth.value,
      validAfter:  auth.validAfter ?? "0",
      validBefore: auth.validBefore ?? "9999999999",
      nonce:       auth.nonce ?? "",
      v:           Number(auth.v),
      r:           auth.r,
      s:           auth.s,
    });
    if (!pullResult.success && !pullResult.skipped) {
      return Response.json(
        { isValid: true, success: false, errorReason: `USDC pull failed: ${pullResult.error}`, network: "xrpl" },
        { status: 500 },
      );
    }
    usdcPull = pullResult;
  }

  // ── Step 3: Settle on XRPL ──────────────────────────────────────────────────
  const settleResult = await xrplSettle(payload, requirement);

  if (!settleResult.success) {
    return Response.json(
      {
        isValid: true,
        success: false,
        errorReason: settleResult.errorReason,
        network: "xrpl",
      },
      { status: 500 },
    );
  }

  // ── Step 4: Record in 402GAL batch ledger ───────────────────────────────────
  // Accumulate into the same batch pipeline as the internal x402 flow so
  // the dashboard settlement stream reflects externally-facilitated payments.
  const usdcMicros = parseInt(payload.payload?.authorization?.value ?? "0", 10);
  const hydroDrops = requirement.offsetHydroDrops ?? Math.max(1, Math.round(usdcMicros / 1_000));
  const estimatedMl = requirement.estimatedMl ?? 0;

  const { shouldFlush } = addToBatch({
    agentId: payload.payload?.authorization?.from ?? "external_agent",
    resource: requirement.resource,
    amountUsdc: usdcMicros,
    offsetDrops: hydroDrops,
    waterMl: estimatedMl,
    sourceChain: "xrpl",
    nonce: payload.payload?.authorization?.nonce ?? "",
    ts: Date.now(),
  });

  const batchSettlement = shouldFlush ? await settleBatch(drainBatch()) : null;

  // ── Step 5: Return full receipt ─────────────────────────────────────────────
  return Response.json({
    isValid: true,
    success: true,
    // ─ Avalanche USDC pull
    usdcPulled: !usdcPull.skipped,
    usdcTxHash: usdcPull.txHash ?? null,
    explorerUsdc: usdcPull.explorer ?? null,
    // ─ XRPL settlement
    txHash: settleResult.txHash,
    retirementTxHash: settleResult.retirementTxHash,
    network: "xrpl",
    simulated: settleResult.simulated ?? false,
    explorerSwap: settleResult.txHash && !settleResult.simulated
      ? `https://testnet.xrpscan.com/tx/${settleResult.txHash}`
      : null,
    explorerRetirement: settleResult.retirementTxHash && !settleResult.simulated
      ? `https://testnet.xrpscan.com/tx/${settleResult.retirementTxHash}`
      : null,
    // ─ Batch state
    batchSettlement,
  });
}

// ── GET — capability discovery ────────────────────────────────────────────────
// x402 clients can GET this endpoint to discover what networks are supported.

export async function GET() {
  return Response.json({
    facilitator: "402GAL XRPL Facilitator",
    version: 1,
    supportedNetworks: ["xrpl"],
    supportedSchemes: ["exact"],
    supportedAssets: ["USDC"],
    settlementHops: ["swap", "retire"],
    retirementAsset: "HYD",
    retirementRegistry: "XRPL",
    description:
      "First XRPL network adapter for x402. Settles USDC micro-payments as HydroCoin water-restoration credits on the XRP Ledger.",
    docs: "https://github.com/your-org/x402gal",
  });
}
