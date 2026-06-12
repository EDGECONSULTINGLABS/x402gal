// In-memory ledger. For the hackathon we keep state in a module-scoped
// singleton so it survives across API route invocations within a single
// server process. (Vercel serverless will reset between cold starts; that's
// acceptable for the demo and we surface it honestly in the UI.)

import { Agent, AmmState, BatchEntry, Settlement } from "./types";
import { BATCH_SIZE, DROPS_PER_HYDRO, LITERS_PER_GALLON, SEED_AGENTS } from "./constants";
import { FOOTPRINT_METHODOLOGY_HASH } from "./footprint";

interface LedgerState {
  agents: Map<string, Agent>;
  settlements: Settlement[];
  amm: AmmState;
  bootedAt: number;
  // Pending batch: x402 micropayments accumulated but not yet settled on XRPL.
  // Flushed when length hits BATCH_SIZE or BATCH_FLUSH_MS elapses.
  pendingBatch: BatchEntry[];
  pendingTotals: {
    usdc: number; // micro-USDC collected awaiting XRPL settlement
    offsetDrops: number; // HYDRO drops queued for XRPL retirement
    waterMl: number;
    calls: number;
    sinceFlushMs: number;
    lastFlushAt: number;
  };
  // Most recent EVM settlement (Fuji, Base, etc.) for live dashboard display.
  lastEvmSettlement: { network: string; txHash: string; explorer: string; amountUsdc: number; at: number } | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __x402galLedger: LedgerState | undefined;
}

// Pre-seeded settlement history so the dashboard never cold-starts at zero.
// Spread over the past ~72 hours, mixing agents and chains for visual variety.
function makeSeedSettlements(now: number): Settlement[] {
  const chains = ["base", "solana", "ethereum", "polygon", "avalanche"] as const;
  const agentIds = SEED_AGENTS.map(a => a.id);
  const resources = ["/api/ai/chat", "/api/ai/embed", "/api/ai/image", "/api/ai/video"];
  const hops = (chain: string, offset: number) => [
    { chain: chain as Settlement["sourceChain"], action: "swap" as const, hash: `seed_swap_${offset.toString(16)}`, ms: 420 + (offset % 80) },
    { chain: "xrpl" as const, action: "retire" as const, hash: `seed_retire_${offset.toString(16)}`, ms: 310 + (offset % 60) },
  ];

  // 38 settlements spread over 72 h → ~1 every 2 h on average
  const intervals = [72,69,66,63,60,58,55,53,50,48,46,44,42,40,38,36,34,32,30,28,27,26,24,22,21,20,18,17,16,14,13,12,10,8,6,4,2,1];
  return intervals.map((hoursAgo, i) => {
    const agentId = agentIds[i % agentIds.length];
    const chain   = chains[i % chains.length];
    const calls   = 80 + ((i * 37) % 120);
    const liters  = 0.18 + (i * 0.07) % 1.2;
    const drops   = Math.round((liters / LITERS_PER_GALLON) * DROPS_PER_HYDRO);
    const usdc    = Math.round(liters * 0.0024 * 1_000_000);
    return {
      id: `seed_${i}`,
      txId: `seed_tx_${i.toString(16).padStart(4, "0")}`,
      agentId: calls >= 100 ? "batch" : agentId,
      resource: resources[i % resources.length],
      usdcSettled: usdc,
      amountDrops: drops,
      litersOffset: liters,
      callCount: calls,
      sourceChain: chain,
      settlementHash: `seed_hash_${i.toString(16).padStart(8, "0")}`,
      retirementReceipt: `seed_receipt_${i.toString(16).padStart(8, "0")}`,
      status: "retired" as const,
      createdAt: now - hoursAgo * 3_600_000,
      hops: hops(chain, i),
      methodologyHash: FOOTPRINT_METHODOLOGY_HASH,
    } satisfies Settlement;
  });
}

function bootstrap(): LedgerState {
  const now = Date.now();
  const agents = new Map<string, Agent>();

  // Per-agent seeded activity totals (queries + liters accumulated before this boot)
  const seedActivity: Record<string, { queries: number; liters: number }> = {
    agent_meridian_v3: { queries: 2847, liters: 3.12 },
    agent_solace_alpha: { queries: 1934, liters: 2.08 },
    agent_orin_x7:     { queries: 1102, liters: 1.24 },
    agent_kairo_pro:   { queries: 3561, liters: 3.89 },
    agent_apex_av1:    { queries: 2203, liters: 2.41 },
  };

  for (const a of SEED_AGENTS) {
    const act = seedActivity[a.id] ?? { queries: 500, liters: 0.5 };
    agents.set(a.id, {
      id: a.id,
      label: a.label,
      operator: a.operator,
      chain: a.chain,
      walletAddress: `${a.chain}1${a.id.slice(0, 12)}xxxxxxxxxx`,
      balanceUsdc: a.balanceUsdc,
      totalLitersOffset: act.liters,
      totalQueries: act.queries,
      joinedAt: now - 72 * 3_600_000, // "joined" 72 h ago
    });
  }

  const seedSettlements = makeSeedSettlements(now);
  const totalRetiredDrops = seedSettlements.reduce((s, x) => s + x.amountDrops, 0);
  const totalLitersOffset = seedSettlements.reduce((s, x) => s + x.litersOffset, 0);

  // Seed the HydroCoin AMM. 10M HYDRO paired against 12M USDC ⇒ start price $1.20.
  // Deduct already-retired drops from the reserve so price reflects seeded history.
  const reserveHydro = 10_000_000 * DROPS_PER_HYDRO - totalRetiredDrops;
  const reserveUSDC  = 12_000_000 * 1_000_000;
  return {
    agents,
    settlements: seedSettlements,
    amm: {
      reserveHydro,
      reserveUSDC,
      k: reserveHydro * reserveUSDC,
      lastPriceUSDC: reserveUSDC / reserveHydro,
      totalRetiredDrops,
      totalLitersOffset,
    },
    bootedAt: now,
    pendingBatch: [],
    pendingTotals: {
      usdc: 0,
      offsetDrops: 0,
      waterMl: 0,
      calls: 0,
      sinceFlushMs: 0,
      lastFlushAt: now,
    },
    lastEvmSettlement: null,
  };
}

export function ledger(): LedgerState {
  if (!globalThis.__x402galLedger) {
    globalThis.__x402galLedger = bootstrap();
  }
  return globalThis.__x402galLedger;
}

// Append a single x402 micro-payment to the pending batch. Debits the agent's
// USDC immediately; XRPL settlement (USDC→HYDRO swap + retire) happens when
// the batch flushes.
export function addToBatch(entry: BatchEntry): { shouldFlush: boolean } {
  const l = ledger();
  const agent = l.agents.get(entry.agentId);
  if (agent) {
    agent.balanceUsdc -= entry.amountUsdc;
    agent.totalLitersOffset += entry.waterMl / 1000;
    agent.totalQueries += 1;
  }
  l.pendingBatch.push(entry);
  l.pendingTotals.usdc += entry.amountUsdc;
  l.pendingTotals.offsetDrops += entry.offsetDrops;
  l.pendingTotals.waterMl += entry.waterMl;
  l.pendingTotals.calls += 1;
  l.pendingTotals.sinceFlushMs = Date.now() - l.pendingTotals.lastFlushAt;
  return { shouldFlush: l.pendingBatch.length >= BATCH_SIZE };
}

// Drain the pending batch. Caller (lib/settlement.ts) is responsible for
// executing the XRPL settlement and writing the resulting Settlement record
// via recordBatchSettlement().
export function drainBatch(): BatchEntry[] {
  const l = ledger();
  const drained = l.pendingBatch;
  l.pendingBatch = [];
  l.pendingTotals = {
    usdc: 0,
    offsetDrops: 0,
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

