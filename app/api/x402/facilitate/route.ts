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
import { beginSettlement, recordPull, markRetired, markFailed, type Obligation } from "@/lib/obligations";
import { isPoolDepletionError, alertPoolDepleted } from "@/lib/xrplAmm";

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

  const auth = payload.payload?.authorization;
  const isEvmAuthPath = !payload.xrplSignedTx && !!auth?.v && !!auth?.r && !!auth?.s && !!auth?.nonce;
  // The obligation guard applies only when a real Fuji pull will happen — that is
  // the money-in/nothing-out locus. Native XRPL keeps its own InvoiceID replay guard.
  const guarded = isEvmAuthPath && isEvmTreasuryConfigured();

  const usdcMicros = parseInt(auth?.value ?? "0", 10);
  const hydroDrops = requirement.offsetHydroDrops ?? Math.max(1, Math.round(usdcMicros / 1_000));

  // ── Step 2: Status-aware idempotency guard ──────────────────────────────────
  // RETIRED → duplicate (return original receipt); RETIRING → in-flight; FAILED/PENDING
  // → allow as a retry. Claims the obligation (→ RETIRING) so concurrent dupes hold.
  let obligation: Obligation | undefined;
  if (guarded) {
    const begin = await beginSettlement(auth!.nonce!, {
      amountUsdcMicros: usdcMicros,
      hydroDrops,
      bindingId: payload.invoiceId ?? requirement.invoiceId,
    });
    if (!begin.proceed) {
      if (begin.reason === "ALREADY_RETIRED") {
        const o = begin.obligation!;
        // Idempotent replay: return the original receipt rather than re-settling.
        return Response.json({
          isValid: true,
          success: true,
          duplicate: true,
          usdcPulled: !!o.fujiTxHash,
          usdcTxHash: o.fujiTxHash ?? null,
          txHash: o.mintTxHash ?? null,
          retirementTxHash: o.retireTxHash ?? null,
          network: "xrpl",
          simulated: false,
        });
      }
      if (begin.reason === "IN_FLIGHT") {
        return Response.json(
          { isValid: true, success: false, errorReason: "DUPLICATE_IN_FLIGHT: a settlement for this authorization is already in progress", network: "xrpl" },
          { status: 409 },
        );
      }
      // GUARD_UNAVAILABLE — fail-closed: cannot confirm idempotency, refuse to proceed.
      return Response.json(
        { isValid: true, success: false, errorReason: "SETTLEMENT_GUARD_UNAVAILABLE: cannot confirm idempotency, refusing to proceed", network: "xrpl" },
        { status: 503 },
      );
    }
    obligation = begin.obligation;
  }

  // ── Step 3: Pull USDC to EVM treasury (skip if already pulled — nonce is spent) ──
  let usdcPull: { success: boolean; skipped?: boolean; txHash?: string; explorer?: string; error?: string } =
    { success: true, skipped: true };

  if (obligation?.fujiTxHash) {
    // Resume path: the pull already succeeded on a prior attempt. NEVER re-pull —
    // the ERC-3009 nonce is burned on-chain and receiveWithAuthorization would revert.
    usdcPull = { success: true, skipped: false, txHash: obligation.fujiTxHash };
  } else if (isEvmTreasuryConfigured() && auth?.v && auth?.r && auth?.s) {
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
      // Pull failed — nonce not burned. Mark FAILED so it is retryable from the start.
      if (obligation) await markFailed(obligation, `USDC pull failed: ${pullResult.error}`);
      return Response.json(
        { isValid: true, success: false, errorReason: `USDC pull failed: ${pullResult.error}`, network: "xrpl" },
        { status: 500 },
      );
    }
    usdcPull = pullResult;
    // Persist the Fuji hash NOW so any later retry resumes from the XRPL leg only.
    if (obligation && pullResult.txHash) await recordPull(obligation, pullResult.txHash);
  }

  // ── Step 4: Settle on XRPL ──────────────────────────────────────────────────
  const settleResult = await xrplSettle(payload, requirement);

  if (!settleResult.success) {
    // The desync case: USDC pulled (recorded above) but XRPL retire failed. The
    // obligation is now FAILED with fujiTxHash set — recorded and resumable, never dropped.
    const reason = settleResult.errorReason ?? "XRPL settle failed";
    if (isPoolDepletionError(reason)) alertPoolDepleted("facilitate", reason);
    if (obligation) await markFailed(obligation, reason);
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

  // Success — finalize the obligation as RETIRED with both XRPL hashes.
  if (obligation) {
    await markRetired(obligation, {
      mintTxHash: settleResult.txHash ?? "",
      retireTxHash: settleResult.retirementTxHash ?? "",
    });
  }

  // ── Step 5: Record in 402GAL batch ledger ───────────────────────────────────
  // Accumulate into the same batch pipeline as the internal x402 flow so
  // the dashboard settlement stream reflects externally-facilitated payments.
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
    paymentTxHash: settleResult.paymentTxHash ?? null,
    network: "xrpl",
    simulated: settleResult.simulated ?? false,
    explorerPayment: settleResult.paymentTxHash && !settleResult.simulated
      ? `https://testnet.xrpscan.com/tx/${settleResult.paymentTxHash}`
      : null,
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
    supportedNetworks: ["xrpl", "avalanche-fuji"],
    supportedSchemes: ["exact"],
    supportedAssets: ["USDC"],
    settlementHops: ["payment", "swap", "retire"],
    retirementAsset: "HYD",
    retirementRegistry: "XRPL",
    description:
      "Dual-rail x402 facilitator. XRPL native: pre-signed Payment tx settlement + HydroCoin retirement. Avalanche Fuji: ERC-3009 receiveWithAuthorization.",
    docs: "https://github.com/your-org/x402gal",
  });
}
