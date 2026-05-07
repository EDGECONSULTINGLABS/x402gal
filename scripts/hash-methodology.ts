// Regenerate the methodology hash pinned in lib/footprint.ts.
// Run with: npm run hash:methodology
//
// Mirror the constants from lib/footprint.ts here. If they drift, update the
// printed value into lib/footprint.ts METHODOLOGY_HASH.

import { createHash } from "node:crypto";

const SPEC = "Green Grid WUE v1, boundary-aware split";
const FORMULA =
  "W_site = WUE × [(T_in/1000)*e_in + (T_out/1000)*e_out + e_overhead] × F_boundary";
const REFS = [
  "https://www.thegreengrid.org/system/files/store/WUE_v1.pdf",
  "https://eta-publications.lbl.gov/sites/default/files/2024-12/lbnl-2024-united-states-data-center-energy-usage-report_1.pdf",
  "https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use",
];
const MODEL_DEFAULTS = {
  gpt4_class: { e_in: 0.0002, e_out: 0.0006 },
  small_open: { e_in: 0.0001, e_out: 0.0003 },
  unknown: { e_in: 0.0003, e_out: 0.001 },
};
const WUE_DEFAULTS = { hyperscaler: 0.2, unknown: 0.45 };
const MODE_MULT = { site: 1.0, source: 4.0, lifecycle: 8.0 };

const payload = JSON.stringify({
  spec: SPEC,
  formula: FORMULA,
  refs: REFS,
  MODEL_DEFAULTS,
  WUE_DEFAULTS,
  MODE_MULT,
});
const hash = "sha256:" + createHash("sha256").update(payload).digest("hex");
console.log(hash);
