/**
 * Map paint colors. Mirror of app/match/tokens.css (HydroCoin brand tokens);
 * MapLibre paint cannot read CSS variables so the values are repeated here.
 */
export const PAPER = "#0d1117"; // --hc-bg
export const INK = "#e6edf3"; // --hc-text
export const WATER = "#38bdf8"; // --hc-sky-2 — the pin ring and the footprint water source
export const SUBSURFACE = "#28b0a0"; // --hc-teal — aquifer
export const QUIET = "#94a3b8"; // --hc-text-muted
export const PRIMARY = "#0891b2"; // --hc-primary — facility markers
/** Hydrologic-unit strokes — see the provenance note on --huc8/10/12 in tokens.css. */
export const HUC12 = "#22c55e"; // --huc12
export const HUC10 = "#f97316"; // --huc10
export const HUC8 = "#a855f7"; // --huc8
export const STEWARD = "#a8e8e0"; // --steward (--hc-pale)
export const CANDIDATE = "#2bb7c8"; // --candidate (--hc-accent)
// The gate's water surface (components/match/WaterSurface.tsx) reads WATER and PAPER from here too.
