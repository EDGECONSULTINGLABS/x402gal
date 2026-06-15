/**
 * Read-only: report whether the HYDRO/USDC AMM pool exists, its reserves, and the
 * treasury's HYD + USDC balances. No transactions are submitted.
 *
 *   npx tsx scripts/check-amm-pool.ts
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { Client, Wallet } from "xrpl";
import { getPoolInfo, hydAsset, usdcAsset } from "../lib/xrplAmm";
import { getCumulativeDeposited, verifiedMintedCeilingDrops } from "../lib/hydroSupply";

async function lineBalance(client: Client, account: string, currency: string, issuer: string): Promise<number> {
  const lines = await client.request({ command: "account_lines", account, peer: issuer });
  const l = (lines.result.lines as Array<{ currency: string; balance: string }>).find((x) => x.currency === currency);
  return l ? Number(l.balance) : 0;
}

async function main() {
  const endpoint = process.env.XRPL_ENDPOINT ?? "wss://s.altnet.rippletest.net:51233";
  const treasury = Wallet.fromSeed(process.env.XRPL_TREASURY_SEED!);
  const hyd = hydAsset();
  const usdc = usdcAsset();

  console.log(`Endpoint: ${endpoint}`);
  console.log(`Treasury: ${treasury.address}`);
  console.log(`Ceiling:  ${verifiedMintedCeilingDrops()} drops`);
  console.log(`Cumulative pool deposits: ${await getCumulativeDeposited()} drops\n`);

  const client = new Client(endpoint);
  await client.connect();
  try {
    const pool = await getPoolInfo(client);
    if (!pool) {
      console.log("AMM pool: DOES NOT EXIST yet.");
      console.log("  → Fund treasury with XRPL-USDC, then run: npm run amm:seed -- 10000 10000");
    } else {
      console.log("AMM pool: EXISTS");
      console.log(`  HYDRO reserve: ${pool.hydValue}`);
      console.log(`  USDC  reserve: ${pool.usdcValue}`);
      console.log(`  Trading fee:   ${pool.tradingFee / 1000}%`);
    }
    console.log(`\nTreasury HYD  balance: ${await lineBalance(client, treasury.address, hyd.currency, hyd.issuer)}`);
    console.log(`Treasury USDC balance (configured issuer ${usdc.issuer}): ${await lineBalance(client, treasury.address, usdc.currency, usdc.issuer)}`);

    console.log("\nAll treasury trust lines (currency | balance | issuer):");
    const all = await client.request({ command: "account_lines", account: treasury.address });
    const lines = all.result.lines as Array<{ currency: string; balance: string; account: string }>;
    if (lines.length === 0) console.log("  (none)");
    for (const l of lines) {
      const human = l.currency.length === 40
        ? Buffer.from(l.currency, "hex").toString("utf8").replace(/\0+$/, "")
        : l.currency;
      console.log(`  ${l.currency}${human && human !== l.currency ? ` ("${human}")` : ""} | ${l.balance} | ${l.account}`);
    }
  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
