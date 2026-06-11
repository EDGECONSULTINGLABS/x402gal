// x402 "exact" scheme on Avalanche Fuji — the EVM payment rail.
//
// Serves a spec-compliant requirement (https://www.x402.org/, Coinbase x402 v1)
// alongside the XRPL entry in the 402 accepts[] array, and settles incoming
// ERC-3009 payments by pulling USDC to the EVM treasury via
// receiveWithAuthorization (lib/evmTreasury.ts).

import { getAddress } from "viem";
import {
  pullUsdcToTreasury,
  isEvmTreasuryConfigured,
  treasuryAddress,
  Erc3009Authorization,
} from "./evmTreasury";

export const FUJI_USDC = "0x5425890298aed601595a70AB815c96711a31Bc65";
const PUBLIC_ORIGIN = "https://www.x402gal.com";

// Standard x402 v1 "exact" requirement for the Fuji rail.
export interface EvmExactRequirement {
  scheme: "exact";
  network: "avalanche-fuji";
  maxAmountRequired: string; // atomic units (USDC has 6 decimals)
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: { name: string; version: string }; // EIP-712 domain of the asset
}

export function buildFujiRequirement(
  resource: string,
  amountUsdc: number,
  description: string,
): EvmExactRequirement | null {
  if (!isEvmTreasuryConfigured()) return null;
  return {
    scheme: "exact",
    network: "avalanche-fuji",
    maxAmountRequired: String(amountUsdc),
    resource: `${PUBLIC_ORIGIN}${resource}`,
    description,
    mimeType: "application/json",
    payTo: treasuryAddress(),
    maxTimeoutSeconds: 60,
    asset: FUJI_USDC,
    extra: { name: "USD Coin", version: "2" },
  };
}

export interface EvmExactPayment {
  payer: string;
  auth: Erc3009Authorization;
}

// Decode a standard x402 v1 X-PAYMENT header for the "exact" EVM scheme:
// base64({ x402Version, scheme, network, payload: { signature, authorization } }).
// Returns null when the header is absent or belongs to another rail.
export function decodeEvmExactPayment(header: string | null): EvmExactPayment | null {
  if (!header) return null;
  try {
    const json = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    if (json?.scheme !== "exact") return null;
    if (json?.network !== "avalanche-fuji" && json?.network !== "avalanche") return null;
    const sig = String(json?.payload?.signature ?? "");
    const a = json?.payload?.authorization;
    if (!sig || !a?.from || !a?.to || a?.value === undefined || !a?.nonce) return null;

    const hex = sig.startsWith("0x") ? sig.slice(2) : sig;
    if (hex.length < 130) return null;
    const r = `0x${hex.slice(0, 64)}`;
    const s = `0x${hex.slice(64, 128)}`;
    let v = parseInt(hex.slice(128, 130), 16);
    if (v < 27) v += 27;

    return {
      payer: getAddress(a.from),
      auth: {
        from: a.from,
        to: a.to,
        value: String(a.value),
        validAfter: String(a.validAfter ?? "0"),
        validBefore: String(a.validBefore ?? Math.floor(Date.now() / 1000) + 3600),
        nonce: a.nonce,
        v,
        r,
        s,
      },
    };
  } catch {
    return null;
  }
}

export interface EvmSettleResult {
  ok: boolean;
  reason?: string;
  txHash?: string;
  explorer?: string;
}

// Verify-and-settle: the on-chain simulateContract inside pullUsdcToTreasury
// validates the EIP-712 signature, nonce freshness, and validity window;
// the write moves the USDC. Amount and payTo are checked here first.
export async function settleEvmExact(
  pay: EvmExactPayment,
  requiredUsdc: number,
): Promise<EvmSettleResult> {
  if (!isEvmTreasuryConfigured()) {
    return { ok: false, reason: "EVM treasury not configured" };
  }
  if (getAddress(pay.auth.to) !== getAddress(treasuryAddress())) {
    return { ok: false, reason: "payTo mismatch" };
  }
  if (BigInt(pay.auth.value) < BigInt(requiredUsdc)) {
    return { ok: false, reason: "underpayment" };
  }
  const res = await pullUsdcToTreasury(pay.auth);
  if (!res.success || res.skipped) {
    return { ok: false, reason: res.error ?? "settlement failed" };
  }
  return { ok: true, txHash: res.txHash, explorer: res.explorer };
}
