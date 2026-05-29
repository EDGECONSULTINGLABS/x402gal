// Core types for the x402GAL water-offset protocol.
//
// Agents pay in USDC via x402. Micro-payments batch; on flush the treasury
// swaps the accumulated USDC for HydroCoin (HYDRO) and retires it on XRPL
// as a verifiable water-restoration credit. HYDRO is denominated in "drops"
// (1 HYDRO = 1_000_000 drops); 1 HYDRO = 1 US gallon of restored freshwater.

export type Chain = "base" | "solana" | "ethereum" | "polygon" | "xrpl" | "avalanche";

export type AgentId = string; // e.g. "agent_meridian_v3"
export type TxId = string;
export type SettlementId = string;

export interface Agent {
  id: AgentId;
  label: string;
  operator: string;
  chain: Chain;
  walletAddress: string;
  balanceUsdc: number; // agent's spendable balance in micro-USDC (6 decimals)
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
  network: Chain; // settlement network; XRPL is the retirement registry
  asset: "USDC"; // agents pay in USDC; HYDRO is the downstream retirement unit
  amountUsdc: number; // payable amount in micro-USDC (6 decimals)
  offsetHydroDrops: number; // HYDRO drops to be retired on XRPL for this call
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
  asset: "USDC";
  amountUsdc: number; // micro-USDC the agent is paying
  offsetHydroDrops: number; // HYDRO drops this payment will retire on XRPL
  payer: AgentId;
  recipient: string;
  nonce: string;
  signature: string; // ed25519-style stub signature
  sourceChain: Chain; // the chain the agent's wallet lives on
}

export type SettlementStatus = "pending" | "settled" | "retired" | "failed";

export interface Settlement {
  id: SettlementId;
  txId: TxId;
  agentId: AgentId | "batch"; // "batch" when this settlement aggregates many agents
  resource: string;
  usdcSettled: number; // micro-USDC collected from x402 payments
  amountDrops: number; // HYDRO drops retired on XRPL against the water credit
  litersOffset: number;
  callCount: number; // number of x402 calls aggregated into this settlement
  sourceChain: Chain;
  settlementHash: string; // XRPL transaction hash (USDC→HYDRO swap)
  retirementReceipt: string; // XRPL transaction hash (HYDRO retire)
  status: SettlementStatus;
  createdAt: number;
  hops: XrplHop[]; // XRPL settlement hops (swap + retire)
  methodologyHash: string; // pinned footprint methodology version
}

// One x402 call buffered into the next batch settlement.
export interface BatchEntry {
  agentId: AgentId;
  resource: string;
  amountUsdc: number; // micro-USDC paid for this call
  offsetDrops: number; // HYDRO drops to retire for this call
  waterMl: number;
  sourceChain: Chain;
  nonce: string;
  ts: number;
}

export interface XrplHop {
  chain: Chain;
  action: "swap" | "burn" | "retire";
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
