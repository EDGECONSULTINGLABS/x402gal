// Economic constants for the Meraxis offset protocol.
//
// Footprint is computed at request time by lib/footprint.ts using the v2
// boundary-aware Green Grid WUE split (Alula spec). HYDRO is denominated in
// US gallons of restored freshwater: 1 HYDRO = 1 gallon. A typical
// GPT-4-class inference is ~0.07 mL ≈ 1.85e-5 HYDRO ≈ 18 drops, which is
// why per-call x402 payments are aggregated into a Wire UTL settlement
// every BATCH_SIZE calls so each on-chain tick is human-visible.

import { ModelTier, InfraTier } from "./footprint";

export const DROPS_PER_HYDRO = 1_000_000;
export const LITERS_PER_GALLON = 3.785411784; // exact, US liquid gallon
export const TREASURY_ADDRESS = "wire1meraxistreasury000000000000000000hydr";
export const FACILITATOR_URL = "/api/x402/verify";

// Settlement batching. x402 micropayments accumulate per resource until the
// batch hits BATCH_SIZE calls or BATCH_FLUSH_MS elapses, then a single
// Wire UTL settlement is emitted with full hop trace.
export const BATCH_SIZE = 100;
export const BATCH_FLUSH_MS = 60_000;

// Convert site water (liters) to HYDRO drops at the protocol denomination.
export function litersToDrops(liters: number): number {
  return Math.round((liters / LITERS_PER_GALLON) * DROPS_PER_HYDRO);
}
export function dropsToLiters(drops: number): number {
  return (drops / DROPS_PER_HYDRO) * LITERS_PER_GALLON;
}

// Per-resource defaults for footprint calc. Token counts here are typical
// expected sizes; the client may pass tokens_in/tokens_out to override.
export interface ResourceDefaults {
  description: string;
  model_tier: ModelTier;
  infra_tier: InfraTier;
  tokens_in_default: number;
  tokens_out_default: number;
  e_overhead_kwh?: number; // fixed per-request overhead (e.g. image/video pipeline)
}

export const RESOURCE_DEFAULTS: Record<string, ResourceDefaults> = {
  "/api/ai/chat": {
    description: "LLM chat completion (GPT-4 class)",
    model_tier: "gpt4_class",
    infra_tier: "hyperscaler",
    tokens_in_default: 200,
    tokens_out_default: 500,
  },
  "/api/ai/embed": {
    description: "Text embedding (1536-dim)",
    model_tier: "small_open",
    infra_tier: "hyperscaler",
    tokens_in_default: 512,
    tokens_out_default: 0,
  },
  "/api/ai/image": {
    description: "Image generation (1024×1024)",
    model_tier: "gpt4_class",
    infra_tier: "hyperscaler",
    tokens_in_default: 80,
    tokens_out_default: 0,
    e_overhead_kwh: 0.0024, // diffusion pipeline overhead
  },
  "/api/ai/video": {
    description: "Video generation (5s clip)",
    model_tier: "gpt4_class",
    infra_tier: "hyperscaler",
    tokens_in_default: 80,
    tokens_out_default: 0,
    e_overhead_kwh: 0.040, // sora-class video pipeline overhead
  },
};

export const SEED_AGENTS = [
  { id: "agent_meridian_v3", label: "Meridian-v3", operator: "Anthropic Mesh", chain: "base", balanceDrops: 240_000_000 },
  { id: "agent_solace_alpha", label: "Solace-α", operator: "Helix Labs", chain: "solana", balanceDrops: 180_000_000 },
  { id: "agent_orin_x7", label: "Orin-x7", operator: "OpenForge", chain: "ethereum", balanceDrops: 95_000_000 },
  { id: "agent_kairo_pro", label: "Kairo-Pro", operator: "Drift Robotics", chain: "polygon", balanceDrops: 320_000_000 },
] as const;
