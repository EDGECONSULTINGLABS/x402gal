/**
 * End-to-end Fuji ERC-3009 buyer test
 *
 * This replicates exactly what 0x's agent will do:
 * 1. GET 402 requirement from /api/ai/chat (no payment)
 * 2. Parse the avalanche-fuji exact requirement
 * 3. Sign ERC-3009 TransferWithAuthorization via EIP-712
 * 4. Encode as x402 v1 X-PAYMENT header
 * 5. POST again with the signed payment
 * 6. Server pulls USDC on-chain and returns 200
 *
 * Requirements:
 *   - EVM_TREASURY_ADDRESS must be set in .env.local (treasury payTo)
 *   - TEST_BUYER_PRIVATE_KEY env var (0x... private key of a Fuji wallet with USDC)
 *   - That wallet must hold USDC on Fuji testnet
 *
 * Get Fuji testnet USDC: https://faucet.circle.com/ (select AVAX Fuji)
 */

import { createPublicClient, http, getAddress, parseSignature, type Hex } from "viem";
import { avalancheFuji } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const BASE = process.env.BASE ?? "https://www.x402gal.com";
const BUYER_PK = process.env.TEST_BUYER_PRIVATE_KEY as Hex | undefined;
const TREASURY = process.env.EVM_TREASURY_ADDRESS ?? "not configured";
const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as `0x${string}`;

const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http("https://api.avax-test.network/ext/bc/C/rpc"),
});

async function main() {
  if (!BUYER_PK) {
    console.error("Missing TEST_BUYER_PRIVATE_KEY env var.");
    console.error("Set it to the private key of a Fuji wallet that has USDC.");
    process.exit(1);
  }

  const buyer = privateKeyToAccount(BUYER_PK);
  const buyerAddress = buyer.address;
  console.log("Buyer address:", buyerAddress);
  console.log("Treasury:", TREASURY);

  // ── Check AVAX balance (for gas, not strictly required for off-chain signing) ──
  const avaxBal = await publicClient.getBalance({ address: buyerAddress });
  console.log("Buyer AVAX:", Number(avaxBal) / 1e18);

  // ── Check USDC balance ──
  const usdcBal = await publicClient.readContract({
    address: USDC_FUJI,
    abi: [{
      type: "function",
      name: "balanceOf",
      inputs: [{ name: "account", type: "address" }],
      outputs: [{ name: "", type: "uint256" }],
      stateMutability: "view",
    }] as const,
    functionName: "balanceOf",
    args: [buyerAddress],
  });
  console.log("Buyer USDC:", Number(usdcBal) / 1e6);

  if (Number(usdcBal) < 100) {
    console.error("\nWallet has no USDC. Get testnet USDC first:");
    console.error("  https://faucet.circle.com/  (select AVAX Fuji)");
    console.error("Or use a different wallet that already has Fuji USDC.");
    process.exit(1);
  }

  // ── Step 1: Get 402 requirement ──
  console.log("\n--- Getting 402 requirement ---");
  const r1 = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "test fuji payment" }),
  });
  const d1 = await r1.json();

  if (r1.status !== 402) {
    console.error("Expected 402, got", r1.status);
    console.error(d1);
    process.exit(1);
  }

  const fujiReq = d1.accepts?.find((a: any) => a.network === "avalanche-fuji");
  if (!fujiReq) {
    console.error("No avalanche-fuji rail in 402 response");
    console.error("accepts:", JSON.stringify(d1.accepts, null, 2));
    process.exit(1);
  }

  console.log("Fuji requirement:");
  console.log("  maxAmountRequired:", fujiReq.maxAmountRequired);
  console.log("  payTo:", fujiReq.payTo);
  console.log("  asset:", fujiReq.asset);
  console.log("  resource:", fujiReq.resource);

  // ── Step 2: Sign ERC-3009 ReceiveWithAuthorization ──
  const value = BigInt(fujiReq.maxAmountRequired);
  const validAfter = Math.floor(Date.now() / 1000) - 60; // 1 min ago
  const validBefore = Math.floor(Date.now() / 1000) + 300; // 5 min from now
  const nonce = `0x${[...Array(32)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("")}` as Hex;

  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: 43113,
    verifyingContract: USDC_FUJI,
  };

  const types = {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const message = {
    from: buyerAddress,
    to: getAddress(fujiReq.payTo),
    value: value,
    validAfter: BigInt(validAfter),
    validBefore: BigInt(validBefore),
    nonce: nonce,
  };

  console.log("\n--- Signing EIP-712 authorization ---");
  const signature = await buyer.signTypedData({ domain, types, primaryType: "ReceiveWithAuthorization", message });
  const sig = parseSignature(signature);
  console.log("Signature r:", sig.r?.slice(0, 10) + "...");
  console.log("Signature s:", sig.s?.slice(0, 10) + "...");
  console.log("Signature v:", sig.v);

  // ── Step 3: Encode x402 v1 exact payment ──
  const paymentPayload = {
    x402Version: 1,
    scheme: "exact",
    network: "avalanche-fuji",
    payload: {
      signature,
      authorization: {
        from: buyerAddress,
        to: getAddress(fujiReq.payTo),
        value: String(value),
        validAfter: String(validAfter),
        validBefore: String(validBefore),
        nonce,
      },
    },
  };

  const xPayment = btoa(JSON.stringify(paymentPayload));
  console.log("\nX-PAYMENT length:", xPayment.length, "chars");

  // ── Step 4: POST with payment ──
  console.log("--- Sending paid request ---");
  const r2 = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PAYMENT": xPayment,
    },
    body: JSON.stringify({ prompt: "test fuji payment" }),
  });
  const d2 = await r2.json();

  console.log("\nResponse status:", r2.status);
  if (r2.status === 200) {
    console.log("✅ PAYMENT ACCEPTED");
    console.log("  EVM settlement tx:", d2.evm_settlement?.txHash);
    console.log("  Explorer:", d2.evm_settlement?.explorer);
    console.log("  Amount charged (µUSDC):", d2.pricing?.amountUsdc);
    console.log("  Water offset (ml):", d2.pricing?.water_ml);
    console.log("  Batch pending calls:", d2.batch?.pending_calls);
    console.log("  XRPL settlement flushed:", d2.settlement?.id ?? "not yet");

    // Verify USDC moved on-chain
    if (d2.evm_settlement?.txHash) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: d2.evm_settlement.txHash as Hex });
      console.log("  On-chain confirmation:", receipt.status === "success" ? "SUCCESS" : "FAILED");
    }
  } else {
    console.log("❌ PAYMENT REJECTED");
    console.log("  reason:", d2.reason ?? d2.error);
    console.log("  full response:", JSON.stringify(d2, null, 2));
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
