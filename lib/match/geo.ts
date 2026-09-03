import type { GeoJsonFeature, GeoJsonFeatureCollection } from "./types";

type Ring = number[][];

function ringContains(ring: Ring, lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonContains(rings: Ring[], lng: number, lat: number): boolean {
  if (!rings.length || !ringContains(rings[0], lng, lat)) return false;
  for (let i = 1; i < rings.length; i++) {
    if (ringContains(rings[i], lng, lat)) return false;
  }
  return true;
}

export function featureContains(feature: GeoJsonFeature, lng: number, lat: number): boolean {
  const g = feature.geometry;
  if (!g) return false;
  if (g.type === "Polygon") {
    return polygonContains(g.coordinates as Ring[], lng, lat);
  }
  if (g.type === "MultiPolygon") {
    return (g.coordinates as Ring[][]).some((poly) => polygonContains(poly, lng, lat));
  }
  return false;
}

export function findContainingFeature(
  collection: GeoJsonFeatureCollection | null,
  lng: number,
  lat: number
): GeoJsonFeature | null {
  if (!collection) return null;
  for (const feature of collection.features) {
    if (featureContains(feature, lng, lat)) return feature;
  }
  return null;
}

export function findContainingFeatures(
  collection: GeoJsonFeatureCollection | null,
  lng: number,
  lat: number
): GeoJsonFeature[] {
  if (!collection) return [];
  return collection.features.filter((feature) => featureContains(feature, lng, lat));
}

export function propString(props: Record<string, unknown> | null, keys: string[]): string | null {
  if (!props) return null;
  const lookup = new Map(Object.keys(props).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = lookup.get(key.toLowerCase());
    if (!actual) continue;
    const value = props[actual];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

const EARTH_M = 6371000;

export function haversineMeters(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Geodesic circle as a GeoJSON polygon, for the radius overlay. */
export function circlePolygon(
  lng: number,
  lat: number,
  radiusKm: number,
  steps = 64
): GeoJsonFeature {
  const coords: number[][] = [];
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const d = (radiusKm * 1000) / EARTH_M;
  for (let i = 0; i <= steps; i++) {
    const brng = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

export function emptyCollection(): GeoJsonFeatureCollection {
  return { type: "FeatureCollection", features: [] };
}

/** Southwest / northeast corners for MapLibre fitBounds. */
export function featureBounds(
  feature: GeoJsonFeature
): [[number, number], [number, number]] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (coords: unknown) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number") {
      const lng = coords[0] as number;
      const lat = coords[1] as number;
      minX = Math.min(minX, lng);
      maxX = Math.max(maxX, lng);
      minY = Math.min(minY, lat);
      maxY = Math.max(maxY, lat);
      return;
    }
    for (const part of coords) walk(part);
  };
  walk(feature.geometry?.coordinates);
  if (!Number.isFinite(minX)) return null;
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}

export async function loadCollection(url: string): Promise<GeoJsonFeatureCollection> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`);
  const data = (await res.json()) as GeoJsonFeatureCollection;
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    return emptyCollection();
  }
  return data;
}
