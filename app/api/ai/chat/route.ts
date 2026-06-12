// Demo AI inference endpoint, gated by x402.
// First call without an X-PAYMENT header → 402 with payment requirements.
// Second call with valid payment → returns a synthetic completion plus the
// settlement record so the client can show the water it just offset.

import { NextRequest } from "next/server";
import { build402Response, buildRequirement, decodePayment, verifyPayment } from "@/lib/x402";
import { decodeEvmExactPayment, settleEvmExact } from "@/lib/x402evm";
import { addToBatch, drainBatch, ledger } from "@/lib/ledger";
import { settleBatch } from "@/lib/settlement";
import { BATCH_SIZE } from "@/lib/constants";

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
  let prompt = "";
  let tokens_in: number | undefined;
  let tokens_out: number | undefined;
  try {
    const body = await req.json();
    prompt = String(body?.prompt ?? "").slice(0, 500);
    if (Number.isFinite(body?.tokens_in)) tokens_in = Number(body.tokens_in);
    if (Number.isFinite(body?.tokens_out)) tokens_out = Number(body.tokens_out);
  } catch {
    /* empty body is allowed */
  }

  // Token counts shape the price; we surface the full methodology in 402.
  const requirement = buildRequirement(RESOURCE, { tokens_in, tokens_out });
  const rawPayment = req.headers.get("x-payment");

  // Fuji "exact" rail: standard x402 v1 payload carrying an ERC-3009
  // authorization. Settled on-chain immediately (USDC pulled to treasury),
  // then the water offset joins the same XRPL batch as every other call.
  const evmPay = decodeEvmExactPayment(rawPayment);
  if (evmPay) {
    const settled = await settleEvmExact(evmPay, requirement.amountUsdc);
    if (!settled.ok) {
      return new Response(
        JSON.stringify({ error: "payment invalid", reason: settled.reason }),
        { status: 402, headers: { "Content-Type": "application/json" } },
      );
    }

    const agentId = `agent_${evmPay.payer.slice(2, 10).toLowerCase()}`;
    const l = ledger();
    l.lastEvmSettlement = {
      network: "avalanche-fuji",
      txHash: settled.txHash!,
      explorer: settled.explorer!,
      amountUsdc: requirement.amountUsdc,
      at: Date.now(),
    };
    if (!l.agents.has(agentId)) {
      l.agents.set(agentId, {
        id: agentId,
        label: `Fuji ${evmPay.payer.slice(0, 8)}`,
        operator: "External x402 buyer",
        chain: "avalanche",
        walletAddress: evmPay.payer,
        balanceUsdc: 0,
        totalLitersOffset: 0,
        totalQueries: 0,
        joinedAt: Date.now(),
      });
    }

    const { shouldFlush } = addToBatch({
      agentId,
      resource: RESOURCE,
      amountUsdc: requirement.amountUsdc,
      offsetDrops: requirement.offsetHydroDrops,
      waterMl: requirement.estimatedMl,
      sourceChain: "avalanche",
      nonce: evmPay.auth.nonce,
      ts: Date.now(),
    });

    let flushedSettlement = null;
    if (shouldFlush) flushedSettlement = await settleBatch(drainBatch());

    const pending = ledger().pendingTotals;
    return new Response(
      JSON.stringify({
        completion: fakeCompletion(prompt || "your question"),
        pricing: {
          amountUsdc: requirement.amountUsdc,
          offsetHydroDrops: requirement.offsetHydroDrops,
          water_ml: requirement.estimatedMl,
          water_l: requirement.estimatedLiters,
          methodology_hash: requirement.footprint.methodology.methodology_hash,
        },
        evm_settlement: {
          network: "avalanche-fuji",
          txHash: settled.txHash,
          explorer: settled.explorer,
        },
        batch: {
          size_target: BATCH_SIZE,
          pending_calls: pending.calls,
          pending_usdc: pending.usdc,
          pending_offset_drops: pending.offsetDrops,
          pending_water_ml: pending.waterMl,
          flushed: flushedSettlement?.id ?? null,
        },
        settlement: flushedSettlement,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT-RESPONSE": Buffer.from(
            JSON.stringify({
              success: true,
              network: "avalanche-fuji",
              transaction: settled.txHash,
              payer: evmPay.payer,
            }),
          ).toString("base64"),
        },
      },
    );
  }

  const payload = decodePayment(rawPayment);

  if (!payload) return build402Response(requirement);

  const verify = await verifyPayment(requirement, payload);
  if (!verify.ok) {
    return new Response(
      JSON.stringify({ error: "payment invalid", reason: verify.reason }),
      { status: 402, headers: { "Content-Type": "application/json" } },
    );
  }

  // Add to the pending batch instead of routing immediately. Per-call
  // settlements would be ~18 drops each (illegible on screen); we batch up
  // to BATCH_SIZE calls and emit one human-visible XRPL retirement.
  const { shouldFlush } = addToBatch({
    agentId: payload.payer,
    resource: RESOURCE,
    amountUsdc: payload.amountUsdc,
    offsetDrops: payload.offsetHydroDrops,
    waterMl: requirement.estimatedMl,
    sourceChain: payload.sourceChain,
    nonce: payload.nonce,
    ts: Date.now(),
  });

  let flushedSettlement = null;
  if (shouldFlush) {
    flushedSettlement = await settleBatch(drainBatch());
  }

  const pending = ledger().pendingTotals;
  return new Response(
    JSON.stringify({
      completion: fakeCompletion(prompt || "your question"),
      pricing: {
        amountUsdc: payload.amountUsdc,
        offsetHydroDrops: payload.offsetHydroDrops,
        water_ml: requirement.estimatedMl,
        water_l: requirement.estimatedLiters,
        methodology_hash: requirement.footprint.methodology.methodology_hash,
      },
      batch: {
        size_target: BATCH_SIZE,
        pending_calls: pending.calls,
        pending_usdc: pending.usdc,
        pending_offset_drops: pending.offsetDrops,
        pending_water_ml: pending.waterMl,
        flushed: flushedSettlement?.id ?? null,
      },
      settlement: flushedSettlement, // null on most calls; populated on flush
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT-RESPONSE": Buffer.from(
          JSON.stringify({
            accepted: true,
            water_ml: requirement.estimatedMl,
            batch_flushed: flushedSettlement?.settlementHash ?? null,
          }),
        ).toString("base64"),
      },
    },
  );
}
