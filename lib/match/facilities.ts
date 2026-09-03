import { featureContains, haversineMeters, propString } from "./geo";
import type { MetroId } from "./metros";
import type { Facility, FacilityHit, GeoJsonFeature, GeoJsonFeatureCollection } from "./types";

export function facilitiesFrom(collection: GeoJsonFeatureCollection | null): Facility[] {
  if (!collection) return [];
  const out: Facility[] = [];
  for (const f of collection.features) {
    if (f.geometry?.type !== "Point") continue;
    const [lng, lat] = f.geometry.coordinates as [number, number];
    const name = propString(f.properties, ["name"]);
    if (!name || !Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    out.push({
      name,
      operator: propString(f.properties, ["operator"]) ?? "",
      city: propString(f.properties, ["city"]) ?? "",
      state: propString(f.properties, ["state"]) ?? "",
      status: propString(f.properties, ["status"]) ?? "",
      lng,
      lat,
    });
  }
  return out;
}

/**
 * Facilities within the radius, nearest first, flagged when they share the pin's HUC12.
 * Pure geometry on loaded data. No network.
 */
export function nearbyFacilities(
  facilities: Facility[],
  lng: number,
  lat: number,
  radiusKm: number,
  subwatershed: GeoJsonFeature | null
): FacilityHit[] {
  const hits: FacilityHit[] = [];
  for (const facility of facilities) {
    const distanceKm = haversineMeters(lng, lat, facility.lng, facility.lat) / 1000;
    if (distanceKm > radiusKm) continue;
    hits.push({
      facility,
      distanceKm,
      sameSubwatershed: subwatershed ? featureContains(subwatershed, facility.lng, facility.lat) : false,
    });
  }
  return hits.sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Compact index written by scripts/build-facilities.ts for typed input. */
export type FacilityIndexEntry = { n: string; o: string; m: MetroId; c: [number, number] };

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Sloppy name lookup against the facility index. Substring of name or operator,
 * all typed words must appear. Returns hits nearest to an exact name match first.
 */
export function searchFacilityIndex(index: FacilityIndexEntry[], raw: string, limit = 6): FacilityIndexEntry[] {
  const q = norm(raw);
  if (q.length < 3) return [];
  const words = q.split(" ").filter(Boolean);
  const scored: { e: FacilityIndexEntry; score: number }[] = [];
  for (const e of index) {
    const name = norm(e.n);
    const op = norm(e.o);
    const hay = `${name} ${op}`;
    if (!words.every((w) => hay.includes(w))) continue;
    let score = 0;
    if (name === q) score += 100;
    else if (name.startsWith(q)) score += 60;
    else if (name.includes(q)) score += 40;
    else if (op === q || op.startsWith(q)) score += 30;
    else score += 10;
    scored.push({ e, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.e.n.localeCompare(b.e.n))
    .slice(0, limit)
    .map((s) => s.e);
}
