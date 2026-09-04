/**
 * Map paint colors. Mirror of app/match/tokens.css (HydroCoin brand tokens);
 * MapLibre paint cannot read CSS variables so the values are repeated here.
 */
export const PAPER = "#0d1117"; // --hc-bg
export const INK = "#e6edf3"; // --hc-text
export const WATER = "#38bdf8"; // --hc-sky-2 — the watershed boundary, loudest thing on screen
export const SUBSURFACE = "#28b0a0"; // --hc-teal — aquifer
export const QUIET = "#94a3b8"; // --hc-text-muted
export const PRIMARY = "#0891b2"; // --hc-primary — facility markers

/**
 * The clay city behind the gate (components/match/ClayCity.tsx). Mirror of the --clay-* tokens.
 * The ground itself is CSS (--clay-ground = the HydroCoin hero gradient); the map canvas is
 * transparent, so only what MapLibre paints is here. No red: Alula, 4 Sep.
 */
export const CLAY = {
  water: "#070e1c", // a step darker than the gradient so the shoreline still reads
  bridge: "#1a3a5c", // the gradient's mid stop; bridges are ground, not building
  building: "#eedccf", // neutral clay
  buildingTall: "#f7ebe1",
  park: "#6f8f5a",
  light: "#fff3ea",
} as const;
