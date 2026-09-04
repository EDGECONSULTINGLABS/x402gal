/**
 * The 50-state ESG / water-goal company layer (Master_50State_ESG_Companies_All_Locations.xlsx).
 * One point per facility row, coloured by the workbook's Fit Category (Legend tab).
 * Built by scripts/build-esg.ts into public/match/data/us/. Shared by the build and the UI.
 *
 * Decision 2026-09-04 (Alula): every facility in the workbook goes on the map, categorised by
 * Fit Category. This supersedes the stewardship rule that columns J/K are never read — for THIS
 * layer only. Column M (Notes: "verify before outreach" etc.) and column J (fit rationale prose)
 * still never ship; the category (K) does.
 */
import type { GeoJsonFeatureCollection } from "./types";

export const FIT_CATEGORIES = ["HydroCoin", "Parjana", "x402gal", "Multiple", "Other"] as const;
export type FitCategory = (typeof FIT_CATEGORIES)[number];

/** Legend tab, verbatim meaning; colour follows the KMZ pin colour on the dark map. */
export const FIT: Record<FitCategory, { label: string; meaning: string; color: string }> = {
  HydroCoin: { label: "HydroCoin", meaning: "Verified-gallon water credits", color: "#38bdf8" },
  Parjana: { label: "Parjana / IRIS", meaning: "Stormwater infiltration hardware", color: "#34d399" },
  x402gal: { label: "x402gal", meaning: "Usage-based payment rail", color: "#c084fc" },
  Multiple: { label: "Multiple fits", meaning: "Strongest combined leads", color: "#f87171" },
  Other: { label: "Other", meaning: "Special case, not a typical buyer", color: "#e6edf3" },
};

export function fitCategory(raw: string): FitCategory {
  const v = raw.trim().toLowerCase();
  if (v.startsWith("hydro")) return "HydroCoin";
  if (v.startsWith("parjana")) return "Parjana";
  if (v.startsWith("x402")) return "x402gal";
  if (v.startsWith("multi")) return "Multiple";
  return "Other";
}

/** GeoJSON feature properties written by the build. Keep flat: MapLibre filters read them. */
export type EsgProps = {
  id: string;
  company: string;
  facility: string;
  sector: string;
  goal: string;
  fit: FitCategory;
  state: string; // full name
  st: string; // two-letter code
  city: string;
  source: string;
  /**
   * How the point was placed, most to least precise:
   *   census    street-level US Census match
   *   osm       OpenStreetMap building / campus object (never a road interpolation)
   *   override  cited authoritative record (data/summit/esg-overrides.json)
   *   city      centre of the listed city — the workbook has no usable street address.
   *             Drawn as a hollow ring and captioned as approximate.
   */
  placement: Placement;
};

export const PLACEMENTS = ["census", "osm", "override", "city"] as const;
export type Placement = (typeof PLACEMENTS)[number];
export const APPROXIMATE: Placement = "city";

export function placementNote(p: Placement, city: string): string | null {
  return p === "city" ? `Approximate — placed at the centre of ${city}. The workbook has no confirmed street address.` : null;
}

export type EsgSite = EsgProps & { lng: number; lat: number };

export type EsgSummary = {
  built: string;
  facilities: number;
  companies: number;
  states: number;
  /** Summary by State tab, plus how many of each state's rows placed on the map. */
  byState: { state: string; st: string; listed: number; companies: number; placed: number }[];
  /** Summary by Company tab. */
  byCompany: { company: string; facilities: number; states: string; fit: FitCategory; placed: number }[];
  byFit: Record<FitCategory, number>;
  byPlacement: Record<Placement, number>;
  /** Rows placed only at city centre — the list to take back to the workbook owner. */
  approximate: { company: string; facility: string; city: string; st: string; reason: string }[];
  /** Rows that could not be placed at all (no city match either). */
  unplaced: { company: string; facility: string; city: string; st: string; reason: string }[];
};

export function esgSitesFrom(col: GeoJsonFeatureCollection | null): EsgSite[] {
  if (!col) return [];
  const out: EsgSite[] = [];
  for (const f of col.features) {
    if (f.geometry?.type !== "Point") continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const p = (f.properties ?? {}) as Partial<EsgProps>;
    out.push({
      id: String(p.id ?? ""),
      company: String(p.company ?? ""),
      facility: String(p.facility ?? ""),
      sector: String(p.sector ?? ""),
      goal: String(p.goal ?? ""),
      fit: (p.fit as FitCategory) ?? "Other",
      state: String(p.state ?? ""),
      st: String(p.st ?? ""),
      city: String(p.city ?? ""),
      source: String(p.source ?? ""),
      placement: (PLACEMENTS as readonly string[]).includes(String(p.placement)) ? (p.placement as Placement) : "census",
      lng,
      lat,
    });
  }
  return out;
}

export type BBox = [number, number, number, number];

/** Lower 48 default camera. Alaska and Hawaii come in through the state filter. */
export const CONUS_BBOX: BBox = [-124.8, 24.4, -66.9, 49.4];

export function bboxOf(sites: { lng: number; lat: number }[]): BBox | null {
  if (!sites.length) return null;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of sites) {
    if (p.lng < w) w = p.lng;
    if (p.lng > e) e = p.lng;
    if (p.lat < s) s = p.lat;
    if (p.lat > n) n = p.lat;
  }
  // A single point (or a tight cluster) still needs a box the camera can fit.
  const pad = 0.15;
  if (e - w < pad) { w -= pad; e += pad; }
  if (n - s < pad) { s -= pad; n += pad; }
  return [w, s, e, n];
}

/** Well-formed source URL → hostname for display; anything else → the raw string trimmed. */
export function sourceHost(src: string): string {
  const v = src.trim();
  if (!v) return "";
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, "");
  } catch {
    return v.split("/")[0];
  }
}

export function sourceHref(src: string): string | null {
  const v = src.trim();
  if (!v || /\s/.test(v)) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
