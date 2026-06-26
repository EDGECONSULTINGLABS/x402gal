/**
 * RLUSD native-XRPL acceptance test (end-to-end on Testnet).
 *
 * Proves the facilitator accepts a real, signed XRPL Payment denominated in
 * RLUSD (Ripple USD) — the native-XRPL "exact" rail — alongside the existing
 * USDC support.
 *
 * What it does:
 *   1. Loads or creates a throwaway XRPL testnet buyer wallet (.rlusd-buyer-wallet.json)
 *   2. Funds it from the testnet faucet (new wallets only)
 *   3. Sets the buyer's RLUSD trust line (required to hold/send RLUSD)
 *   4. Confirms the buyer holds enough RLUSD (prints funding instructions if not)
 *   5. Builds + signs a Payment in RLUSD to the treasury, bound to a fresh InvoiceID
 *   6. With --roundtrip: POSTs the x402 facilitate request and asserts acceptance
 *
 * No treasury seed is needed — the treasury is only the Destination. The
 * treasury MUST already hold an RLUSD trust line (run the app's bootstrap or
 * scripts/setup-treasury-trustline.ts first) to receive RLUSD.
 *
 * RLUSD reference — https://docs.ripple.com/products/stablecoin/developer-resources/rlusd-on-the-xrpl
 *   currency hex   : 524C555344000000000000000000000000000000
 *   testnet issuer : rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV
 *   testnet RLUSD faucet: https://tryrlusd.com  (see docs "Get Testnet RLUSD")
 *
 * Usage:
 *   npx tsx scripts/test-rlusd-buyer.ts [--roundtrip] <TREASURY_XRPL_ADDRESS> [amountMicros]
 *
 * Example:
 *   npx tsx scripts/test-rlusd-buyer.ts --roundtrip rYourTreasuryAddressHere 1000000
 */

import { Client, Wallet, decode, type Transaction } from "xrpl";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { rlusdCurrency, rlusdIssuer } from "../lib/xrplAssets";

const XRPL_TESTNET = process.env.XRPL_ENDPOINT ?? "wss://s.altnet.rippletest.net:51233";
const BUYER_WALLET_FILE = ".rlusd-buyer-wallet.json";
const FACILITATOR_URL =
  process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "http://localhost:3000/api/x402/facilitate";

const RLUSD_CURRENCY = rlusdCurrency();
const RLUSD_ISSUER = rlusdIssuer();

async function fundViaFaucet(address: string): Promise<void> {
  const res = await fetch("https://faucet.altnet.rippletest.net/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination: address }),
  });
  if (!res.ok) throw new Error(`Faucet request failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { balance?: number; error?: string };
  if (data.error) throw new Error(`Faucet error: ${data.error}`);
  console.log(`[faucet] Funded ${address} with ${data.balance ?? "?"} XRP`);
  await new Promise((r) => setTimeout(r, 3_000));
}

async function main() {
  const roundtrip = process.argv.includes("--roundtrip");
  const args = process.argv.filter((a) => !a.startsWith("--"));
  const treasuryAddress = args[2];
  const amountMicros = parseInt(args[3] ?? "1000000", 10); // default 1.0 RLUSD

  if (!treasuryAddress?.startsWith("r")) {
    console.error(
      "Usage: npx tsx scripts/test-rlusd-buyer.ts [--roundtrip] <TREASURY_XRPL_ADDRESS> [amountMicros]",
    );
    process.exit(1);
  }

  console.log("[config] RLUSD currency:", RLUSD_CURRENCY);
  console.log("[config] RLUSD issuer:  ", RLUSD_ISSUER);
  console.log("[config] facilitator:   ", FACILITATOR_URL);

  const client = new Client(XRPL_TESTNET);
  await client.connect();

  try {
    // ── 1. Load or create buyer wallet ───────────────────────────────────────
    let buyer: Wallet;
    if (existsSync(BUYER_WALLET_FILE)) {
      const saved = JSON.parse(readFileSync(BUYER_WALLET_FILE, "utf8")) as { seed: string };
      buyer = Wallet.fromSeed(saved.seed);
      console.log("\n[wallet] Reusing buyer:", buyer.address);
    } else {
      buyer = Wallet.generate();
      writeFileSync(
        BUYER_WALLET_FILE,
        JSON.stringify({ address: buyer.address, seed: buyer.seed }, null, 2),
      );
      console.log("\n[wallet] Created buyer:", buyer.address, "(saved to", BUYER_WALLET_FILE + ")");
      await fundViaFaucet(buyer.address);
    }

    // ── 2. Set RLUSD trust line on the buyer ─────────────────────────────────
    const trustline = {
      TransactionType: "TrustSet",
      Account: buyer.address,
      LimitAmount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value: "1000000000" },
    } as unknown as Transaction;
    const autofillTrust = await client.autofill(trustline as never);
    const signedTrust = buyer.sign(autofillTrust);
    await client.submitAndWait(signedTrust.tx_blob);
    console.log("[trustline] RLUSD trust line set on buyer");

    // ── 3. Confirm RLUSD balance ─────────────────────────────────────────────
    const balRes = await client.request({ command: "account_lines", account: buyer.address });
    const line = (balRes.result.lines as Array<{ currency: string; account: string; balance: string }>)
      .find((l) => l.currency === RLUSD_CURRENCY && l.account === RLUSD_ISSUER);
    const rlusdBalance = line ? parseFloat(line.balance) : 0;
    console.log("[balance] Buyer RLUSD balance:", rlusdBalance);
    if (rlusdBalance < amountMicros / 1_000_000) {
      console.error(
        `\n[ERROR] Buyer holds ${rlusdBalance} RLUSD but needs ${amountMicros / 1_000_000}.`,
      );
      console.error(`[ACTION] Fund testnet RLUSD to ${buyer.address}`);
      console.error("         Testnet RLUSD faucet: https://tryrlusd.com (see Ripple docs)");
      process.exit(1);
    }

    // ── 4. Build + sign the RLUSD Payment ────────────────────────────────────
    const invoiceId = Buffer.from(crypto.getRandomValues(new Uint8Array(32)))
      .toString("hex")
      .toUpperCase();
    const rlusdValue = (amountMicros / 1_000_000).toString();

    const payment = {
      TransactionType: "Payment",
      Account: buyer.address,
      Destination: treasuryAddress,
      Amount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER, value: rlusdValue },
      InvoiceID: invoiceId,
    } as unknown as Transaction;

    const autofilled = await client.autofill(payment as never);
    const signed = buyer.sign(autofilled);
    const decoded = decode(signed.tx_blob) as Record<string, unknown>;

    console.log("\n[payment] Signed RLUSD Payment:");
    console.log("  invoiceId:", invoiceId);
    console.log("  value:    ", rlusdValue, "RLUSD");
    console.log("  tx_hash:  ", signed.hash);
    if (decoded.InvoiceID !== invoiceId) {
      console.error("[CRITICAL] InvoiceID mismatch in signed blob");
      process.exit(1);
    }

    // ── 5. Round-trip against the facilitator ────────────────────────────────
    if (roundtrip) {
      const body = {
        requirement: {
          x402Version: 1,
          scheme: "exact",
          network: "xrpl",
          asset: "RLUSD",
          maxAmountRequired: String(amountMicros),
          resource: "/api/ai/chat",
          description: "402GAL water-offset (RLUSD acceptance test)",
          mimeType: "application/json",
          payTo: treasuryAddress,
          requiredDeadlineSeconds: 60,
          invoiceId,
        },
        payload: {
          x402Version: 1,
          scheme: "exact",
          network: "xrpl",
          payload: {
            signature: "native-xrpl-blob-carries-the-signature",
            authorization: {
              from: buyer.address,
              to: treasuryAddress,
              value: String(amountMicros),
              validAfter: "0",
              validBefore: String(Math.floor(Date.now() / 1000) + 300),
              nonce: invoiceId,
            },
          },
          xrplSignedTx: signed.tx_blob,
          invoiceId,
        },
      };

      console.log("\n[roundtrip] POSTing RLUSD payment to facilitator…");
      const res = await fetch(FACILITATOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      console.log("[roundtrip] status:", res.status);
      console.log("[roundtrip] response:", JSON.stringify(result, null, 2));

      if (res.ok && result.success) {
        console.log("\n[PASS] Facilitator accepted RLUSD. paymentTxHash:", result.paymentTxHash);
      } else {
        console.error(
          "\n[FAIL] Facilitator rejected:",
          result.invalidReason ?? result.errorReason ?? JSON.stringify(result),
        );
        process.exitCode = 1;
      }
    } else {
      console.log("\n[info] Re-run with --roundtrip to POST this payment to the facilitator.");
    }
  } finally {
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
