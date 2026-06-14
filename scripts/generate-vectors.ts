/**
 * Generate x402 XRPL Native Settlement Test Vectors
 *
 * This script creates a throwaway XRPL testnet buyer wallet, funds it via
 * the official testnet faucet, sets a USDC trustline, and builds / signs a
 * Payment transaction to the treasury address you pass as an argument.
 *
 * It prints the complete test vector set: unsigned tx JSON, signed tx_blob,
 * resulting tx hash, and expected success + failure responses. Hand these
 * vectors to 0x so their native-XRPL buyer agent can converge.
 *
 * No treasury seed is ever needed. The treasury is only the Destination.
 *
 * Usage:
 *   npx tsx scripts/generate-vectors.ts <TREASURY_XRPL_ADDRESS> [amountUsdcMicros]
 *
 * Example:
 *   npx tsx scripts/generate-vectors.ts rYourTreasuryAddressHere 1000000
 */

import { Client, Wallet, Transaction } from "xrpl";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const XRPL_TESTNET = "wss://s.altnet.rippletest.net:51233";
const BUYER_WALLET_FILE = ".buyer-wallet.json";

/** Circle XRPL testnet USDC constants (confirmed). */
const USDC_CURRENCY = "5553444300000000000000000000000000000000";
const USDC_ISSUER = "rHuGNhqTG32mfmAvWA8hUyWRLV3tCSwKQt";

async function fundViaFaucet(address: string): Promise<void> {
  const faucetUrl = "https://faucet.altnet.rippletest.net/accounts";
  const res = await fetch(faucetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination: address }),
  });
  if (!res.ok) {
    throw new Error(`Faucet request failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { balance?: number; error?: string };
  if (data.error) throw new Error(`Faucet error: ${data.error}`);
  console.log(`[faucet] Funded ${address} with ${data.balance ?? "?"} XRP`);
  // Allow ledger to settle.
  await new Promise((r) => setTimeout(r, 3_000));
}

const FACILITATOR_URL = process.env.NEXT_PUBLIC_FACILITATOR_URL ?? "https://x402gal.xyz/api/x402/facilitate";

async function main() {
  const roundtrip = process.argv.includes("--roundtrip");
  const outputIdx = process.argv.indexOf("--output");
  const outputPath = outputIdx >= 0 ? process.argv[outputIdx + 1] : undefined;
  const args = process.argv.filter((a) => !a.startsWith("--") && process.argv[process.argv.indexOf(a) - 1] !== "--output");
  const treasuryAddress = args[2];
  const amountUsdcMicros = parseInt(args[3] ?? "1000000", 10);
  if (!treasuryAddress?.startsWith("r")) {
    console.error("Usage: npx tsx scripts/generate-vectors.ts [--roundtrip] [--output <path>] <TREASURY_XRPL_ADDRESS> [amountUsdcMicros]");
    console.error("  --roundtrip   POST the success vector to the live facilitator and print the response");
    console.error("  --output      Write structured vectors JSON to the given path");
    process.exit(1);
  }

  const client = new Client(XRPL_TESTNET);
  await client.connect();

  // Data structure to collect all vectors for structured JSON output.
  interface VectorSet {
    _note: string;
    _producedAt: string;
    success?: {
      description: string;
      invoiceId: string;
      unsignedPayment: unknown;
      tx_blob: string;
      tx_hash: string;
      amountUsdcMicros: number;
      usdcValue: string;
      facilitateRequest: unknown;
    };
    failureVectors?: Array<{
      description: string;
      expectedError: string;
      tx_blob: string;
      requirement: { maxAmountRequired: string };
    }>;
  }
  const vectors: VectorSet = {
    _note: "These vectors were produced on XRPL Testnet. The example issued currency is XRPL Testnet USDC.",
    _producedAt: new Date().toISOString(),
  };

  // ── 1. Load or create buyer wallet ─────────────────────────────────────────
  let buyer: Wallet;
  if (existsSync(BUYER_WALLET_FILE)) {
    const saved = JSON.parse(readFileSync(BUYER_WALLET_FILE, "utf8")) as { address: string; seed: string };
    buyer = Wallet.fromSeed(saved.seed);
    console.log("\n=== REUSING SAVED BUYER WALLET ===");
    console.log("address:", buyer.address);
  } else {
    buyer = Wallet.generate();
    writeFileSync(BUYER_WALLET_FILE, JSON.stringify({ address: buyer.address, seed: buyer.seed }, null, 2));
    console.log("\n=== BUYER WALLET (SAVED TO .buyer-wallet.json) ===");
    console.log("address:", buyer.address);
    console.log("publicKey:", buyer.publicKey);
    console.log("[info] Wallet saved to .buyer-wallet.json — reuses on next run");

    // ── 2. Fund via faucet (only for new wallets) ─────────────────────────
    await fundViaFaucet(buyer.address);
  }

  // ── 3. Set USDC trustline ────────────────────────────────────────────────────
  const trustline: Transaction = {
    TransactionType: "TrustSet",
    Account: buyer.address,
    LimitAmount: {
      currency: USDC_CURRENCY,
      issuer: USDC_ISSUER,
      value: "1000000",
    },
  } as unknown as Transaction; // xrpl.js types are slightly rigid

  const autofillTrust = await client.autofill(trustline as any);
  const signedTrust = buyer.sign(autofillTrust);
  await client.submitAndWait(signedTrust.tx_blob);
  console.log("[trustline] USDC trustline set");

  // ── 3b. Confirm USDC balance ───────────────────────────────────────────────
  const balRes = await client.request({
    command: "account_lines",
    account: buyer.address,
  });
  const usdcLine = (balRes.result.lines as Array<{ currency: string; account: string; balance: string }>)
    .find((l) => l.currency === USDC_CURRENCY && l.account === USDC_ISSUER);
  const usdcBalance = usdcLine ? parseFloat(usdcLine.balance) : 0;
  console.log("[balance] Buyer USDC balance:", usdcBalance);
  if (usdcBalance < amountUsdcMicros / 1_000_000) {
    console.error(`\n[ERROR] Buyer has ${usdcBalance} USDC but needs ${amountUsdcMicros / 1_000_000} USDC for this test.`);
    console.error(`[ACTION] Send testnet USDC to ${buyer.address} and re-run.`);
    await client.disconnect();
    process.exit(1);
  }

  // ── 4. Build the canonical Payment tx ──────────────────────────────────────
  // Generate a fresh invoice ID for each run so round-trip tests don't
  // collide with the in-memory replay guard across dev-server invocations.
  const invoiceId = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex").toUpperCase();
  const usdcValue = (amountUsdcMicros / 1_000_000).toString(); // decimal USDC for XRPL

  const unsignedPayment: Transaction = {
    TransactionType: "Payment",
    Account: buyer.address,
    Destination: treasuryAddress,
    Amount: {
      currency: USDC_CURRENCY,
      issuer: USDC_ISSUER,
      value: usdcValue,
    },
    InvoiceID: invoiceId,
  } as unknown as Transaction;

  const autofilled = await client.autofill(unsignedPayment as any);
  const signed = buyer.sign(autofilled);

  // Decode the blob so we can show the exact fields the facilitator will see.
  const { decode } = await import("xrpl");
  const decoded = decode(signed.tx_blob);

  // ── Assert InvoiceID consistency across all layers ─────────────────────────
  const onLedgerInvoiceId = (decoded as Record<string, unknown>).InvoiceID as string;
  if (onLedgerInvoiceId !== invoiceId) {
    console.error("[CRITICAL] InvoiceID mismatch:");
    console.error("  generated invoiceId:", invoiceId);
    console.error("  on-ledger InvoiceID:", onLedgerInvoiceId);
    process.exit(1);
  }

  console.log("\n=== UNSIGNED PAYMENT JSON (before autofill) ===");
  console.log(JSON.stringify(unsignedPayment, null, 2));

  console.log("\n=== AUTOFILLED + SIGNED PAYMENT (decoded from tx_blob) ===");
  console.log(JSON.stringify(decoded, null, 2));

  console.log("\n=== TEST VECTORS FOR 0x ===");
  console.log("invoiceId:", invoiceId);
  console.log("tx_blob:", signed.tx_blob);
  console.log("tx_hash:", signed.hash);
  console.log("amountUsdcMicros:", amountUsdcMicros);
  console.log("usdcValue (XRPL decimal):", usdcValue);

  // Build the structured success vector.
  const validBefore = String(Math.floor(Date.now() / 1000) + 300);
  vectors.success = {
    description: "A valid Payment of 1.0 USDC to the example treasury, bound to a fresh invoiceId.",
    invoiceId,
    unsignedPayment: {
      TransactionType: "Payment",
      Account: buyer.address,
      Destination: treasuryAddress,
      Amount: {
        currency: USDC_CURRENCY,
        issuer: USDC_ISSUER,
        value: usdcValue,
      },
      InvoiceID: invoiceId,
    },
    tx_blob: signed.tx_blob,
    tx_hash: signed.hash,
    amountUsdcMicros,
    usdcValue,
    facilitateRequest: {
      requirement: {
        x402Version: 1,
        scheme: "exact",
        network: "xrpl",
        asset: "USDC",
        maxAmountRequired: String(amountUsdcMicros),
        resource: "/api/example-resource",
        description: "Example resource access",
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
          signature: "dummy-signature-for-auth-fields",
          authorization: {
            from: buyer.address,
            to: treasuryAddress,
            value: String(amountUsdcMicros),
            validAfter: "0",
            validBefore,
            nonce: "test-nonce",
          },
        },
        xrplSignedTx: signed.tx_blob,
        invoiceId,
      },
    },
  };

  console.log("\n=== EXPECTED FACILITATE REQUEST ===");
  console.log(JSON.stringify(vectors.success.facilitateRequest, null, 2));

  // ── 5b. Round-trip self-test (optional) ────────────────────────────────────
  if (roundtrip) {
    console.log("\n=== ROUND-TRIP: POSTING TO LIVE FACILITATOR ===");
    const body = {
      requirement: {
        x402Version: 1,
        scheme: "exact",
        network: "xrpl",
        asset: "USDC",
        maxAmountRequired: String(amountUsdcMicros),
        resource: "/api/ai/chat",
        description: "402GAL water-offset for chat inference",
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
          signature: "dummy-signature-for-auth-fields",
          authorization: {
            from: buyer.address,
            to: treasuryAddress,
            value: String(amountUsdcMicros),
            validAfter: "0",
            validBefore: String(Math.floor(Date.now() / 1000) + 300),
            nonce: "test-nonce",
          },
        },
        xrplSignedTx: signed.tx_blob,
        invoiceId,
      },
    };
    try {
      const res = await fetch(FACILITATOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      console.log("facilitator status:", res.status);
      console.log("facilitator response:", JSON.stringify(result, null, 2));
      if (res.ok && result.success && result.paymentTxHash) {
        console.log("[roundtrip] SUCCESS — paymentTxHash:", result.paymentTxHash);
      } else if (!res.ok) {
        console.error("[roundtrip] FAILED — facilitator rejected:", result.invalidReason ?? result.errorReason ?? JSON.stringify(result));
      } else {
        console.error("[roundtrip] FAILED — unexpected response shape");
      }
    } catch (err) {
      console.error("[roundtrip] ERROR:", err instanceof Error ? err.message : String(err));
    }
  }

  // ── 6. Failure vectors ─────────────────────────────────────────────────────
  console.log("\n=== FAILURE CASE 1: AMOUNT MISMATCH ===");
  const wrongAmount = (amountUsdcMicros + 1).toString(); // one micro off
  const badAmountTx: Transaction = {
    TransactionType: "Payment",
    Account: buyer.address,
    Destination: treasuryAddress,
    Amount: {
      currency: USDC_CURRENCY,
      issuer: USDC_ISSUER,
      value: (parseInt(wrongAmount) / 1_000_000).toString(),
    },
    InvoiceID: invoiceId,
  } as unknown as Transaction;
  const badAmountAutofilled = await client.autofill(badAmountTx as any);
  const badAmountSigned = buyer.sign(badAmountAutofilled);
  console.log("badAmount_tx_blob:", badAmountSigned.tx_blob);
  console.log("expectedError: AMOUNT_MISMATCH");

  console.log("\n=== FAILURE CASE 2: EXPIRED LEDGER (simulate via LastLedgerSequence = 1) ===");
  const expiredTx: Transaction = {
    TransactionType: "Payment",
    Account: buyer.address,
    Destination: treasuryAddress,
    Amount: {
      currency: USDC_CURRENCY,
      issuer: USDC_ISSUER,
      value: usdcValue,
    },
    InvoiceID: "DEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF",
    LastLedgerSequence: 1,
  } as unknown as Transaction;
  const expiredAutofilled = await client.autofill(expiredTx as any);
  // Override LastLedgerSequence back to 1 after autofill for the failure vector
  expiredAutofilled.LastLedgerSequence = 1;
  const expiredSigned = buyer.sign(expiredAutofilled);
  console.log("expired_tx_blob:", expiredSigned.tx_blob);
  console.log("expectedError: EXPIRED_LEDGER");

  vectors.failureVectors = [
    {
      description: "AMOUNT_MISMATCH: the Payment Amount.value is one micro-USDC higher than required.",
      expectedError: "AMOUNT_MISMATCH",
      tx_blob: badAmountSigned.tx_blob,
      requirement: { maxAmountRequired: String(amountUsdcMicros) },
    },
    {
      description: "EXPIRED_LEDGER: LastLedgerSequence is set to 1, which is always expired on Testnet.",
      expectedError: "EXPIRED_LEDGER",
      tx_blob: expiredSigned.tx_blob,
      requirement: { maxAmountRequired: String(amountUsdcMicros) },
    },
  ];

  await client.disconnect();

  if (outputPath) {
    writeFileSync(resolve(outputPath), JSON.stringify(vectors, null, 2));
    console.log(`\n[output] Vectors written to ${resolve(outputPath)}`);
  }

  console.log("\n=== DONE ===");
  console.log("Hand the vectors above to 0x. The buyer wallet seed is disposable.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
