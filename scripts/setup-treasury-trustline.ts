/**
 * One-time treasury trustline setup for XRPL native settlement.
 *
 * The treasury needs a USDC trustline to receive issued-currency Payments.
 * Without it, every Payment returns tecPATH_DRY.
 *
 * Usage (run locally with .env.local present):
 *   npx tsx scripts/setup-treasury-trustline.ts
 *
 * The treasury seed is read from XRPL_TREASURY_SEED in .env.local.
 * It is NEVER logged or written to any output.
 */

import { Client, Wallet, Transaction } from "xrpl";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const XRPL_TESTNET = "wss://s.altnet.rippletest.net:51233";
const USDC_CURRENCY = "5553444300000000000000000000000000000000";
const USDC_ISSUER = "rHuGNhqTG32mfmAvWA8hUyWRLV3tCSwKQt";

async function main() {
  const seed = process.env.XRPL_TREASURY_SEED;
  const address = process.env.XRPL_TREASURY_ADDRESS;

  if (!seed) {
    console.error("[setup] XRPL_TREASURY_SEED not found in .env.local");
    process.exit(1);
  }
  if (!address) {
    console.error("[setup] XRPL_TREASURY_ADDRESS not found in .env.local");
    process.exit(1);
  }

  const client = new Client(XRPL_TESTNET);
  await client.connect();

  const treasury = Wallet.fromSeed(seed);
  if (treasury.address !== address) {
    console.error(`[setup] Seed-derived address ${treasury.address} does not match env XRPL_TREASURY_ADDRESS ${address}`);
    await client.disconnect();
    process.exit(1);
  }

  console.log("[setup] Treasury address:", treasury.address);

  // Check if trustline already exists
  const lines = await client.request({
    command: "account_lines",
    account: treasury.address,
  });
  const already = (lines.result.lines as Array<{ currency: string; account: string }>)
    .some((l) => l.currency === USDC_CURRENCY && l.account === USDC_ISSUER);

  if (already) {
    console.log("[setup] USDC trustline already exists — nothing to do.");
    await client.disconnect();
    return;
  }

  // Create trustline
  const trustline: Transaction = {
    TransactionType: "TrustSet",
    Account: treasury.address,
    LimitAmount: {
      currency: USDC_CURRENCY,
      issuer: USDC_ISSUER,
      value: "100000000", // 100M USDC limit
    },
  } as unknown as Transaction;

  const autofilled = await client.autofill(trustline as any);
  const signed = treasury.sign(autofilled);
  const result = await client.submitAndWait(signed.tx_blob);

  const meta = result.result.meta as { TransactionResult?: string } | undefined;
  const code = meta?.TransactionResult ?? "";
  if (code === "tesSUCCESS") {
    console.log("[setup] USDC trustline created successfully.");
    console.log("[setup] Tx hash:", result.result.hash);
  } else {
    console.error("[setup] TrustSet failed:", code);
    process.exit(1);
  }

  await client.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
