/**
 * Level 3 proof — fail-closed when Redis is unreachable.
 *
 * Points the Upstash client at a dead endpoint (connection refused) so every
 * read/write throws, then asserts beginSettlement() REFUSES to proceed
 * (GUARD_UNAVAILABLE) rather than allowing an unguarded settlement. This proves
 * the "refuse rather than risk a double-mint" guarantee.
 *
 *   npx tsx scripts/test-obligations-redis-down.ts
 */

// Configure a Redis endpoint that will fail fast (nothing listening on :1).
process.env.UPSTASH_REDIS_REST_URL = "http://127.0.0.1:1";
process.env.UPSTASH_REDIS_REST_TOKEN = "dead-token";

import { beginSettlement } from "../lib/obligations";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function run() {
  console.log("Level 3 — Redis-down fail-closed\n");

  const r = await beginSettlement(`redis-down-${Date.now()}`, { amountUsdcMicros: 1_000, hydroDrops: 1 });

  ok("Redis unreachable → does NOT proceed", r.proceed === false, `proceed=${r.proceed}`);
  ok("Redis unreachable → GUARD_UNAVAILABLE", r.reason === "GUARD_UNAVAILABLE", `reason=${r.reason}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
