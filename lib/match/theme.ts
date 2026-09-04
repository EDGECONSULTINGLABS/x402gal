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
 * Ground is Avalanche red — the Summit palette is #FF394A / #E6212F / #B20F2A (avalanchesummit.com,
 * fetched 2026-09-04); the ground sits between the two deep reds so it reads as shadow, not signage.
 */
export const CLAY = {
  ground: "#861323",
  water: "#0b1526",
  building: "#efd9d4", // rose clay — carries the red up the shade sides
  buildingTall: "#f9ece8",
  park: "#778468", // muted: pure green against the red looked like a flag
  light: "#fff0ee",
} as const;
