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
 * The ground itself is CSS (--clay-ground: HydroCoin navy → Avalanche red); the map canvas is
 * transparent, so only what MapLibre paints is here. Summit palette: #FF394A / #E6212F / #B20F2A
 * (avalanchesummit.com, fetched 2026-09-04).
 */
export const CLAY = {
  water: "#070e1c", // a step darker than the navy end of the ground so the shoreline still reads
  bridge: "#3a1a2c", // between the ground's two ends; bridges are ground, not building
  building: "#efd9d4", // rose clay — carries the red up the shade sides
  buildingTall: "#f9ece8",
  park: "#778468", // muted: pure green against the red looked like a flag
  light: "#fff0ee",
} as const;
