/**
 * EVM Treasury — pulls USDC from agent wallet to treasury via ERC-3009.
 *
 * Called by the x402 facilitator after verifyOnChain() passes.
 * Uses receiveWithAuthorization() so the treasury atomically claims
 * the pre-signed USDC transfer — no agent second action required.
 *
 * Env vars required:
 *   EVM_TREASURY_PRIVATE_KEY   0x... private key of the treasury wallet
 *   EVM_TREASURY_ADDRESS       0x... public address  (derived from key)
 *   AVALANCHE_NETWORK          fuji | mainnet  (default: mainnet)
 *
 * The treasury wallet needs a small AVAX balance for gas (~0.01 AVAX covers
 * thousands of receiveWithAuthorization calls on Fuji).
 * Fund it at: https://core.app/tools/testnet-faucet/?subnet=c&token=c
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  type Hex,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalanche, avalancheFuji } from "viem/chains";
import type { Chain as ViemChain } from "viem";

// ── Network config (mirrors chainVerifier.ts) ─────────────────────────────────

const AVAX_NETWORK = (process.env.AVALANCHE_NETWORK ?? "mainnet") as "mainnet" | "fuji";

const NETWORK = {
  mainnet: {
    chain: avalanche as ViemChain,
    usdc:  "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" as `0x${string}`,
    rpc:   process.env.RPC_AVALANCHE ?? "https://api.avax.network/ext/bc/C/rpc",
  },
  fuji: {
    chain: avalancheFuji as ViemChain,
    usdc:  "0x5425890298aed601595a70AB815c96711a31Bc65" as `0x${string}`,
    rpc:   process.env.RPC_AVALANCHE ?? "https://api.avax-test.network/ext/bc/C/rpc",
  },
};

// ── ERC-3009 ABI — receiveWithAuthorization ───────────────────────────────────

const ERC3009_RECEIVE_ABI = [
  {
    name: "receiveWithAuthorization",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from",        type: "address" },
      { name: "to",          type: "address" },
      { name: "value",       type: "uint256" },
      { name: "validAfter",  type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce",       type: "bytes32" },
      { name: "v",           type: "uint8"   },
      { name: "r",           type: "bytes32" },
      { name: "s",           type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Erc3009Authorization {
  from:        string;   // payer address
  to:          string;   // treasury address
  value:       string;   // amount in token base units (6 decimals for USDC)
  validAfter:  string;   // unix seconds
  validBefore: string;   // unix seconds
  nonce:       string;   // hex bytes32 nonce
  v:           number;
  r:           string;   // 0x-prefixed bytes32
  s:           string;   // 0x-prefixed bytes32
}

export interface TreasuryPullResult {
  success:  boolean;
  txHash?:  Hash;
  explorer?: string;
  error?:   string;
  skipped?: boolean;   // true when treasury not configured — no funds moved
}

// ── Treasury availability check ───────────────────────────────────────────────

export function isEvmTreasuryConfigured(): boolean {
  return !!(process.env.EVM_TREASURY_PRIVATE_KEY && process.env.EVM_TREASURY_ADDRESS);
}

// ── Main: pull USDC via receiveWithAuthorization ──────────────────────────────

/**
 * Execute ERC-3009 receiveWithAuthorization to pull USDC from the agent
 * wallet to the treasury. Called after verifyOnChain() confirms balance.
 *
 * The agent must have pre-signed the authorization off-chain using
 * EIP-712 signTypedData with the USDC contract's domain.
 *
 * If EVM_TREASURY_PRIVATE_KEY is not set, returns skipped:true so the
 * rest of the flow (XRPL settlement) continues — safe for demo mode.
 */
export async function pullUsdcToTreasury(
  auth: Erc3009Authorization,
): Promise<TreasuryPullResult> {
  if (!isEvmTreasuryConfigured()) {
    return {
      success: true,
      skipped: true,
      error: "EVM treasury not configured — USDC pull skipped, XRPL settlement continues",
    };
  }

  const net = NETWORK[AVAX_NETWORK];
  const privateKey = process.env.EVM_TREASURY_PRIVATE_KEY as Hex;
  const treasuryAddress = getAddress(process.env.EVM_TREASURY_ADDRESS!);

  const account = privateKeyToAccount(privateKey);
  const publicClient  = createPublicClient({ chain: net.chain, transport: http(net.rpc) });
  const walletClient  = createWalletClient({ chain: net.chain, transport: http(net.rpc), account });

  // Pad nonce to bytes32
  const nonceHex = auth.nonce.startsWith("0x")
    ? auth.nonce.padEnd(66, "0") as `0x${string}`
    : `0x${auth.nonce.padEnd(64, "0")}` as `0x${string}`;

  try {
    const { request } = await publicClient.simulateContract({
      address: net.usdc,
      abi: ERC3009_RECEIVE_ABI,
      functionName: "receiveWithAuthorization",
      args: [
        getAddress(auth.from),
        treasuryAddress,
        BigInt(auth.value),
        BigInt(auth.validAfter),
        BigInt(auth.validBefore),
        nonceHex as `0x${string}`,
        auth.v,
        auth.r as `0x${string}`,
        auth.s as `0x${string}`,
      ],
      account,
    });

    const txHash = await walletClient.writeContract(request);
    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const explorer = AVAX_NETWORK === "fuji"
      ? `https://testnet.avascan.info/blockchain/c/tx/${txHash}`
      : `https://avascan.info/blockchain/c/tx/${txHash}`;

    console.info(`[evmTreasury] USDC pulled to treasury: ${txHash}`);

    return { success: true, txHash, explorer };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[evmTreasury] receiveWithAuthorization failed: ${msg}`);
    return { success: false, error: msg };
  }
}

/** Treasury address currently in use. */
export function treasuryAddress(): string {
  return process.env.EVM_TREASURY_ADDRESS ?? "not configured";
}
