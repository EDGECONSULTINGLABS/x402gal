/**
 * Full cross-chain end-to-end (REAL): one signed payment, three on-chain hashes.
 *   1. Avalanche Fuji  — pull USDC from the buyer via ERC-3009 receiveWithAuthorization
 *   2. XRPL testnet    — AMM swap: treasury USDC reserve → HYDRO
 *   3. XRPL testnet    — retire: HYDRO burned (water credit)
 *
 * Prereqs:
 *   - A running server (npm run dev) OR set BASE=https://www.x402gal.com
 *   - BUYER_PRIVATE_KEY: a Fuji wallet holding USDC (signs the authorization)
 *   - EVM_TREASURY_ADDRESS set + EVM treasury funded with AVAX for gas
 *   - XRPL AMM pool already seeded (npm run amm:seed)
 *
 *   BASE=http://localhost:3000 BUYER_PRIVATE_KEY=0x... npx tsx scripts/run-e2e.ts
 */

import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
import { createPublicClient, http, getAddress, parseSignature, type Hex } from "viem";
import { avalancheFuji } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { randomBytes } from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3000";
const FUJI_USDC = "0x5425890298aed601595a70AB815c96711a31Bc65" as Hex;
const FUJI_CHAIN_ID = 43113;
const AMOUNT_MICROS = Number(process.env.E2E_AMOUNT_MICROS ?? "10000"); // 0.01 USDC
const OFFSET_DROPS = Number(process.env.E2E_OFFSET_DROPS ?? "100000"); // 0.1 HYDRO

const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(process.env.RPC_AVALANCHE ?? "https://api.avax-test.network/ext/bc/C/rpc") });

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Missing required env var: ${name}`); process.exit(1); }
  return v;
}

async function main() {
  const buyerKey = requireEnv("BUYER_PRIVATE_KEY") as Hex;
  const treasury = getAddress(requireEnv("EVM_TREASURY_ADDRESS"));
  const buyer = privateKeyToAccount(buyerKey);
  console.log(`Buyer:    ${buyer.address}`);
  console.log(`Treasury: ${treasury}`);
  console.log(`BASE:     ${BASE}\n`);

  // Buyer USDC balance (informational)
  const bal = await publicClient.readContract({
    address: FUJI_USDC,
    abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] }] as const,
    functionName: "balanceOf",
    args: [buyer.address],
  });
  console.log(`Buyer Fuji USDC: ${Number(bal) / 1e6}`);
  if (Number(bal) < AMOUNT_MICROS) {
    console.error(`Buyer needs >= ${AMOUNT_MICROS / 1e6} USDC on Fuji. Get it at https://faucet.circle.com/ (AVAX Fuji).`);
    process.exit(1);
  }

  // Sign ERC-3009 ReceiveWithAuthorization (EIP-712)
  const now = Math.floor(Date.now() / 1000);
  const validAfter = "0";
  const validBefore = String(now + 3600);
  const nonce = `0x${randomBytes(32).toString("hex")}` as Hex;
  const domain = { name: "USD Coin", version: "2", chainId: FUJI_CHAIN_ID, verifyingContract: FUJI_USDC } as const;
  const types = {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" },
      { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ],
  } as const;
  const message = { from: buyer.address, to: treasury, value: BigInt(AMOUNT_MICROS), validAfter: BigInt(validAfter), validBefore: BigInt(validBefore), nonce };
  const signature = await buyer.signTypedData({ domain, types, primaryType: "ReceiveWithAuthorization", message });
  const sig = parseSignature(signature);

  const requirement = {
    x402Version: 1, scheme: "exact", network: "xrpl", asset: "USDC",
    maxAmountRequired: AMOUNT_MICROS, resource: "/api/ai/chat", description: "x402GAL e2e",
    mimeType: "application/json", payTo: treasury, requiredDeadlineSeconds: 60,
    offsetHydroDrops: OFFSET_DROPS, estimatedMl: 1,
  };
  const payload = {
    x402Version: 1, scheme: "exact", network: "xrpl",
    payload: { signature, authorization: { from: buyer.address, to: treasury, value: String(AMOUNT_MICROS), validAfter, validBefore, nonce, v: Number(sig.v), r: sig.r, s: sig.s } },
  };

  console.log("\n--- POST /api/x402/facilitate ---");
  const r = await fetch(`${BASE}/api/x402/facilitate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requirement, payload }),
  });
  const json = await r.json().catch(() => ({}));
  console.log(`status ${r.status}\n`);

  if (r.status !== 200 || !json.success) {
    console.error("FAILED:", JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log("END-TO-END SUCCESS — real on-chain hashes:\n");
  console.log(`  1. Avalanche USDC pull: ${json.usdcTxHash}`);
  console.log(`     https://testnet.snowtrace.io/tx/${json.usdcTxHash}`);
  console.log(`  2. XRPL AMM swap:       ${json.txHash}`);
  console.log(`     https://testnet.xrpscan.com/tx/${json.txHash}`);
  console.log(`  3. XRPL retire (burn):  ${json.retirementTxHash}`);
  console.log(`     https://testnet.xrpscan.com/tx/${json.retirementTxHash}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
