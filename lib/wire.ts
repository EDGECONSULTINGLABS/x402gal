// Wire Network Universal Transaction Layer (UTL) bridge — simulation.
//
// In production this would call into the Wire UTL relay network, which
// routes transactions across chains without bridges or oracles using
// Wire's universal-identity primitive. For the hackathon we model the
// route deterministically and emit synthetic UTL hashes so the demo is
// fully offline-capable while reflecting the real protocol shape.

import { Chain, PaymentPayload, Settlement, WireHop } from "./types";
import { LITERS_PER_HYDRO, DROPS_PER_HYDRO, TREASURY_ADDRESS } from "./constants";
import { recordSettlement } from "./ledger";

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

export async function routeAndRetire(payload: PaymentPayload): Promise<RouteResult> {
  const route = planRoute(payload.sourceChain, "wire-utl");
  const hops: WireHop[] = [];
  let totalMs = 0;

  // Hop 1: lock funds on the source chain.
  const lockMs = 40 + Math.random() * 60;
  hops.push({ chain: route[0], action: "lock", hash: utlHash(route[0]), ms: lockMs });
  totalMs += lockMs;

  // Hop 2: mint a UTL-native receipt on Wire and route to the treasury.
  const mintMs = 25 + Math.random() * 35;
  const wireUtlHash = utlHash("wutl");
  hops.push({ chain: "wire-utl", action: "mint", hash: wireUtlHash, ms: mintMs });
  totalMs += mintMs;

  // Hop 3: retire HYDRO against a verifiable water-restoration credit.
  const retireMs = 30 + Math.random() * 40;
  const retirementReceipt = utlHash("retire");
  hops.push({ chain: "wire-utl", action: "retire", hash: retirementReceipt, ms: retireMs });
  totalMs += retireMs;

  // Simulate latency (capped low for snappy UX).
  await new Promise((r) => setTimeout(r, Math.min(totalMs, 220)));

  return { hops, wireUtlHash, retirementReceipt, totalMs };
}

export function buildSettlement(
  payload: PaymentPayload,
  resource: string,
  route: RouteResult,
): Settlement {
  const liters = (payload.amountDrops / DROPS_PER_HYDRO) * LITERS_PER_HYDRO;
  const settlement: Settlement = {
    id: `stl_${rndHex(16)}`,
    txId: `tx_${rndHex(20)}`,
    agentId: payload.payer,
    resource,
    amountDrops: payload.amountDrops,
    litersOffset: liters,
    sourceChain: payload.sourceChain,
    destChain: "wire-utl",
    wireUtlHash: route.wireUtlHash,
    retirementReceipt: route.retirementReceipt,
    status: "retired",
    createdAt: Date.now(),
    hops: route.hops,
  };
  recordSettlement(settlement);
  return settlement;
}

export { TREASURY_ADDRESS };
