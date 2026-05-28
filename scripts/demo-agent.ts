// CLI demo: a real agent walking the x402 round-trip end-to-end.
// Usage: BASE=http://localhost:3000 npm run demo:agent

import { gal402Fetch, memoryWallet } from "@/lib/agentSdk";

const BASE = process.env.BASE ?? "http://localhost:3000";

async function main() {
  const wallet = memoryWallet("agent_meridian_v3", "base");
  console.log(`→ Calling ${BASE}/api/ai/chat as ${wallet.agentId}`);
  const res = await gal402Fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "What's the water cost of this query?" }),
    wallet,
    maxUsdc: 5_000_000, // refuse to pay more than 5 USDC per query
  });
  const data = await res.json();
  console.log(`← ${res.status} ${res.statusText}`);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
