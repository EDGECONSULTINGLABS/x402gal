// HYDRO supply invariant — the unbacked-issuance guard.
//
// THE INVARIANT:
//   cumulative HYDRO ever placed INTO the AMM pool
//     ≤ cumulative MRV-verified-and-minted HYDRO
//
// Why it lives at deposit time, not swap time:
//   Swapping USDC→HYDRO only REMOVES HYDRO from the pool (and the acquired HYDRO
//   is immediately retired). The only way unbacked HYDRO can enter circulation is
//   by DEPOSITING freshly-issued HYDRO into the pool (AMMCreate seed or AMMDeposit
//   refill). So every HYDRO deposit must draw down a finite, verified ceiling.
//   Once the headroom is exhausted the pool can only be refilled after a new
//   verified mint event raises the ceiling.
//
// On testnet the ceiling is a configured constant standing in for the MRV-attested
// supply available to the demo. It is intentionally NOT auto-raised on purchase.
//
// Durable + fail-closed: the running total is kept in Upstash Redis so it survives
// serverless isolates and refills across processes. If Redis is configured but
// unreachable, a deposit reservation refuses to proceed (better to block a refill
// than to risk an unbacked one). An in-memory fallback covers local dev only.

import { Redis } from "@upstash/redis";

export const HYDRO_DROPLETS_PER_UNIT = 1_000_000;

// Default testnet ceiling: 1,000,000 HYDRO units = 1e12 droplets. Stands in for
// the MRV-verified supply available for the public testnet demo. Override per-deploy
// with HYDRO_VERIFIED_CEILING_DROPLETS (raised only by a real verified mint event).
const DEFAULT_CEILING_DROPLETS = 1_000_000 * HYDRO_DROPLETS_PER_UNIT;

const CUMULATIVE_KEY = "x402:hydro:pool_deposited_drops";

export function verifiedMintedCeilingDroplets(): number {
  // New name preferred; HYDRO_VERIFIED_CEILING_DROPS kept as a legacy alias so
  // existing deployments don't silently fall back to the default on rename.
  const env =
    process.env.HYDRO_VERIFIED_CEILING_DROPLETS ?? process.env.HYDRO_VERIFIED_CEILING_DROPS;
  if (env === undefined || env === "") return DEFAULT_CEILING_DROPLETS;
  const n = Number(env);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid HYDRO_VERIFIED_CEILING_DROPLETS: ${env}`);
  }
  return Math.floor(n);
}

export interface CeilingCheck {
  ok: boolean;
  /** Cumulative deposited total AFTER applying `additionalDroplets` (if it were allowed). */
  cumulativeAfter: number;
  ceiling: number;
  /** Remaining headroom BEFORE this deposit (ceiling − current cumulative). */
  remaining: number;
  reason?: "CEILING_EXCEEDED" | "NEGATIVE_DEPOSIT" | "GUARD_UNAVAILABLE";
}

/**
 * Pure invariant check — the heart of the guard. No I/O, fully deterministic,
 * Level-1 unit-testable. Returns ok=false (never throws) so callers decide policy.
 */
export function checkCeiling(
  cumulativeDepositedDroplets: number,
  additionalDroplets: number,
  ceilingDroplets: number,
): CeilingCheck {
  const remaining = ceilingDroplets - cumulativeDepositedDroplets;
  if (!Number.isFinite(additionalDroplets) || additionalDroplets < 0) {
    return { ok: false, cumulativeAfter: cumulativeDepositedDroplets, ceiling: ceilingDroplets, remaining, reason: "NEGATIVE_DEPOSIT" };
  }
  const after = cumulativeDepositedDroplets + additionalDroplets;
  if (after > ceilingDroplets) {
    return { ok: false, cumulativeAfter: after, ceiling: ceilingDroplets, remaining, reason: "CEILING_EXCEEDED" };
  }
  return { ok: true, cumulativeAfter: after, ceiling: ceilingDroplets, remaining: ceilingDroplets - after };
}

// ── Durable tracking ──────────────────────────────────────────────────────────

function redisConfigured(): boolean {
  return !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;
}

let _redis: ReturnType<typeof Redis.fromEnv> | null = null;
function getRedis(): ReturnType<typeof Redis.fromEnv> | null {
  if (!redisConfigured()) return null;
  if (!_redis) _redis = Redis.fromEnv();
  return _redis;
}

// In-memory fallback for local dev (single process only).
let memCumulative = 0;

export async function getCumulativeDeposited(): Promise<number> {
  const redis = getRedis();
  if (!redis) return memCumulative;
  const v = await redis.get<number>(CUMULATIVE_KEY);
  return typeof v === "number" ? v : Number(v ?? 0);
}

/**
 * Atomically reserve headroom for a HYDRO deposit into the pool. Call this BEFORE
 * submitting an AMMCreate/AMMDeposit that adds `additionalDroplets` of HYDRO.
 *
 * Atomicity: INCRBY first (single atomic op), then if the new total breaches the
 * ceiling, undo it and reject. Two concurrent reservers can never both slip past
 * the ceiling because each sees its own post-increment total.
 *
 * Fail-closed: if Redis is configured but the call throws, refuse the reservation.
 */
export async function reservePoolDeposit(additionalDroplets: number): Promise<CeilingCheck> {
  const ceiling = verifiedMintedCeilingDroplets();

  if (!Number.isFinite(additionalDroplets) || additionalDroplets < 0) {
    return { ok: false, cumulativeAfter: NaN, ceiling, remaining: NaN, reason: "NEGATIVE_DEPOSIT" };
  }

  const redis = getRedis();
  if (!redis) {
    const check = checkCeiling(memCumulative, additionalDroplets, ceiling);
    if (check.ok) memCumulative = check.cumulativeAfter;
    return check;
  }

  let after: number;
  try {
    after = await redis.incrby(CUMULATIVE_KEY, additionalDroplets);
  } catch {
    return { ok: false, cumulativeAfter: NaN, ceiling, remaining: NaN, reason: "GUARD_UNAVAILABLE" };
  }
  if (after > ceiling) {
    // Undo — this deposit would breach the verified ceiling.
    try {
      await redis.incrby(CUMULATIVE_KEY, -additionalDroplets);
    } catch {
      // Best-effort undo; the value is over-counted but that only makes the guard
      // STRICTER (never looser), which is the safe direction. Log for reconciliation.
      console.error(`[hydroSupply][UNDO_FAILED] over-counted ${additionalDroplets} droplets; manual reconcile`);
    }
    return { ok: false, cumulativeAfter: after, ceiling, remaining: ceiling - (after - additionalDroplets), reason: "CEILING_EXCEEDED" };
  }
  return { ok: true, cumulativeAfter: after, ceiling, remaining: ceiling - after };
}

/**
 * Release a previously-reserved deposit (e.g. the on-chain AMMDeposit failed after
 * the headroom was reserved). Keeps the cumulative total in sync with what actually
 * landed in the pool. Never drives the counter below zero.
 */
export async function releasePoolDeposit(droplets: number): Promise<void> {
  if (!Number.isFinite(droplets) || droplets <= 0) return;
  const redis = getRedis();
  if (!redis) {
    memCumulative = Math.max(0, memCumulative - droplets);
    return;
  }
  try {
    const after = await redis.incrby(CUMULATIVE_KEY, -droplets);
    if (after < 0) await redis.set(CUMULATIVE_KEY, 0);
  } catch {
    console.error(`[hydroSupply][RELEASE_FAILED] could not release ${droplets} droplets`);
  }
}

/** Headroom remaining before the verified ceiling (droplets). For monitoring. */
export async function remainingHeadroomDroplets(): Promise<number> {
  return verifiedMintedCeilingDroplets() - (await getCumulativeDeposited());
}
