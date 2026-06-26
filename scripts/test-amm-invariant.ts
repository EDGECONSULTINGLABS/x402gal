/**
 * Level 1 proof — the unbacked-issuance invariant, deterministic, no chains, no Redis.
 *
 * Proves the core guarantee: cumulative HYDRO deposited into the pool can NEVER
 * exceed the verified-minted ceiling, that the atomic reserve/undo keeps the
 * counter exactly in sync, and that a partial fill at the boundary is rejected
 * (no "fill what fits" leak).
 *
 *   npx tsx scripts/test-amm-invariant.ts
 */

// Force in-memory fallback (no real Redis) and a known small ceiling.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
process.env.HYDRO_VERIFIED_CEILING_DROPLETS = "1000000"; // 1 HYDRO unit = 1e6 droplets

import {
  checkCeiling,
  reservePoolDeposit,
  releasePoolDeposit,
  getCumulativeDeposited,
  verifiedMintedCeilingDroplets,
} from "../lib/hydroSupply";

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

async function main() {
  const CEILING = verifiedMintedCeilingDroplets();
  ok("ceiling reads from env", CEILING === 1_000_000, `got ${CEILING}`);

  // ── Pure checkCeiling ──────────────────────────────────────────────────────
  ok("checkCeiling allows within headroom", checkCeiling(0, 500_000, CEILING).ok);
  ok("checkCeiling allows EXACT ceiling", checkCeiling(500_000, 500_000, CEILING).ok);
  ok("checkCeiling rejects 1 drop over", !checkCeiling(500_000, 500_001, CEILING).ok);
  ok(
    "checkCeiling rejects over-ceiling with reason",
    checkCeiling(CEILING, 1, CEILING).reason === "CEILING_EXCEEDED",
  );
  ok("checkCeiling rejects negative deposit", !checkCeiling(0, -1, CEILING).ok);
  ok(
    "checkCeiling computes remaining headroom",
    checkCeiling(400_000, 100_000, CEILING).remaining === 500_000,
  );

  // ── Durable reserve (in-memory) ────────────────────────────────────────────
  const r1 = await reservePoolDeposit(600_000);
  ok("reserve 600k under 1M succeeds", r1.ok && r1.cumulativeAfter === 600_000);

  const r2 = await reservePoolDeposit(600_000);
  ok("reserve another 600k is REJECTED (would total 1.2M)", !r2.ok && r2.reason === "CEILING_EXCEEDED");

  ok("rejected reserve did NOT advance the counter", (await getCumulativeDeposited()) === 600_000);

  const r3 = await reservePoolDeposit(400_000);
  ok("reserve remaining 400k succeeds (exact ceiling)", r3.ok && r3.cumulativeAfter === 1_000_000);

  const r4 = await reservePoolDeposit(1);
  ok("any deposit at full ceiling is rejected", !r4.ok);

  // ── Release keeps the counter in sync ──────────────────────────────────────
  await releasePoolDeposit(400_000);
  ok("release frees headroom", (await getCumulativeDeposited()) === 600_000);

  const r5 = await reservePoolDeposit(400_000);
  ok("can re-reserve after release", r5.ok && r5.cumulativeAfter === 1_000_000);

  // ── No-partial-fill: a single oversized deposit is all-or-nothing ──────────
  await releasePoolDeposit(1_000_000); // drain counter to 0
  ok("counter drained to 0", (await getCumulativeDeposited()) === 0);
  const big = await reservePoolDeposit(1_000_001);
  ok("oversized single deposit rejected whole (no partial fill)", !big.ok);
  ok("counter still 0 after rejected oversized deposit", (await getCumulativeDeposited()) === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
