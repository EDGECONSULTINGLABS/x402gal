// In-memory ledger. For the hackathon we keep state in a module-scoped
// singleton so it survives across API route invocations within a single
// server process. (Vercel serverless will reset between cold starts; that's
// acceptable for the demo and we surface it honestly in the UI.)

import { Agent, AmmState, BatchEntry, Settlement } from "./types";
import { BATCH_SIZE, DROPS_PER_HYDRO, SEED_AGENTS } from "./constants";

interface LedgerState {
  agents: Map<string, Agent>;
  settlements: Settlement[];
  amm: AmmState;
  bootedAt: number;
  // Pending batch: x402 micropayments accumulated but not yet routed through
  // Wire UTL. Flushed when length hits BATCH_SIZE or BATCH_FLUSH_MS elapses.
  pendingBatch: BatchEntry[];
  pendingTotals: {
    drops: number;
    waterMl: number;
    calls: number;
    sinceFlushMs: number;
    lastFlushAt: number;
  };
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
    pendingBatch: [],
    pendingTotals: {
      drops: 0,
      waterMl: 0,
      calls: 0,
      sinceFlushMs: 0,
      lastFlushAt: Date.now(),
    },
  };
}

export function ledger(): LedgerState {
  if (!globalThis.__meraxisLedger) {
    globalThis.__meraxisLedger = bootstrap();
  }
  return globalThis.__meraxisLedger;
}

// Append a single x402 micro-payment to the pending batch. Debits the agent
// immediately (they've paid into escrow); the cross-chain settlement that
// retires HYDRO happens later when the batch flushes.
export function addToBatch(entry: BatchEntry): { shouldFlush: boolean } {
  const l = ledger();
  const agent = l.agents.get(entry.agentId);
  if (agent) {
    agent.balanceDrops -= entry.amountDrops;
    agent.totalLitersOffset += entry.waterMl / 1000;
    agent.totalQueries += 1;
  }
  l.pendingBatch.push(entry);
  l.pendingTotals.drops += entry.amountDrops;
  l.pendingTotals.waterMl += entry.waterMl;
  l.pendingTotals.calls += 1;
  l.pendingTotals.sinceFlushMs = Date.now() - l.pendingTotals.lastFlushAt;
  return { shouldFlush: l.pendingBatch.length >= BATCH_SIZE };
}

// Drain the pending batch. Caller (lib/wire.ts) is responsible for actually
// routing the settlement through Wire UTL and writing the resulting
// Settlement record via recordBatchSettlement().
export function drainBatch(): BatchEntry[] {
  const l = ledger();
  const drained = l.pendingBatch;
  l.pendingBatch = [];
  l.pendingTotals = {
    drops: 0,
    waterMl: 0,
    calls: 0,
    sinceFlushMs: 0,
    lastFlushAt: Date.now(),
  };
  return drained;
}

export function recordBatchSettlement(s: Settlement) {
  const l = ledger();
  l.settlements.unshift(s);
  if (l.settlements.length > 500) l.settlements.length = 500;
  l.amm.totalRetiredDrops += s.amountDrops;
  l.amm.totalLitersOffset += s.litersOffset;
}

