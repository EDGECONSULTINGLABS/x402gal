/**
 * The one legend. Every row is a layer, every layer is a row, and the row IS the toggle
 * (engineering review, Zina, 8 Sep 2026: "nothing on the map that isn't in the legend").
 *
 * Same convention as the HydroCoin certification GIS (gis_prototype MapLegend): a colour swatch or
 * line sample on the left, the layer name on the right. Shared by the legend component and the map
 * so the two cannot disagree about what a key means.
 */
import { CANDIDATE, HUC10, HUC12, HUC8, INK, QUIET, STEWARD, SUBSURFACE, WATER } from "./theme";

export type LayerKey =
  // drawn by us
  | "huc8"
  | "huc10"
  | "huc12"
  | "selected"
  | "aquifer"
  | "facilities"
  | "candidates"
  | "stewardship"
  | "footprint"
  | "radius"
  | "pin"
  | "national"
  // drawn by the basemap style, grouped by what a person would call the line
  | "base-water"
  | "base-boundaries"
  | "base-roads"
  | "base-land";

export type LayerVisibility = Record<LayerKey, boolean>;

export const ALL_VISIBLE: LayerVisibility = {
  huc8: true,
  huc10: true,
  huc12: true,
  selected: true,
  aquifer: true,
  facilities: true,
  candidates: true,
  stewardship: true,
  footprint: true,
  radius: true,
  pin: true,
  national: true,
  "base-water": true,
  "base-boundaries": true,
  "base-roads": true,
  "base-land": true,
};

export type Swatch =
  | { kind: "line"; color: string; width: number; dash?: boolean }
  | { kind: "fill"; color: string; stroke: string }
  | { kind: "hatch"; color: string }
  | { kind: "dot"; color: string; stroke: string }
  | { kind: "ring"; color: string }
  | { kind: "pin" }
  | { kind: "base"; color: string };

export type LegendRow = {
  key: LayerKey;
  label: string;
  /** One quiet line under the label, when the name alone would mislead. */
  note?: string;
  swatch: Swatch;
  /** The map does not draw this row below this zoom (progressive nesting). */
  minZoom?: number;
  /** Metro instrument only, or the 50-state view only. Undefined = both. */
  scope?: "metro" | "national";
};

/** Stroke widths the map uses. Coarser unit = heavier line; the legend samples use the same numbers. */
export const HUC_WIDTH = { huc8: 3, huc10: 2, huc12: 1.1 } as const;
export const HUC_MINZOOM = { huc8: 0, huc10: 8, huc12: 10 } as const;

export const LEGEND_ROWS: LegendRow[] = [
  { key: "huc8", label: "HUC8 subbasin", swatch: { kind: "line", color: HUC8, width: HUC_WIDTH.huc8 }, scope: "metro" },
  {
    key: "huc10",
    label: "HUC10 watershed",
    swatch: { kind: "line", color: HUC10, width: HUC_WIDTH.huc10 },
    minZoom: HUC_MINZOOM.huc10,
    scope: "metro",
  },
  {
    key: "huc12",
    label: "HUC12 subwatershed",
    swatch: { kind: "line", color: HUC12, width: HUC_WIDTH.huc12 },
    minZoom: HUC_MINZOOM.huc12,
    scope: "metro",
  },
  { key: "selected", label: "Selected subwatershed", swatch: { kind: "fill", color: HUC12, stroke: HUC12 }, scope: "metro" },
  { key: "aquifer", label: "Principal aquifer", swatch: { kind: "hatch", color: SUBSURFACE }, scope: "metro" },
  { key: "facilities", label: "Data centers", swatch: { kind: "dot", color: INK, stroke: "#0d1117" }, scope: "metro" },
  {
    key: "candidates",
    label: "Candidate projects",
    note: "None marked public yet",
    swatch: { kind: "ring", color: CANDIDATE },
    scope: "metro",
  },
  { key: "stewardship", label: "Water stewardship", swatch: { kind: "dot", color: STEWARD, stroke: "#0d1117" }, scope: "metro" },
  {
    key: "footprint",
    label: "Project footprint",
    note: "Digitized from a parcel map, not surveyed",
    swatch: { kind: "line", color: INK, width: 1.6, dash: true },
    scope: "metro",
  },
  { key: "radius", label: "Radius ring", swatch: { kind: "line", color: QUIET, width: 1.4, dash: true }, scope: "metro" },
  { key: "pin", label: "Your pin", swatch: { kind: "pin" }, scope: "metro" },
  {
    key: "national",
    label: "Facilities",
    note: "Colour key is in the panel",
    swatch: { kind: "dot", color: WATER, stroke: "#0d1117" },
    scope: "national",
  },
  { key: "base-water", label: "Rivers and lakes", swatch: { kind: "base", color: "#1f2933" } },
  { key: "base-boundaries", label: "State and country lines", swatch: { kind: "base", color: "#4b5563" } },
  { key: "base-roads", label: "Roads and rail", swatch: { kind: "base", color: "#374151" } },
  { key: "base-land", label: "Land use, buildings, names", swatch: { kind: "base", color: "#262f3a" } },
];

/**
 * Which legend row a basemap style layer belongs to, by its OpenMapTiles source-layer. Anything that
 * is not classified stays visible and is not toggled — there should be nothing in that set; the
 * dark style's layers are all covered (checked against tiles.openfreemap.org/styles/dark, 8 Sep 2026).
 */
export function basemapGroup(sourceLayer: string | undefined): LayerKey | null {
  switch (sourceLayer) {
    case "water":
    case "waterway":
    case "water_name":
      return "base-water";
    case "boundary":
      return "base-boundaries";
    case "transportation":
    case "transportation_name":
    case "aeroway":
      return "base-roads";
    case "landuse":
    case "landcover":
    case "park":
    case "building":
    case "place":
    case "poi":
    case "housenumber":
    case "mountain_peak":
    case "aerodrome_label":
      return "base-land";
    default:
      return null;
  }
}
