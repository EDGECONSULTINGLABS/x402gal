/**
 * Execute ONE real on-chain XRPL settlement against the live AMM pool:
 *   Hop 1 — AMM swap : treasury USDC reserve → HYDRO (real Payment through the pool)
 *   Hop 2 — retire   : treasury → issuer (HYDRO burned = water credit)
 *
 * Prints the real tx hashes. No server required.
 *
 *   npx tsx scripts/run-swap.ts [hydroDrops]
 *   (default 100000 drops = 0.1 HYDRO)
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { swapAndRetireHydro } from "../lib/xrplHydro";

const hydroDrops = Number(process.argv[2] ?? "100000");
const usdcMicros = Math.max(1, Math.round(hydroDrops / 1)); // informational only

async function main() {
  console.log(`Settling ${hydroDrops} HYDRO drops (${hydroDrops / 1_000_000} HYDRO) via real AMM swap + retire...\n`);
  const { swapHash, retireHash, hydroAmount } = await swapAndRetireHydro(usdcMicros, hydroDrops);

  console.log("DONE — real on-chain hashes:\n");
  console.log(`  HYDRO swapped: ${hydroAmount}`);
  console.log(`  AMM swap  (USDC→HYDRO): ${swapHash}`);
  console.log(`    https://testnet.xrpscan.com/tx/${swapHash}`);
  console.log(`  Retirement (HYDRO burn): ${retireHash}`);
  console.log(`    https://testnet.xrpscan.com/tx/${retireHash}`);

  process.exit(0);
}

main().catch((e) => {
  console.error("Settlement failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
