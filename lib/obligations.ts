// Cross-chain settlement obligation store.
//
// Tracks the lifecycle of a Fuji-payment → XRPL-retirement obligation so that
// a payment can never be silently dropped, double-minted, or blocked from a
// legitimate retry. Backed by Upstash Redis (survives serverless isolates),
// with an in-memory Map fallback for local dev when Redis env vars are absent.
//
// Why a status, not a boolean:
//   The ERC-3009 nonce is a perfect idempotency key, BUT once Step 2 (the USDC
//   pull) succeeds the nonce is burned on-chain forever. So a FAILED obligation
//   must be retryable from Step 3 (the XRPL mint+retire) only — never from the
//   pull, which would revert on the consumed nonce. A plain "nonce seen → reject"
//   guard would reject those retries. Hence the guard is STATUS-AWARE:
//     RETIRED  → reject  (true double-spend attempt)
//     RETIRING → hold    (a concurrent duplicate is in flight)
//     FAILED   → allow   (this is a retry, resume at the XRPL leg)
//     PENDING  → allow   (pull recorded, retirement not yet done)
//
// Fail-closed: if Redis is configured but unreachable, beginSettlement() refuses
// to proceed rather than risk a double-mint under load — mirroring the replay
// guard in x402XrplAdapter.ts.

import { Redis } from "@upstash/redis";

export type ObligationStatus = "PENDING" | "RETIRING" | "RETIRED" | "FAILED" | "DEAD";

// Retry worker dead-letters an obligation after this many total attempts.
export const MAX_ATTEMPTS = 5;

export interface Obligation {
  /** ERC-3009 authorization nonce — the idempotency key. */
  nonce: string;
  /** Deterministic quote binding id (optional today; required for the 0x unified receipt). */
  bindingId?: string;
  /** Avalanche Fuji tx hash from the USDC pull. Presence means Step 2 is done — never re-pull. */
  fujiTxHash?: string;
  amountUsdcMicros: number;
  hydroDroplets: number;
  status: ObligationStatus;
  /** XRPL mint hop (issuer → treasury). */
  mintTxHash?: string;
  /** XRPL retirement hop (treasury → issuer = burn). */
  retireTxHash?: string;
  lastError?: string;
  attempts: number;
  createdAt: number;
  updatedAt: number;
}

export interface BeginResult {
  proceed: boolean;
  reason?: "ALREADY_RETIRED" | "IN_FLIGHT" | "GUARD_UNAVAILABLE";
  obligation?: Obligation;
}

// Obligations outlive the replay guard window: a retry worker may pick a FAILED
// obligation up minutes or hours later. 24h is generous for testnet.
const OBLIGATION_TTL_S = 86_400;
const OBLIGATION_KEY_PREFIX = "x402:obligation:";

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
const memStore = new Map<string, Obligation>();

function keyFor(nonce: string): string {
  return `${OBLIGATION_KEY_PREFIX}${nonce}`;
}

async function readObligation(nonce: string): Promise<Obligation | null> {
  const redis = getRedis();
  if (!redis) {
    return memStore.get(nonce) ?? null;
  }
  // Upstash auto-deserializes JSON values stored as objects.
  const val = await redis.get<Obligation>(keyFor(nonce));
  return val ?? null;
}

async function writeObligation(o: Obligation): Promise<void> {
  o.updatedAt = Date.now();
  const redis = getRedis();
  if (!redis) {
    memStore.set(o.nonce, o);
    return;
  }
  await redis.setex(keyFor(o.nonce), OBLIGATION_TTL_S, o);
}

// Atomic create: returns true only if THIS caller established the obligation.
// Uses SET NX so exactly one of two concurrent first-requests wins the claim and
// the loser sees the established obligation (IN_FLIGHT) instead of double-pulling.
async function createIfAbsent(o: Obligation): Promise<boolean> {
  const redis = getRedis();
  if (!redis) {
    if (memStore.has(o.nonce)) return false;
    memStore.set(o.nonce, o);
    return true;
  }
  const res = await redis.set(keyFor(o.nonce), o, { nx: true, ex: OBLIGATION_TTL_S });
  return res === "OK";
}

/**
 * Status-aware idempotency guard. Call BEFORE doing any settlement work.
 *
 * Transitions the obligation to RETIRING (claiming it) when it is safe to
 * proceed, so a concurrent duplicate request sees IN_FLIGHT and holds off.
 *
 * Returns the (possibly pre-existing) obligation so the caller can inspect
 * `fujiTxHash` to decide whether the USDC pull has already happened and must
 * be skipped (resume from the XRPL leg).
 */
export async function beginSettlement(
  nonce: string,
  init: { amountUsdcMicros: number; hydroDroplets: number; bindingId?: string },
): Promise<BeginResult> {
  let existing: Obligation | null;
  try {
    existing = await readObligation(nonce);
  } catch {
    // Fail-closed: cannot confirm uniqueness → refuse rather than risk double-mint.
    return { proceed: false, reason: "GUARD_UNAVAILABLE" };
  }

  const now = Date.now();

  if (!existing) {
    const obligation: Obligation = {
      nonce,
      bindingId: init.bindingId,
      amountUsdcMicros: init.amountUsdcMicros,
      hydroDroplets: init.hydroDroplets,
      status: "RETIRING",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
    };
    let created: boolean;
    try {
      created = await createIfAbsent(obligation);
    } catch {
      return { proceed: false, reason: "GUARD_UNAVAILABLE" };
    }
    if (created) return { proceed: true, obligation };
    // Lost the create race — a concurrent first-request claimed this nonce. Read
    // the winner and hold off (or return its receipt if it already completed).
    let winner: Obligation | null = null;
    try {
      winner = await readObligation(nonce);
    } catch {
      return { proceed: false, reason: "GUARD_UNAVAILABLE" };
    }
    if (winner?.status === "RETIRED") {
      return { proceed: false, reason: "ALREADY_RETIRED", obligation: winner };
    }
    return { proceed: false, reason: "IN_FLIGHT", obligation: winner ?? undefined };
  }

  switch (existing.status) {
    case "RETIRED":
      return { proceed: false, reason: "ALREADY_RETIRED", obligation: existing };
    case "RETIRING":
      return { proceed: false, reason: "IN_FLIGHT", obligation: existing };
    case "FAILED":
    case "PENDING": {
      // Legitimate retry — claim it and resume.
      existing.status = "RETIRING";
      existing.attempts += 1;
      if (init.bindingId && !existing.bindingId) existing.bindingId = init.bindingId;
      try {
        await writeObligation(existing);
      } catch {
        return { proceed: false, reason: "GUARD_UNAVAILABLE" };
      }
      return { proceed: true, obligation: existing };
    }
    default:
      return { proceed: false, reason: "GUARD_UNAVAILABLE", obligation: existing };
  }
}

/**
 * Record that the Fuji USDC pull succeeded. Persisting the tx hash is what makes
 * the obligation resumable from Step 3: a later retry sees `fujiTxHash` set and
 * MUST NOT attempt the pull again (the nonce is spent on-chain).
 */
export async function recordPull(o: Obligation, fujiTxHash: string): Promise<void> {
  o.fujiTxHash = fujiTxHash;
  // Stay in RETIRING; the XRPL leg has not completed yet.
  try {
    await writeObligation(o);
  } catch {
    // Non-fatal here: the obligation is still RETIRING in the in-flight request.
    // markFailed/markRetired below carry the durable + log-fallback guarantee.
    logObligation("RECORD_PULL_PERSIST_FAILED", o);
  }
}

/** Finalize on success: status RETIRED, record both XRPL hashes. */
export async function markRetired(
  o: Obligation,
  hashes: { mintTxHash: string; retireTxHash: string },
): Promise<void> {
  o.status = "RETIRED";
  o.mintTxHash = hashes.mintTxHash;
  o.retireTxHash = hashes.retireTxHash;
  o.lastError = undefined;
  try {
    await writeObligation(o);
  } catch {
    logObligation("MARK_RETIRED_PERSIST_FAILED", o);
  }
}

/**
 * Finalize on failure: status FAILED. This is the "never silently drop" guarantee,
 * so it MUST NOT depend on the durable store being up. If the Redis write throws
 * (fail-closed Redis under load — the exact scenario we hardened for), we log the
 * full obligation to stderr so it is recoverable from logs.
 */
export async function markFailed(o: Obligation, error: string): Promise<void> {
  o.status = "FAILED";
  o.lastError = error;
  try {
    await writeObligation(o);
  } catch {
    logObligation("OBLIGATION_WRITE_FAILED", o);
  }
}

function logObligation(marker: string, o: Obligation): void {
  // Single-line, grep-friendly. Contains the nonce + Fuji hash so a dropped
  // payment is always recoverable from logs even if the durable write failed.
  console.error(
    `[obligation][${marker}] ${JSON.stringify({
      nonce: o.nonce,
      fujiTxHash: o.fujiTxHash ?? null,
      amountUsdcMicros: o.amountUsdcMicros,
      hydroDroplets: o.hydroDroplets,
      status: o.status,
      attempts: o.attempts,
      lastError: o.lastError ?? null,
    })}`,
  );
}

/**
 * Dead-letter an obligation that has exhausted its retry budget. Always emits an
 * alert line (in addition to the durable write) so it surfaces in logs/monitoring.
 */
export async function markDead(o: Obligation, error: string): Promise<void> {
  o.status = "DEAD";
  o.lastError = error;
  try {
    await writeObligation(o);
  } catch {
    logObligation("MARK_DEAD_PERSIST_FAILED", o);
  }
  // Always alert, even if the durable write succeeded — a dead obligation needs eyes.
  logObligation("DEAD_LETTER_ALERT", o);
}

/**
 * Scan for FAILED obligations the retry worker can resume. Returns at most `max`.
 * Only FAILED records are returned; the worker further filters to those with a
 * persisted `fujiTxHash` (the resumable money-in/nothing-out case).
 */
export async function listFailed(max = 100): Promise<Obligation[]> {
  const redis = getRedis();
  if (!redis) {
    return Array.from(memStore.values()).filter((o) => o.status === "FAILED").slice(0, max);
  }
  const out: Obligation[] = [];
  let cursor = "0";
  do {
    const res = await redis.scan(cursor, { match: `${OBLIGATION_KEY_PREFIX}*`, count: 100 });
    cursor = String(res[0]);
    const keys = res[1];
    if (keys.length) {
      const vals = await Promise.all(keys.map((k) => redis.get<Obligation>(k)));
      for (const v of vals) {
        if (v && v.status === "FAILED") out.push(v);
        if (out.length >= max) return out;
      }
    }
  } while (cursor !== "0");
  return out;
}

/** Read-only accessor for a retry worker / receipt assembly. */
export async function getObligation(nonce: string): Promise<Obligation | null> {
  try {
    return await readObligation(nonce);
  } catch {
    return null;
  }
}
