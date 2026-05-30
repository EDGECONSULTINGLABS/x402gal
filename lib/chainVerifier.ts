/**
 * Multi-chain x402 payment verifier.
 *
 * Dispatches verification to the correct chain RPC based on `sourceChain`.
 * Uses viem for all EVM chains (already a dependency).
 * Falls back to ledger-only check when RPC env vars are not configured.
 *
 * Env vars (add to .env.local):
 *   RPC_BASE          https://mainnet.base.org
 *   RPC_ETHEREUM      https://eth.llamarpc.com
 *   RPC_POLYGON       https://polygon-rpc.com
 *   RPC_AVALANCHE     https://api.avax.network/ext/bc/C/rpc
 *   RPC_SOLANA        https://api.mainnet-beta.solana.com  (stubbed — no SDK installed)
 *   XRPL_ENDPOINT     wss://s.altnet.rippletest.net:51233  (already used by xrplClient.ts)
 *
 * EVM verification uses ERC-3009 transferWithAuthorization — the canonical
 * USDC payment scheme on Base/Ethereum/Polygon/Avalanche. The facilitator
 * calls receiveWithAuthorization which atomically verifies the signature
 * AND transfers USDC in one transaction, making double-spend impossible.
 *
 * For the hackathon / testnet, RPC env vars are optional — if absent the
 * verifier falls back to the in-memory ledger balance check so the demo
 * keeps working without any RPC keys.
 */

import { createPublicClient, http, parseSignature, getAddress, Hex } from "viem";
import { base, mainnet, polygon, avalanche, avalancheFuji } from "viem/chains";
import type { Chain as ViemChain } from "viem";
import type { Chain, PaymentPayload, PaymentRequirement } from "./types";

// ── Avalanche network selection ───────────────────────────────────────────────
// Set AVALANCHE_NETWORK=fuji in .env.local to test against Fyodor/Saul's agents
// on Fuji testnet. Defaults to mainnet for production.

const AVAX_NETWORK = (process.env.AVALANCHE_NETWORK ?? "mainnet") as "mainnet" | "fuji";

const AVALANCHE_CONFIG = {
  mainnet: {
    chain: avalanche,
    usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" as `0x${string}`,  // Circle native USDC
    rpcFallback: "https://api.avax.network/ext/bc/C/rpc",
  },
  fuji: {
    chain: avalancheFuji,
    usdc: "0x5425890298aed601595a70AB815c96711a31Bc65" as `0x${string}`,  // Fuji testnet USDC
    rpcFallback: "https://api.avax-test.network/ext/bc/C/rpc",
  },
};

// ── ERC-3009 ABI (minimal — only what we need for authorization check) ────────

const ERC3009_ABI = [
  {
    name: "authorizationState",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// ── USDC contract addresses per chain ────────────────────────────────────────

function usdcAddress(chain: string): `0x${string}` | null {
  const map: Record<string, `0x${string}`> = {
    base:      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    ethereum:  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    polygon:   "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    // Avalanche address is network-dependent — resolved below
    avalanche: AVALANCHE_CONFIG[AVAX_NETWORK].usdc,
  };
  return map[chain] ?? null;
}

// ── RPC endpoints (env vars → public fallbacks) ───────────────────────────────

function rpcUrl(chain: string): string | null {
  if (chain === "avalanche") {
    // Prefer explicit env var; fall back to network-appropriate public endpoint
    return process.env.RPC_AVALANCHE ?? AVALANCHE_CONFIG[AVAX_NETWORK].rpcFallback;
  }
  const env: Record<string, string | undefined> = {
    base:      process.env.RPC_BASE,
    ethereum:  process.env.RPC_ETHEREUM,
    polygon:   process.env.RPC_POLYGON,
  };
  return env[chain] ?? null;
}

function viemChain(chain: string): ViemChain | null {
  const map: Record<string, ViemChain> = {
    base,
    ethereum: mainnet,
    polygon,
    avalanche: AVALANCHE_CONFIG[AVAX_NETWORK].chain,
  };
  return map[chain] ?? null;
}

// ── EVM verification ─────────────────────────────────────────────────────────

export interface ChainVerifyResult {
  ok: boolean;
  reason?: string;
  method: "rpc" | "ledger" | "stub";
}

async function verifyEvm(
  sourceChain: string,
  payload: PaymentPayload,
): Promise<ChainVerifyResult> {
  const rpc = rpcUrl(sourceChain);
  if (!rpc) {
    return { ok: true, method: "ledger", reason: `no RPC configured for ${sourceChain} — ledger fallback` };
  }

  const chain = viemChain(sourceChain);
  if (!chain) {
    return { ok: false, method: "stub", reason: `unknown EVM chain: ${sourceChain}` };
  }

  const usdc = usdcAddress(sourceChain);
  if (!usdc) {
    return { ok: false, method: "stub", reason: `no USDC address for ${sourceChain}` };
  }

  // Log which Avalanche network is active so it's visible in server logs
  if (sourceChain === "avalanche") {
    console.info(`[chainVerifier] Avalanche verification using ${AVAX_NETWORK} (${rpc})`);
  }

  try {
    const client = createPublicClient({ chain, transport: http(rpc) });

    // 1. Check payer USDC balance covers the payment
    const payerAddress = getAddress(payload.payer.startsWith("0x") ? payload.payer : `0x${payload.payer}`);
    const balance = await client.readContract({
      address: usdc,
      abi: ERC3009_ABI,
      functionName: "balanceOf",
      args: [payerAddress],
    });

    if (balance < BigInt(payload.amountUsdc)) {
      return {
        ok: false,
        method: "rpc",
        reason: `insufficient on-chain USDC balance: has ${balance}, needs ${payload.amountUsdc}`,
      };
    }

    // 2. Check ERC-3009 nonce has not been used (replay protection)
    const nonceBytes = payload.nonce.padEnd(64, "0").slice(0, 64) as Hex;
    const nonceHex: `0x${string}` = `0x${nonceBytes}`;
    const used = await client.readContract({
      address: usdc,
      abi: ERC3009_ABI,
      functionName: "authorizationState",
      args: [payerAddress, nonceHex],
    });

    if (used) {
      return { ok: false, method: "rpc", reason: "ERC-3009 nonce already used (replay)" };
    }

    // 3. Signature structure check (v, r, s parseable)
    //    Full ecrecover verification happens inside receiveWithAuthorization
    //    on-chain at settlement time — no need to duplicate it here.
    if (payload.signature && payload.signature.length >= 130) {
      try {
        parseSignature(payload.signature as Hex);
      } catch {
        return { ok: false, method: "rpc", reason: "malformed EVM signature" };
      }
    }

    return { ok: true, method: "rpc" };
  } catch (err) {
    // RPC call failed — fall back to ledger check rather than blocking the payment
    console.warn(`[chainVerifier] RPC call failed for ${sourceChain}, falling back to ledger:`, err);
    return { ok: true, method: "ledger", reason: `RPC error — ledger fallback` };
  }
}

// ── Solana verification (stub — @solana/web3.js not installed) ────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function verifySolana(_payload: PaymentPayload): Promise<ChainVerifyResult> {
  // TODO: install @solana/web3.js and verify SPL token balance + ed25519 sig
  // const conn = new Connection(process.env.RPC_SOLANA ?? clusterApiUrl("mainnet-beta"));
  // const balance = await conn.getTokenAccountBalance(payerTokenAccount);
  return { ok: true, method: "stub", reason: "Solana RPC verification not yet implemented" };
}

// ── XRPL verification (stub — signature check left for ripple-keypairs PR) ───

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function verifyXrpl(_payload: PaymentPayload): Promise<ChainVerifyResult> {
  // TODO: use ripple-keypairs to verify ed25519/secp256k1 sig over canonical auth hash
  // import { verify } from "ripple-keypairs";
  // const valid = verify(canonicalHash(payload), payload.signature, payload.publicKey);
  return { ok: true, method: "stub", reason: "XRPL sig verification stub — see CONTRIBUTING.md" };
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Verify a payment payload against the chain it claims to come from.
 * Call this from verifyPayment() after the basic field checks.
 *
 * Returns { ok: true } when:
 *   - RPC is configured and on-chain checks pass
 *   - RPC is not configured (falls back to ledger check — safe for demo)
 *   - Chain is Solana or XRPL (stubs — pending full implementation)
 */
export async function verifyOnChain(
  _req: PaymentRequirement,
  payload: PaymentPayload,
): Promise<ChainVerifyResult> {
  const chain: Chain = payload.sourceChain;

  switch (chain) {
    case "base":
    case "ethereum":
    case "polygon":
    case "avalanche":
      return verifyEvm(chain, payload);

    case "solana":
      return verifySolana(payload);

    case "xrpl":
      return verifyXrpl(payload);

    default:
      return { ok: false, method: "stub", reason: `unsupported sourceChain: ${chain}` };
  }
}

/**
 * Quick check: is any RPC configured for at least one chain?
 * Used for status display / capability discovery.
 */
export function configuredChains(): Chain[] {
  const chains: Chain[] = [];
  if (process.env.RPC_BASE)      chains.push("base");
  if (process.env.RPC_ETHEREUM)  chains.push("ethereum");
  if (process.env.RPC_POLYGON)   chains.push("polygon");
  // Avalanche always has a public fallback RPC — mark as configured
  chains.push("avalanche");
  if (process.env.RPC_SOLANA)    chains.push("solana");
  if (process.env.XRPL_ENDPOINT) chains.push("xrpl");
  return chains;
}

/** Which Avalanche network is currently active. */
export function avalancheNetwork(): string {
  return AVAX_NETWORK;
}

/** Avalanche USDC address currently in use (mainnet or Fuji). */
export function avalancheUsdcAddress(): string {
  return AVALANCHE_CONFIG[AVAX_NETWORK].usdc;
}
