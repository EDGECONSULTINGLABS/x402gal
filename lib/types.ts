// Core types for the Meraxis water-offset protocol.
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
// Conforms to the spirit of https://www.x402.org/ — version, scheme, asset, amount, recipient, nonce.
export interface PaymentRequirement {
  x402Version: 1;
  scheme: "exact"; // exact-amount scheme, the simplest x402 mode
  network: Chain;
  asset: "HYDRO";
  amountDrops: number; // payable amount in HYDRO drops
  estimatedLiters: number;
  recipient: string; // Meraxis treasury address on `network`
  resource: string; // resource identifier (URL/path)
  description: string;
  nonce: string;
  expiresAt: number;
  facilitator: string; // facilitator URL
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
  agentId: AgentId;
  resource: string;
  amountDrops: number;
  litersOffset: number;
  sourceChain: Chain;
  destChain: Chain;
  wireUtlHash: string; // Wire UTL universal transaction hash
  retirementReceipt: string; // hash of HydroCoin retirement event
  status: SettlementStatus;
  createdAt: number;
  hops: WireHop[]; // route taken across chains
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
