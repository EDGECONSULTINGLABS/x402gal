// Read-only snapshot of ledger state for the dashboard.

import { ledger } from "@/lib/ledger";
import { marketCapUSDC, priceUSDC } from "@/lib/amm";
import { DROPS_PER_HYDRO } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const l = ledger();
  return Response.json({
    bootedAt: l.bootedAt,
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
    totals: {
      settlements: l.settlements.length,
      litersOffset: l.amm.totalLitersOffset,
    },
  });
}
