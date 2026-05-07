// Wire Network Universal Transaction Layer (UTL) bridge — simulation.
//
// In production this would call into the Wire UTL relay network, which
// routes transactions across chains without bridges or oracles using
// Wire's universal-identity primitive. For the hackathon we model the
// route deterministically and emit synthetic UTL hashes so the demo is
// fully offline-capable while reflecting the real protocol shape.

import { BatchEntry, Chain, Settlement, WireHop } from "./types";
import { TREASURY_ADDRESS } from "./constants";
import { recordBatchSettlement } from "./ledger";
import { FOOTPRINT_METHODOLOGY_HASH } from "./footprint";

const HEX = "0123456789abcdef";
function rndHex(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += HEX[(Math.random() * 16) | 0];
  return s;
}

export function utlHash(prefix = "wutl"): string {
  return `${prefix}_${rndHex(40)}`;
}

// Compute the cross-chain route for a payment. Real Wire UTL would derive
// this from the universal identity graph; here we use deterministic rules.
export function planRoute(source: Chain, dest: Chain = "wire-utl"): Chain[] {
  if (source === dest) return [source];
  // All payments funnel through wire-utl as the settlement layer.
  if (dest === "wire-utl") return [source, "wire-utl"];
  return [source, "wire-utl", dest];
}

export interface RouteResult {
  hops: WireHop[];
  wireUtlHash: string;
  retirementReceipt: string;
  totalMs: number;
}

// Routes a batched payment through Wire UTL: aggregate sources → mint UTL
// receipt → retire HYDRO. Real UTL would emit per-source-chain locks; we
// collapse same-chain entries into a single lock hop for trace clarity.
export async function routeBatch(entries: BatchEntry[]): Promise<{
  hops: WireHop[];
  wireUtlHash: string;
  retirementReceipt: string;
  totalMs: number;
  sourceChains: Chain[];
}> {
  const hops: WireHop[] = [];
  let totalMs = 0;

  // Hop 1+: one lock per distinct source chain in the batch.
  const sources = Array.from(new Set(entries.map((e) => e.sourceChain))) as Chain[];
  for (const src of sources) {
    const lockMs = 40 + Math.random() * 60;
    hops.push({ chain: src, action: "lock", hash: utlHash(src), ms: lockMs });
    totalMs += lockMs;
  }

  // Hop N: mint a UTL-native aggregated receipt.
  const mintMs = 25 + Math.random() * 35;
  const wireUtlHash = utlHash("wutl");
  hops.push({ chain: "wire-utl", action: "mint", hash: wireUtlHash, ms: mintMs });
  totalMs += mintMs;

  // Hop N+1: retire HYDRO against a verifiable water-restoration credit.
  const retireMs = 30 + Math.random() * 40;
  const retirementReceipt = utlHash("retire");
  hops.push({ chain: "wire-utl", action: "retire", hash: retirementReceipt, ms: retireMs });
  totalMs += retireMs;

  await new Promise((r) => setTimeout(r, Math.min(totalMs, 260)));

  return { hops, wireUtlHash, retirementReceipt, totalMs, sourceChains: sources };
}

// Build + record a Settlement that aggregates the given batch entries.
// `entries` should be the result of ledger.drainBatch(). All math here is
// the sum of pre-computed per-call values (no double-counting).
export async function settleBatch(entries: BatchEntry[]): Promise<Settlement | null> {
  if (entries.length === 0) return null;

  const route = await routeBatch(entries);
  const totalDrops = entries.reduce((s, e) => s + e.amountDrops, 0);
  const totalMl = entries.reduce((s, e) => s + e.waterMl, 0);
  const primaryChain: Chain = route.sourceChains[0] ?? "wire-utl";
  const resources = Array.from(new Set(entries.map((e) => e.resource)));

  const settlement: Settlement = {
    id: `stl_${rndHex(16)}`,
    txId: `tx_${rndHex(20)}`,
    agentId: "batch",
    resource: resources.length === 1 ? resources[0] : `batch:${resources.length}-resources`,
    amountDrops: totalDrops,
    litersOffset: totalMl / 1000,
    callCount: entries.length,
    sourceChain: primaryChain,
    destChain: "wire-utl",
    wireUtlHash: route.wireUtlHash,
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
