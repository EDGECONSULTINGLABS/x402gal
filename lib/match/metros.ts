export type MetroId = "nyc" | "phoenix" | "nova" | "dallas" | "columbus";

export type BBox = [west: number, south: number, east: number, north: number];

export type Metro = {
  id: MetroId;
  name: string;
  /** Center used for fly-to and the default pin. Not a facility. */
  center: [lng: number, lat: number];
  zoom: number;
  bbox: BBox;
};

/**
 * Summit metros. New York is the floor. The other four are the demand markets.
 * Utah is the sixth (see PENDING_METROS) and joins this list once its footprint is confirmed.
 */
export const METROS: readonly Metro[] = [
  {
    id: "nyc",
    name: "New York",
    /** Chelsea — Summit floor, not a facility. */
    center: [-74.006, 40.75],
    zoom: 12,
    bbox: [-74.1, 40.65, -73.85, 40.9],
  },
  {
    id: "phoenix",
    name: "Phoenix",
    center: [-112.074, 33.448],
    zoom: 9,
    bbox: [-113.15, 32.95, -111.45, 34.05],
  },
  {
    id: "nova",
    name: "Northern Virginia",
    center: [-77.488, 39.044],
    zoom: 10,
    bbox: [-77.85, 38.65, -77.0, 39.2],
  },
  {
    id: "dallas",
    name: "Dallas",
    center: [-96.797, 32.776],
    zoom: 9.5,
    bbox: [-97.55, 32.5, -96.5, 33.2],
  },
  {
    id: "columbus",
    name: "Columbus",
    center: [-82.999, 39.961],
    zoom: 10,
    bbox: [-83.3, 39.8, -82.7, 40.2],
  },
];

/**
 * Metros named in the launch spec whose footprint is not yet confirmed.
 * No bbox, no clip, no pin — listed so the choice is visible and honest.
 * Utah: confirm the facility location with Joe before clipping. Do not guess it.
 */
export type PendingMetro = { id: string; name: string; waitingOn: string };

export const PENDING_METROS: readonly PendingMetro[] = [
  {
    id: "utah",
    name: "Utah",
    waitingOn: "Waiting on the confirmed facility location before this metro is clipped.",
  },
];

export function metroById(id: MetroId): Metro {
  const metro = METROS.find((m) => m.id === id);
  if (!metro) throw new Error(`unknown metro: ${id}`);
  return metro;
}

export function pointInBbox(lng: number, lat: number, bbox: BBox): boolean {
  const [west, south, east, north] = bbox;
  return lng >= west && lng <= east && lat >= south && lat <= north;
}

export function metroForPoint(lng: number, lat: number): Metro | null {
  return METROS.find((m) => pointInBbox(lng, lat, m.bbox)) ?? null;
}
