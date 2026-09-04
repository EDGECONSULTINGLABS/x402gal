/**
 * The 50-state data center layer (Master_50State_DataCenters_All_Locations.xlsx), all 3,000+ rows.
 * Built by scripts/build-datacenters.ts into public/match/data/us/. Shared by the build and the UI.
 *
 * This is the national, browse-everything companion to the per-metro facilities.geojson (which stays
 * street-level-only for the watershed instrument). Here every row is placed — at the address when
 * we can, at the city or market centre when the workbook says "(exact address not public)" — so the
 * counts per state are the workbook's counts, and every facility can be found by name.
 */
import type { Placement } from "./esg";
import type { GeoJsonFeatureCollection } from "./types";

export { PLACEMENTS, type Placement } from "./esg";

/** The workbook's 20 spellings of Status, folded into five. Raw text is kept on the card. */
export const STATUSES = ["Active", "Expanding", "Building", "Planned", "Inactive"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS: Record<Status, { label: string; meaning: string; color: string }> = {
  Active: { label: "Active", meaning: "Operating today", color: "#38bdf8" },
  Expanding: { label: "Expanding", meaning: "Operating, with more under way", color: "#28b0a0" },
  Building: { label: "Under construction", meaning: "Being built or developed", color: "#fbbf24" },
  Planned: { label: "Planned", meaning: "Announced or proposed", color: "#c084fc" },
  Inactive: { label: "Inactive", meaning: "Closed, cancelled, or for sale", color: "#94a3b8" },
};

export function statusOf(raw: string): Status {
  const v = raw.trim().toLowerCase();
  if (!v) return "Active";
  if (/cancel|inactive|closed/.test(v)) return "Inactive";
  if (/^active/.test(v)) {
    if (/for sale/.test(v)) return "Inactive";
    return /expand|develop|construction|proposed|planned/.test(v) ? "Expanding" : "Active";
  }
  if (/construction|development/.test(v)) return "Building";
  if (/planned|proposed/.test(v)) return "Planned";
  return "Active";
}

/** GeoJSON feature properties written by the build. Short keys: 3,000+ rows ship to the phone. */
export type DcProps = {
  id: string;
  n: string; // name
  o: string; // operator
  city: string;
  st: string;
  mkt: string; // market
  s: Status;
  raw: string; // status as written
  p: Placement | "market";
  /** 1 when the workbook says the exact address is not public. */
  np?: 1;
};

export type DcSite = {
  id: string;
  name: string;
  operator: string;
  city: string;
  st: string;
  market: string;
  status: Status;
  statusRaw: string;
  placement: Placement | "market";
  addressNotPublic: boolean;
  lng: number;
  lat: number;
};

export type DcSummary = {
  built: string;
  facilities: number;
  operators: number;
  states: number;
  byState: { state: string; st: string; listed: number; placed: number; byStatus: Record<Status, number> }[];
  byOperator: { operator: string; facilities: number; states: string }[];
  byMarket: { market: string; state: string; st: string; listed: number }[];
  byStatus: Record<Status, number>;
  byPlacement: Record<Placement | "market", number>;
  addressNotPublic: number;
  unplaced: { name: string; operator: string; city: string; st: string; reason: string }[];
};

export function isApproximate(p: DcSite["placement"]): boolean {
  return p === "city" || p === "market";
}

export function dcPlacementNote(site: DcSite): string | null {
  if (site.placement === "city") {
    return `Approximate — placed at the centre of ${site.city}. ${site.addressNotPublic ? "The operator does not publish this address." : "No confirmed street address in the workbook."}`;
  }
  if (site.placement === "market") {
    return `Approximate — placed at the centre of the ${site.market} market. ${site.addressNotPublic ? "The operator does not publish this address." : "No confirmed street address in the workbook."}`;
  }
  return null;
}

export function dcSitesFrom(col: GeoJsonFeatureCollection | null): DcSite[] {
  if (!col) return [];
  const out: DcSite[] = [];
  for (const f of col.features) {
    if (f.geometry?.type !== "Point") continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const p = (f.properties ?? {}) as Partial<DcProps>;
    out.push({
      id: String(p.id ?? ""),
      name: String(p.n ?? ""),
      operator: String(p.o ?? ""),
      city: String(p.city ?? ""),
      st: String(p.st ?? ""),
      market: String(p.mkt ?? ""),
      status: (STATUSES as readonly string[]).includes(String(p.s)) ? (p.s as Status) : "Active",
      statusRaw: String(p.raw ?? ""),
      placement: (p.p as DcSite["placement"]) ?? "census",
      addressNotPublic: p.np === 1,
      lng,
      lat,
    });
  }
  return out;
}

/** The filter the panel and the map agree on. */
export type DcView = {
  statuses: readonly Status[];
  st: string | null;
  operator: string | null;
  market: string | null;
  selectedId: string | null;
};

export function dcMatches(s: DcSite, v: DcView): boolean {
  return (
    v.statuses.includes(s.status) &&
    (!v.st || s.st === v.st) &&
    (!v.operator || s.operator === v.operator) &&
    (!v.market || s.market === v.market)
  );
}

/** MapLibre filter expression equivalent of dcMatches, split by approximate/exact for the two layers. */
export function dcFilterExpr(v: DcView | null, approximate: boolean): unknown[] {
  const parts: unknown[] = [
    approximate ? ["in", ["get", "p"], ["literal", ["city", "market"]]] : ["!", ["in", ["get", "p"], ["literal", ["city", "market"]]]],
  ];
  if (v) {
    parts.push(["in", ["get", "s"], ["literal", [...v.statuses]]]);
    if (v.st) parts.push(["==", ["get", "st"], v.st]);
    if (v.operator) parts.push(["==", ["get", "o"], v.operator]);
    if (v.market) parts.push(["==", ["get", "mkt"], v.market]);
  }
  return ["all", ...parts];
}

export const DC_COLOR_EXPR: unknown[] = ["match", ["get", "s"], ...STATUSES.flatMap((s) => [s, STATUS[s].color]), STATUS.Active.color];

/** Case-insensitive substring search over name and operator; operator matches rank first. */
export function searchDc(sites: DcSite[], raw: string, limit = 8): DcSite[] {
  const q = raw.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: { s: DcSite; rank: number }[] = [];
  for (const s of sites) {
    const n = s.name.toLowerCase();
    const o = s.operator.toLowerCase();
    if (n.startsWith(q) || o.startsWith(q)) out.push({ s, rank: 0 });
    else if (n.includes(q) || o.includes(q)) out.push({ s, rank: 1 });
  }
  return out.sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name)).slice(0, limit).map((x) => x.s);
}
