/**
 * One-time treasury trustline setup for XRPL native settlement.
 *
 * The treasury needs a trust line to each accepted issued currency (USDC and
 * RLUSD) to receive those Payments. Without it, every Payment returns
 * tecPATH_DRY / tecNO_LINE.
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
import { acceptedXrplAssets } from "../lib/xrplAssets";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const XRPL_TESTNET = process.env.XRPL_ENDPOINT ?? "wss://s.altnet.rippletest.net:51233";

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

  const lines = await client.request({
    command: "account_lines",
    account: treasury.address,
  });
  const existing = lines.result.lines as Array<{ currency: string; account: string }>;

  // Establish a trust line for every accepted asset (USDC + RLUSD) idempotently.
  for (const asset of acceptedXrplAssets()) {
    const already = existing.some(
      (l) => l.currency === asset.currency && l.account === asset.issuer,
    );
    if (already) {
      console.log(`[setup] ${asset.symbol} trustline already exists — skipping.`);
      continue;
    }

    const trustline: Transaction = {
      TransactionType: "TrustSet",
      Account: treasury.address,
      LimitAmount: {
        currency: asset.currency,
        issuer: asset.issuer,
        value: "100000000", // 100M limit
      },
    } as unknown as Transaction;

    const autofilled = await client.autofill(trustline as any);
    const signed = treasury.sign(autofilled);
    const result = await client.submitAndWait(signed.tx_blob);
    const meta = result.result.meta as { TransactionResult?: string } | undefined;
    const code = meta?.TransactionResult ?? "";
    if (code === "tesSUCCESS") {
      console.log(`[setup] ${asset.symbol} trustline created. Tx:`, result.result.hash);
    } else {
      console.error(`[setup] ${asset.symbol} TrustSet failed:`, code);
      process.exit(1);
    }
  }

  await client.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
