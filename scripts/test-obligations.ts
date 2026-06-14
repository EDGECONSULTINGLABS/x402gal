/**
 * Level 1 proof — guard decision logic, deterministic, no chains, no Redis.
 *
 * Runs the obligation state machine against every transition using the in-memory
 * fallback (UPSTASH_* unset → memStore). The critical case is the two concurrent
 * first-requests on a fresh nonce: exactly one must "proceed" and one must "hold",
 * which is what proves the atomic NX claim is wired correctly.
 *
 *   npx tsx scripts/test-obligations.ts
 */

// Ensure the in-memory fallback is used (no real Redis), regardless of shell env.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

import {
  beginSettlement,
  recordPull,
  markRetired,
  markFailed,
  markDead,
  listFailed,
  getObligation,
  MAX_ATTEMPTS,
} from "../lib/obligations";

let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const init = { amountUsdcMicros: 1_000, hydroDrops: 1 };
let n = 0;
const nonce = () => `test-nonce-${Date.now()}-${n++}`;

async function run() {
  console.log("Level 1 — obligation guard logic\n");

  // 1. Fresh nonce → claim and proceed (status RETIRING).
  {
    const k = nonce();
    const r = await beginSettlement(k, init);
    ok("fresh nonce → proceed", r.proceed === true && r.obligation?.status === "RETIRING",
      `proceed=${r.proceed} status=${r.obligation?.status}`);
  }

  // 2. RETIRED → reject as duplicate.
  {
    const k = nonce();
    const r1 = await beginSettlement(k, init);
    await markRetired(r1.obligation!, { mintTxHash: "MINT", retireTxHash: "RETIRE" });
    const r2 = await beginSettlement(k, init);
    ok("RETIRED → ALREADY_RETIRED", r2.proceed === false && r2.reason === "ALREADY_RETIRED",
      `proceed=${r2.proceed} reason=${r2.reason}`);
    ok("RETIRED → returns original hashes",
      r2.obligation?.mintTxHash === "MINT" && r2.obligation?.retireTxHash === "RETIRE");
  }

  // 3. RETIRING (in flight) → hold.
  {
    const k = nonce();
    await beginSettlement(k, init); // leaves RETIRING
    const r2 = await beginSettlement(k, init);
    ok("RETIRING → IN_FLIGHT", r2.proceed === false && r2.reason === "IN_FLIGHT",
      `proceed=${r2.proceed} reason=${r2.reason}`);
  }

  // 4. FAILED → allow retry, attempts incremented.
  {
    const k = nonce();
    const r1 = await beginSettlement(k, init);
    await recordPull(r1.obligation!, "FUJI_HASH_123");
    await markFailed(r1.obligation!, "injected XRPL failure");
    const r2 = await beginSettlement(k, init);
    ok("FAILED → proceed (retry allowed)", r2.proceed === true,
      `proceed=${r2.proceed} reason=${r2.reason}`);
    ok("retry increments attempts", r2.obligation?.attempts === 2,
      `attempts=${r2.obligation?.attempts}`);
    ok("retry resumes from Step 3 (fujiTxHash preserved)", r2.obligation?.fujiTxHash === "FUJI_HASH_123",
      `fujiTxHash=${r2.obligation?.fujiTxHash}`);
  }

  // 5. CRITICAL — two concurrent first-requests on a fresh nonce: exactly one proceeds.
  {
    const k = nonce();
    const [a, b] = await Promise.all([beginSettlement(k, init), beginSettlement(k, init)]);
    const proceeds = [a, b].filter((r) => r.proceed).length;
    const holds = [a, b].filter((r) => !r.proceed && r.reason === "IN_FLIGHT").length;
    ok("concurrent claim → exactly one proceed", proceeds === 1, `proceeds=${proceeds}`);
    ok("concurrent claim → exactly one hold (IN_FLIGHT)", holds === 1, `holds=${holds}`);
  }

  // 6. Dead-letter transition.
  {
    const k = nonce();
    const r1 = await beginSettlement(k, init);
    await markDead(r1.obligation!, "exhausted");
    const o = await getObligation(k);
    ok("markDead → status DEAD", o?.status === "DEAD", `status=${o?.status}`);
    const r2 = await beginSettlement(k, init);
    ok("DEAD → not retried (no proceed)", r2.proceed === false,
      `proceed=${r2.proceed} reason=${r2.reason}`);
  }

  // 7. listFailed returns only FAILED records.
  {
    const k = nonce();
    const r1 = await beginSettlement(k, init);
    await recordPull(r1.obligation!, "FUJI_FOR_LIST");
    await markFailed(r1.obligation!, "for listFailed");
    const list = await listFailed();
    ok("listFailed includes the FAILED obligation", list.some((o) => o.nonce === k));
    ok("listFailed excludes non-FAILED", list.every((o) => o.status === "FAILED"));
  }

  console.log(`\nMAX_ATTEMPTS = ${MAX_ATTEMPTS}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
