// In-memory ledger. For the hackathon we keep state in a module-scoped
// singleton so it survives across API route invocations within a single
// server process. (Vercel serverless will reset between cold starts; that's
// acceptable for the demo and we surface it honestly in the UI.)

import { Agent, AmmState, Settlement } from "./types";
import { DROPS_PER_HYDRO, SEED_AGENTS } from "./constants";

interface LedgerState {
  agents: Map<string, Agent>;
  settlements: Settlement[];
  amm: AmmState;
  bootedAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __meraxisLedger: LedgerState | undefined;
}

function bootstrap(): LedgerState {
  const agents = new Map<string, Agent>();
  for (const a of SEED_AGENTS) {
    agents.set(a.id, {
      id: a.id,
      label: a.label,
      operator: a.operator,
      chain: a.chain,
      walletAddress: `${a.chain}1${a.id.slice(0, 12)}xxxxxxxxxx`,
      balanceDrops: a.balanceDrops,
      totalLitersOffset: 0,
      totalQueries: 0,
      joinedAt: Date.now(),
    });
  }

  // Seed the HydroCoin AMM. 10M HYDRO paired against 12M USDC ⇒ start price $1.20.
  const reserveHydro = 10_000_000 * DROPS_PER_HYDRO;
  const reserveUSDC = 12_000_000 * 1_000_000;
  return {
    agents,
    settlements: [],
    amm: {
      reserveHydro,
      reserveUSDC,
      k: reserveHydro * reserveUSDC,
      lastPriceUSDC: reserveUSDC / reserveHydro,
      totalRetiredDrops: 0,
      totalLitersOffset: 0,
    },
    bootedAt: Date.now(),
  };
}

export function ledger(): LedgerState {
  if (!globalThis.__meraxisLedger) {
    globalThis.__meraxisLedger = bootstrap();
  }
  return globalThis.__meraxisLedger;
}

export function recordSettlement(s: Settlement) {
  const l = ledger();
  l.settlements.unshift(s);
  if (l.settlements.length > 500) l.settlements.length = 500;
  const agent = l.agents.get(s.agentId);
  if (agent) {
    agent.balanceDrops -= s.amountDrops;
    agent.totalLitersOffset += s.litersOffset;
    agent.totalQueries += 1;
  }
  l.amm.totalRetiredDrops += s.amountDrops;
  l.amm.totalLitersOffset += s.litersOffset;
}
