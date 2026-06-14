/**
 * Level 3 proof — the pool-deposit ceiling guard fails CLOSED when Redis is down.
 *
 * Points the Upstash client at a dead endpoint so every INCRBY throws, then
 * asserts reservePoolDeposit() REFUSES (GUARD_UNAVAILABLE) rather than allowing
 * an unguarded HYDRO deposit. A blocked refill is always safer than an unbacked one.
 *
 *   npx tsx scripts/test-amm-redis-down.ts
 */

// Configure a Redis endpoint that will fail fast (nothing listening on :1).
process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:1";
process.env.UPSTASH_REDIS_REST_TOKEN = "dead-token";

import { reservePoolDeposit } from "../lib/hydroSupply";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function run() {
  console.log("Level 3 — Redis-down fail-closed (pool deposit guard)\n");

  const r = await reservePoolDeposit(1_000);

  ok("Redis unreachable → reservation NOT ok", r.ok === false, `ok=${r.ok}`);
  ok("Redis unreachable → GUARD_UNAVAILABLE", r.reason === "GUARD_UNAVAILABLE", `reason=${r.reason}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
