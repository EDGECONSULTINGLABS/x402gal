/**
 * Cross-chain settlement retry worker.
 *
 * GET /api/x402/retry-obligations  (invoked by Vercel Cron)
 *
 * Drains FAILED settlement obligations — the money-in/nothing-out desync where
 * the Fuji USDC pull succeeded but the XRPL mint+retire failed. For each one it
 * RESUMES FROM THE XRPL LEG ONLY: the ERC-3009 nonce is already burned on-chain,
 * so the pull is never re-run; the persisted `fujiTxHash` proves it happened.
 *
 * Idempotency / safety:
 *   - Claims each obligation via beginSettlement(), which transitions FAILED →
 *     RETIRING atomically. If a live request is already RETIRING the same nonce,
 *     the worker sees IN_FLIGHT and skips it — a cron run can't collide with a
 *     live retry (same status-aware discipline as the request path).
 *   - Caps attempts at MAX_ATTEMPTS; beyond that the obligation is dead-lettered
 *     (status DEAD) with an alert log rather than retried forever.
 *   - Only obligations with a persisted `fujiTxHash` are resumable; FAILED records
 *     without one (the pull never succeeded — no money moved) are left untouched.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. If CRON_SECRET is unset
 * the endpoint refuses to run (this triggers real on-chain XRPL transactions).
 */

import { NextRequest } from "next/server";
import {
  listFailed,
  beginSettlement,
  markRetired,
  markFailed,
  markDead,
  MAX_ATTEMPTS,
} from "@/lib/obligations";
import { swapAndRetireHydro } from "@/lib/xrplHydro";
import { isXrplConfigured } from "@/lib/xrplClient";
import { isPoolDepletionError, alertPoolDepleted } from "@/lib/xrplAmm";

export const runtime = "nodejs";
// Never cache a worker run.
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return Response.json(
      { error: "unauthorized — set CRON_SECRET and send Authorization: Bearer <secret>" },
      { status: 401 },
    );
  }

  if (!isXrplConfigured()) {
    return Response.json(
      { error: "XRPL not configured — cannot run settlement retries", network: "xrpl" },
      { status: 503 },
    );
  }

  const failed = await listFailed();

  let retired = 0;
  let deadLettered = 0;
  let skipped = 0;
  let failedAgain = 0;
  const results: Array<{ nonce: string; outcome: string; detail?: string }> = [];

  for (const candidate of failed) {
    // Only the resumable desync case: pull succeeded (fujiTxHash present), retire didn't.
    if (!candidate.fujiTxHash) {
      skipped++;
      results.push({ nonce: candidate.nonce, outcome: "skipped_no_fuji_hash" });
      continue;
    }

    // Budget check on the snapshot before claiming — dead-letter exhausted ones.
    if (candidate.attempts >= MAX_ATTEMPTS) {
      await markDead(candidate, `exceeded MAX_ATTEMPTS=${MAX_ATTEMPTS}`);
      deadLettered++;
      results.push({ nonce: candidate.nonce, outcome: "dead_lettered" });
      continue;
    }

    // Claim atomically (FAILED → RETIRING). IN_FLIGHT means a live retry owns it.
    const begin = await beginSettlement(candidate.nonce, {
      amountUsdcMicros: candidate.amountUsdcMicros,
      hydroDroplets: candidate.hydroDroplets,
      bindingId: candidate.bindingId,
    });
    if (!begin.proceed || !begin.obligation) {
      skipped++;
      results.push({ nonce: candidate.nonce, outcome: `skipped_${begin.reason ?? "unclaimable"}` });
      continue;
    }

    const o = begin.obligation;
    try {
      const { swapHash, retireHash } = await swapAndRetireHydro(o.amountUsdcMicros, o.hydroDroplets);
      await markRetired(o, { mintTxHash: swapHash, retireTxHash: retireHash });
      retired++;
      results.push({ nonce: o.nonce, outcome: "retired" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Pool depletion is an operational condition (needs a refill), not a transient
      // fault — surface it loudly so it is fixed before the budget dead-letters it.
      if (isPoolDepletionError(err)) alertPoolDepleted("retry-worker", msg);
      // o.attempts was incremented by the claim; dead-letter if this was the last shot.
      if (o.attempts >= MAX_ATTEMPTS) {
        await markDead(o, `retry failed (final): ${msg}`);
        deadLettered++;
        results.push({ nonce: o.nonce, outcome: "dead_lettered", detail: msg });
      } else {
        await markFailed(o, `retry failed: ${msg}`);
        failedAgain++;
        results.push({ nonce: o.nonce, outcome: "failed_again", detail: msg });
      }
    }
  }

  return Response.json({
    scanned: failed.length,
    retired,
    failedAgain,
    deadLettered,
    skipped,
    results,
    ts: Date.now(),
  });
}
