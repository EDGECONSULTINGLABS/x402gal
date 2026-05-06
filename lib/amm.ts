// HydroCoin constant-product AMM. Buying HYDRO with USDC pushes the price up;
// retiring HYDRO (taking it out of circulation as a water-restoration credit)
// also reduces supply and lifts the floor over time.

import { ledger } from "./ledger";
import { DROPS_PER_HYDRO } from "./constants";

const FEE_BPS = 30; // 0.30% swap fee, retained as protocol revenue

export interface SwapQuote {
  inUSDC: number;
  outDrops: number;
  priceUSDC: number;
  newPriceUSDC: number;
  impactBps: number;
}

export function quoteBuyHydro(usdcMicros: number): SwapQuote {
  const amm = ledger().amm;
  const fee = Math.floor((usdcMicros * FEE_BPS) / 10_000);
  const inAfter = usdcMicros - fee;
  const newReserveUSDC = amm.reserveUSDC + inAfter;
  const newReserveHydro = Math.floor(amm.k / newReserveUSDC);
  const outDrops = amm.reserveHydro - newReserveHydro;
  const newPrice = newReserveUSDC / newReserveHydro;
  const oldPrice = amm.reserveUSDC / amm.reserveHydro;
  return {
    inUSDC: usdcMicros,
    outDrops,
    priceUSDC: oldPrice,
    newPriceUSDC: newPrice,
    impactBps: Math.round(((newPrice - oldPrice) / oldPrice) * 10_000),
  };
}

export function executeBuyHydro(usdcMicros: number, agentId: string): SwapQuote {
  const amm = ledger().amm;
  const q = quoteBuyHydro(usdcMicros);
  amm.reserveUSDC += usdcMicros - Math.floor((usdcMicros * FEE_BPS) / 10_000);
  amm.reserveHydro -= q.outDrops;
  amm.k = amm.reserveHydro * amm.reserveUSDC;
  amm.lastPriceUSDC = q.newPriceUSDC;
  const agent = ledger().agents.get(agentId);
  if (agent) agent.balanceDrops += q.outDrops;
  return q;
}

export function priceUSDC(): number {
  const amm = ledger().amm;
  return amm.reserveUSDC / amm.reserveHydro;
}

export function marketCapUSDC(): number {
  const amm = ledger().amm;
  // circulating ≈ initial 10M HYDRO minus retired
  const circulating = 10_000_000 * DROPS_PER_HYDRO - amm.totalRetiredDrops;
  return (circulating * priceUSDC()) / 1_000_000; // micro-USDC → USDC
}
