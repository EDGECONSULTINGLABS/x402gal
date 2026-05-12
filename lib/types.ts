// Core types for the 402GAL water-offset protocol.
// HydroCoin (HYDRO) is denominated in "drops" (1 HYDRO = 1_000_000 drops, like satoshis).
// Each HYDRO retired offsets 1 liter of restored freshwater, audited via Wire UTL receipts.

export type Chain = "wire-utl" | "base" | "solana" | "ethereum" | "polygon";

export type AgentId = string; // e.g. "agent_meridian_v3"
export type TxId = string;
export type SettlementId = string;

export interface Agent {
  id: AgentId;
  label: string;
  operator: string;
  chain: Chain;
  walletAddress: string;
  balanceDrops: number;
  totalLitersOffset: number;
  totalQueries: number;
  joinedAt: number;
}

// x402-style payment requirement returned with HTTP 402.
// Conforms to the spirit of https://www.x402.org/ — version, scheme, asset,
// amount, recipient, nonce — plus a 402GAL-specific `footprint` block
// describing the v2 Green Grid WUE methodology used to compute the price.
export interface PaymentRequirement {
  x402Version: 1;
  scheme: "exact"; // exact-amount scheme, the simplest x402 mode
  network: Chain;
  asset: "HYDRO";
  amountDrops: number; // payable amount in HYDRO drops (1 HYDRO = 1 gallon)
  estimatedLiters: number; // site water in liters
  estimatedMl: number; // same in mL, for human readability at small scales
  recipient: string; // 402GAL treasury address on `network`
  resource: string; // resource identifier (URL/path)
  description: string;
  nonce: string;
  expiresAt: number;
  facilitator: string; // facilitator URL
  footprint: FootprintBlock; // v2 boundary-aware methodology block
}

// Methodology + inputs surfaced inside the 402 response so the client (or a
// third-party auditor) can independently re-derive the amount.
export interface FootprintBlock {
  mode: "site" | "source" | "lifecycle";
  water_l: number;
  water_ml: number;
  inputs: {
    tokens_in: number;
    tokens_out: number;
    e_in_kwh_per_1k: number;
    e_out_kwh_per_1k: number;
    wue_l_per_kwh: number;
    boundary_factor: number;
    pue: number | null;
    energy_it_kwh: number;
  };
  methodology: {
    spec: string;
    formula: string;
    mode_multiplier: number;
    refs: string[];
    methodology_hash: string;
  };
  uncertainty: { p10_ml: number; p90_ml: number; band: string };
}

// Payment payload sent back by the agent in the X-PAYMENT header (base64 JSON).
export interface PaymentPayload {
  x402Version: 1;
  scheme: "exact";
  network: Chain;
  asset: "HYDRO";
  amountDrops: number;
  payer: AgentId;
  recipient: string;
  nonce: string;
  signature: string; // ed25519-style stub signature
  routedVia: "wire-utl"; // every payment is settled through Wire's Universal Transaction Layer
  sourceChain: Chain; // the chain the agent's wallet lives on
}

export type SettlementStatus = "routed" | "settled" | "retired" | "failed";

export interface Settlement {
  id: SettlementId;
  txId: TxId;
  agentId: AgentId | "batch"; // "batch" when this settlement aggregates many agents
  resource: string;
  amountDrops: number;
  litersOffset: number;
  callCount: number; // number of x402 calls aggregated into this settlement
  sourceChain: Chain;
  destChain: Chain;
  wireUtlHash: string; // Wire UTL universal transaction hash
  retirementReceipt: string; // hash of HydroCoin retirement event
  status: SettlementStatus;
  createdAt: number;
  hops: WireHop[]; // route taken across chains
  methodologyHash: string; // pinned footprint methodology version
}

// One x402 call buffered into the next batch settlement.
export interface BatchEntry {
  agentId: AgentId;
  resource: string;
  amountDrops: number;
  waterMl: number;
  sourceChain: Chain;
  nonce: string;
  ts: number;
}

export interface WireHop {
  chain: Chain;
  action: "lock" | "mint" | "swap" | "burn" | "retire";
  hash: string;
  ms: number;
}

export interface AmmState {
  reserveHydro: number; // drops
  reserveUSDC: number; // 6-decimal micro-USDC
  k: number;
  lastPriceUSDC: number; // USDC per HYDRO
  totalRetiredDrops: number;
  totalLitersOffset: number;
}
