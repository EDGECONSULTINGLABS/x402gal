// Meraxis Footprint Model — v2 (Alula spec, 2026-05).
//
// Boundary-aware split that fixes two flaws in v1:
//   (1) v1 multiplied a measured site WUE by a separate cooling multiplier,
//       double-counting cooling, and
//   (2) v1 mixed Green Grid WUE (defined against IT energy) with raw GPU or
//       facility energy, baking PUE in twice.
//
//   W_site = WUE_site × [(T_in/1000)*e_in + (T_out/1000)*e_out + e_overhead]
//
// Defaults sourced from: Microsoft FY25 (WUE 0.27), Meta 2024 (0.19), AWS
// 2024 (0.15), LBNL 2024 hyperscale median (0.32), AI-specialized median
// (0.61); energy intensity from Epoch AI GPT-4o estimate (~0.0006 kWh/1K
// output tokens), TokenPowerBench, IEEE Access Pythia measurements.

import { createHash } from "crypto";

export type ModelTier = "gpt4_class" | "small_open" | "unknown";
export type InfraTier = "hyperscaler" | "unknown";
export type FootprintMode = "site" | "source" | "lifecycle";

interface Defaults {
  e_in: number; // kWh per 1K input tokens
  e_out: number; // kWh per 1K output tokens
}

const MODEL_DEFAULTS: Record<ModelTier, Defaults> = {
  gpt4_class: { e_in: 0.0002, e_out: 0.0006 },
  small_open: { e_in: 0.0001, e_out: 0.0003 },
  unknown: { e_in: 0.0003, e_out: 0.0010 },
};

const WUE_DEFAULTS: Record<InfraTier, number> = {
  hyperscaler: 0.20, // L/kWh
  unknown: 0.45, // L/kWh
};

// Multipliers for source/lifecycle modes (rough — refine later).
const MODE_MULT: Record<FootprintMode, number> = {
  site: 1.0,
  source: 4.0, // ~3–5× site, midpoint
  lifecycle: 8.0, // very rough, document as informational
};

export interface CalcInput {
  tokens_in: number;
  tokens_out: number;
  model_tier?: ModelTier;
  infra_tier?: InfraTier;
  mode?: FootprintMode;
  // Overrides — if metered telemetry is available
  e_in_kwh_per_1k?: number;
  e_out_kwh_per_1k?: number;
  wue_l_per_kwh?: number;
  energy_kwh_total?: number; // direct energy override, skips per-token math
  boundary_factor?: number; // 1.0 for IT-level, ~1.4 for GPU-only uplift
  pue?: number; // if energy is facility-wide, divide by PUE
  e_overhead_kwh?: number; // fixed per-request kWh, default 0
}

export interface FootprintResult {
  water_l: number;
  water_ml: number;
  mode: FootprintMode;
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
  uncertainty: {
    p10_ml: number;
    p90_ml: number;
    band: string;
  };
}

const REFS = [
  "https://www.thegreengrid.org/system/files/store/WUE_v1.pdf",
  "https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report_1.pdf",
  "https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use",
];

const SPEC = "Green Grid WUE v1, boundary-aware split";
const FORMULA =
  "W_site = WUE × [(T_in/1000)*e_in + (T_out/1000)*e_out + e_overhead] × F_boundary";

// Stable hash over the methodology + numeric defaults so a verifier can pin
// this revision exactly. Any change to constants/refs changes the hash.
const METHODOLOGY_HASH = (() => {
  const payload = JSON.stringify({
    spec: SPEC,
    formula: FORMULA,
    refs: REFS,
    MODEL_DEFAULTS,
    WUE_DEFAULTS,
    MODE_MULT,
  });
  return "sha256:" + createHash("sha256").update(payload).digest("hex");
})();

export function calculateFootprint(input: CalcInput): FootprintResult {
  const mode = input.mode ?? "site";
  const model = input.model_tier ?? "gpt4_class";
  const infra = input.infra_tier ?? "hyperscaler";

  const e_in = input.e_in_kwh_per_1k ?? MODEL_DEFAULTS[model].e_in;
  const e_out = input.e_out_kwh_per_1k ?? MODEL_DEFAULTS[model].e_out;
  const wue = input.wue_l_per_kwh ?? WUE_DEFAULTS[infra];
  const F = input.boundary_factor ?? 1.0;
  const pue = input.pue ?? null;
  const overhead = input.e_overhead_kwh ?? 0;

  // Energy at IT boundary.
  let E_IT_kwh: number;
  if (input.energy_kwh_total != null) {
    E_IT_kwh = pue ? input.energy_kwh_total / pue : input.energy_kwh_total * F;
  } else {
    const e_kwh =
      (input.tokens_in / 1000) * e_in +
      (input.tokens_out / 1000) * e_out +
      overhead;
    E_IT_kwh = e_kwh * F;
  }

  // Site water in liters; mode multiplier expands the boundary if requested.
  const W_site_l = wue * E_IT_kwh;
  const W_l = W_site_l * MODE_MULT[mode];
  const W_ml = W_l * 1000;

  // Coarse uncertainty band: ±2× for hyperscaler+gpt4, ±3-10× otherwise.
  const tightBand = model === "gpt4_class" && infra === "hyperscaler";
  const p10 = tightBand ? W_ml * 0.6 : W_ml * 0.3;
  const p90 = tightBand ? W_ml * 1.6 : W_ml * 3.0;

  return {
    water_l: W_l,
    water_ml: W_ml,
    mode,
    inputs: {
      tokens_in: input.tokens_in,
      tokens_out: input.tokens_out,
      e_in_kwh_per_1k: e_in,
      e_out_kwh_per_1k: e_out,
      wue_l_per_kwh: wue,
      boundary_factor: F,
      pue,
      energy_it_kwh: E_IT_kwh,
    },
    methodology: {
      spec: SPEC,
      formula: FORMULA,
      mode_multiplier: MODE_MULT[mode],
      refs: REFS,
      methodology_hash: METHODOLOGY_HASH,
    },
    uncertainty: {
      p10_ml: p10,
      p90_ml: p90,
      band: tightBand ? "factor_of_2" : "factor_of_3_to_10",
    },
  };
}

export const FOOTPRINT_REFS = REFS;
export const FOOTPRINT_METHODOLOGY_HASH = METHODOLOGY_HASH;
