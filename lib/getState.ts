// Shared helper — builds the dashboard state snapshot from the in-memory ledger.
// Used by both the API route (/api/state) and the server component (app/page.tsx)
// so the initial HTML already contains the data, eliminating the first-load fetch.

import { ledger } from "@/lib/ledger";
import { marketCapUSDC, priceUSDC } from "@/lib/amm";
import { BATCH_SIZE, DROPS_PER_HYDRO } from "@/lib/constants";
import { FOOTPRINT_METHODOLOGY_HASH } from "@/lib/footprint";
import { isXrplConfigured, xrplEndpoint } from "@/lib/xrplClient";

export function getDashboardState() {
  const l = ledger();
  const pendingMl = l.pendingTotals.waterMl;
  const totalLitersOffset = l.amm.totalLitersOffset + pendingMl / 1000;
  return {
    bootedAt: l.bootedAt,
    methodologyHash: FOOTPRINT_METHODOLOGY_HASH,
    agents: Array.from(l.agents.values()),
    settlements: l.settlements.slice(0, 50),
    amm: {
      ...l.amm,
      priceUSDC: priceUSDC(),
      marketCapUSDC: marketCapUSDC(),
      circulatingHydro:
        (10_000_000 * DROPS_PER_HYDRO - l.amm.totalRetiredDrops) / DROPS_PER_HYDRO,
      retiredHydro: l.amm.totalRetiredDrops / DROPS_PER_HYDRO,
    },
    batch: {
      sizeTarget: BATCH_SIZE,
      pendingCalls: l.pendingTotals.calls,
      pendingUsdc: l.pendingTotals.usdc,
      pendingOffsetDrops: l.pendingTotals.offsetDrops,
      pendingMl,
      lastFlushAt: l.pendingTotals.lastFlushAt,
    },
    totals: {
      settlements: l.settlements.length,
      litersOffset: totalLitersOffset,
      mlOffset: totalLitersOffset * 1000,
      callsServed:
        l.pendingTotals.calls +
        l.settlements.reduce((s, x) => s + (x.callCount || 0), 0),
    },
    xrpl: {
      live: isXrplConfigured(),
      endpoint: isXrplConfigured() ? xrplEndpoint() : null,
      explorerBase: isXrplConfigured()
        ? xrplEndpoint().includes("altnet")
          ? "https://testnet.xrpl.org/transactions/"
          : "https://xrpscan.com/tx/"
        : null,
    },
    lastEvmSettlement: l.lastEvmSettlement,
  };
}

export type DashboardState = ReturnType<typeof getDashboardState>;
