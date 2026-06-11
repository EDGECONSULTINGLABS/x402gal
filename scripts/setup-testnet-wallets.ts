// One-time setup: generate + fund ISSUER and TREASURY wallets on XRPL testnet,
// then print the exact env block to paste into .env.local and Vercel.
// Usage: npx tsx scripts/setup-testnet-wallets.ts

import { Client } from "xrpl";

const ENDPOINT = "wss://s.altnet.rippletest.net:51233";

async function main() {
  const client = new Client(ENDPOINT);
  await client.connect();

  console.log("Funding issuer wallet via testnet faucet...");
  const { wallet: issuer, balance: issuerBal } = await client.fundWallet();
  console.log(`  issuer   ${issuer.address}  (${issuerBal} XRP)`);

  console.log("Funding treasury wallet via testnet faucet...");
  const { wallet: treasury, balance: treasuryBal } = await client.fundWallet();
  console.log(`  treasury ${treasury.address}  (${treasuryBal} XRP)`);

  await client.disconnect();

  console.log("\n──── Paste into .env.local AND Vercel (Production) ────\n");
  console.log(`XRPL_ENDPOINT=${ENDPOINT}`);
  console.log(`XRPL_TREASURY_SEED=${treasury.seed}`);
  console.log(`XRPL_TREASURY_ADDRESS=${treasury.address}`);
  console.log(`HYDROCOIN_ISSUER_SEED=${issuer.seed}`);
  console.log(`HYDROCOIN_ISSUER_ADDRESS=${issuer.address}`);
  console.log(`HYDROCOIN_CURRENCY=HYD`);
  console.log("\nNOTE: testnet-only wallets. Never reuse these seeds on mainnet.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
