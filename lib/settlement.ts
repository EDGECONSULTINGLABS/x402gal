// Settlement pipeline — direct x402 → XRPL retirement.
//
// Micro-payments accumulate in the pending batch. On flush the treasury
// swaps the aggregated USDC for HydroCoin (HYDRO) on the XRPL DEX and
// immediately retires that HYDRO as a verifiable water-restoration credit.
// There is no intermediate settlement layer: one batch → two XRPL hops.
//
// When XRPL_TREASURY_SEED + HYDROCOIN_ISSUER + HYDROCOIN_CURRENCY are set in
// .env.local the pipeline submits real signed transactions to the configured
// XRPL node and returns the actual on-chain tx hashes. Without those vars it
// falls back to the in-memory simulation so the app works fully offline.

import { BatchEntry, Chain, Settlement, XrplHop } from "./types";
import { TREASURY_ADDRESS } from "./constants";
import { recordBatchSettlement } from "./ledger";
import { swapUsdcForHydro } from "./amm";
import { FOOTPRINT_METHODOLOGY_HASH } from "./footprint";
import { isXrplConfigured } from "./xrplClient";
import { swapAndRetireHydro } from "./xrplHydro";

const HEX = "0123456789abcdef";
function rndHex(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += HEX[(Math.random() * 16) | 0];
  return s;
}

export function xrplHash(prefix = "xrpl"): string {
  return `${prefix}_${rndHex(40)}`;
}

export interface SettleResult {
  hops: XrplHop[];
  settlementHash: string;
  retirementReceipt: string;
  totalMs: number;
  sourceChains: Chain[];
  hydroRetiredDrops: number;
  usdcSettled: number;
}

// Settle a batch on XRPL in two hops:
//   1) Swap accumulated USDC → HYDRO on the XRPL DEX (OfferCreate).
//   2) Retire the HYDRO against a verifiable water-restoration credit (Payment to black-hole).
//
// Falls back to in-memory simulation when env vars are not set.
export async function routeBatch(entries: BatchEntry[]): Promise<SettleResult> {
  const hops: XrplHop[] = [];

  const totalUsdc = entries.reduce((s, e) => s + e.amountUsdc, 0);
  const totalOffsetDrops = entries.reduce((s, e) => s + e.offsetDrops, 0);
  const sources = Array.from(new Set(entries.map((e) => e.sourceChain))) as Chain[];

  // Always update the local AMM model (keeps dashboard price/charts accurate).
  swapUsdcForHydro(totalUsdc);

  if (isXrplConfigured()) {
    // ── Real XRPL path ────────────────────────────────────────────────────────
    const t0 = Date.now();
    const { swapHash, retireHash } = await swapAndRetireHydro(totalUsdc, totalOffsetDrops);
    const totalMs = Date.now() - t0;
    const swapMs = totalMs * 0.4;
    const retireMs = totalMs * 0.6;

    hops.push({ chain: "xrpl", action: "swap", hash: swapHash, ms: swapMs });
    hops.push({ chain: "xrpl", action: "retire", hash: retireHash, ms: retireMs });

    return {
      hops,
      settlementHash: swapHash,
      retirementReceipt: retireHash,
      totalMs,
      sourceChains: sources,
      hydroRetiredDrops: totalOffsetDrops,
      usdcSettled: totalUsdc,
    };
  }

  // ── Simulated path (no env vars) ──────────────────────────────────────────
  const swapMs = 20 + Math.random() * 30;
  const settlementHash = xrplHash("xrpl_swap");
  hops.push({ chain: "xrpl", action: "swap", hash: settlementHash, ms: swapMs });

  const retireMs = 30 + Math.random() * 40;
  const retirementReceipt = xrplHash("xrpl_retire");
  hops.push({ chain: "xrpl", action: "retire", hash: retirementReceipt, ms: retireMs });

  const totalMs = swapMs + retireMs;
  await new Promise((r) => setTimeout(r, Math.min(totalMs, 120)));

  return {
    hops,
    settlementHash,
    retirementReceipt,
    totalMs,
    sourceChains: sources,
    hydroRetiredDrops: totalOffsetDrops,
    usdcSettled: totalUsdc,
  };
}

// Build + record a Settlement that aggregates the given batch entries.
export async function settleBatch(entries: BatchEntry[]): Promise<Settlement | null> {
  if (entries.length === 0) return null;

  const route = await routeBatch(entries);
  const totalMl = entries.reduce((s, e) => s + e.waterMl, 0);
  const primaryChain: Chain = route.sourceChains[0] ?? "xrpl";
  const resources = Array.from(new Set(entries.map((e) => e.resource)));

  const settlement: Settlement = {
    id: `stl_${rndHex(16)}`,
    txId: `tx_${rndHex(20)}`,
    agentId: "batch",
    resource: resources.length === 1 ? resources[0] : `batch:${resources.length}-resources`,
    usdcSettled: route.usdcSettled,
    amountDrops: route.hydroRetiredDrops,
    litersOffset: totalMl / 1000,
    callCount: entries.length,
    sourceChain: primaryChain,
    settlementHash: route.settlementHash,
    retirementReceipt: route.retirementReceipt,
    status: "retired",
    createdAt: Date.now(),
    hops: route.hops,
    methodologyHash: FOOTPRINT_METHODOLOGY_HASH,
  };
  recordBatchSettlement(settlement);
  return settlement;
}

export { TREASURY_ADDRESS };
