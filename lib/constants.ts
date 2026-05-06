// Economic constants for the Meraxis offset protocol.
//
// Real-world calibration: a single GPT-4-class query is estimated to consume
// roughly 0.5 L of freshwater (cooling + power generation), per the
// 2023 UC Riverside study "Making AI Less Thirsty" (Li et al.).
// Meraxis prices each query at exactly its water footprint, paid in HYDRO.

export const DROPS_PER_HYDRO = 1_000_000;
export const LITERS_PER_HYDRO = 1; // 1 HYDRO retired = 1 L restored freshwater
export const TREASURY_ADDRESS = "wire1meraxistreasury000000000000000000hydr";
export const FACILITATOR_URL = "/api/x402/verify";

// Per-resource water cost (liters). Multiply by 1 HYDRO to get drops owed.
export const RESOURCE_COSTS: Record<string, { liters: number; description: string }> = {
  "/api/ai/chat": { liters: 0.52, description: "LLM chat completion (GPT-4 class)" },
  "/api/ai/embed": { liters: 0.04, description: "Text embedding (1536-dim)" },
  "/api/ai/image": { liters: 2.9, description: "Image generation (1024×1024)" },
  "/api/ai/video": { liters: 38.0, description: "Video generation (5s clip)" },
};

export const SEED_AGENTS = [
  { id: "agent_meridian_v3", label: "Meridian-v3", operator: "Anthropic Mesh", chain: "base", balanceDrops: 240_000_000 },
  { id: "agent_solace_alpha", label: "Solace-α", operator: "Helix Labs", chain: "solana", balanceDrops: 180_000_000 },
  { id: "agent_orin_x7", label: "Orin-x7", operator: "OpenForge", chain: "ethereum", balanceDrops: 95_000_000 },
  { id: "agent_kairo_pro", label: "Kairo-Pro", operator: "Drift Robotics", chain: "polygon", balanceDrops: 320_000_000 },
] as const;
