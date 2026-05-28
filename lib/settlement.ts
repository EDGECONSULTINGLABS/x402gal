// Settlement pipeline — direct x402 → XRPL retirement.
//
// Micro-payments accumulate in the pending batch. On flush the treasury
// swaps the aggregated USDC for HydroCoin (HYDRO) on the XRPL DEX and
// immediately retires that HYDRO as a verifiable water-restoration credit.
// There is no intermediate settlement layer: one batch → two XRPL hops.
//
// For the portfolio demo both hops are modelled deterministically with
// synthetic hashes so the app runs fully offline while reflecting the
// real on-chain protocol shape.

import { BatchEntry, Chain, Settlement, XrplHop } from "./types";
import { TREASURY_ADDRESS } from "./constants";
import { recordBatchSettlement } from "./ledger";
import { swapUsdcForHydro } from "./amm";
import { FOOTPRINT_METHODOLOGY_HASH } from "./footprint";

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
//   1) Swap accumulated USDC → HYDRO on the XRPL DEX (moves the AMM price).
//   2) Retire the HYDRO against a verifiable water-restoration credit.
export async function routeBatch(entries: BatchEntry[]): Promise<SettleResult> {
  const hops: XrplHop[] = [];
  let totalMs = 0;

  const totalUsdc = entries.reduce((s, e) => s + e.amountUsdc, 0);
  const totalOffsetDrops = entries.reduce((s, e) => s + e.offsetDrops, 0);
  const sources = Array.from(new Set(entries.map((e) => e.sourceChain))) as Chain[];

  // Hop 1: swap USDC → HYDRO on the XRPL DEX pool.
  swapUsdcForHydro(totalUsdc);
  const swapMs = 20 + Math.random() * 30;
  const settlementHash = xrplHash("xrpl_swap");
  hops.push({ chain: "xrpl", action: "swap", hash: settlementHash, ms: swapMs });
  totalMs += swapMs;

  // Hop 2: retire HYDRO against a water-restoration credit on XRPL.
  const retireMs = 30 + Math.random() * 40;
  const retirementReceipt = xrplHash("xrpl_retire");
  hops.push({ chain: "xrpl", action: "retire", hash: retirementReceipt, ms: retireMs });
  totalMs += retireMs;

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
