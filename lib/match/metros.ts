export type MetroId = "nyc" | "phoenix" | "nova" | "dallas" | "columbus" | "utah";

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
 * Summit metros. New York is the floor. The other five are the demand markets.
 * Utah joined on 2026-09-04 once Joe delivered the Stratos site (Hansel Valley, Box Elder County).
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
  {
    id: "utah",
    name: "Utah",
    /**
     * Hansel Valley, north of the Great Salt Lake. The corridor, not the facility pin — the
     * Stratos Phase 1 site itself is in facilities.geojson (Joe's atlas, 2026-09-04).
     */
    center: [-112.62, 41.76],
    zoom: 9,
    /**
     * Derived, not drawn (engineering review, Zina, 8 Sep 2026): the box around every Utah facility
     * point the workbook itself files under the "Salt Lake City" and "Ogden" markets — 22 rows,
     * Snowville down to Provo (public/match/data/us/datacenters.geojson, `mkt`) — plus the confirmed
     * Stratos Phase 1 site (data/summit/facility-overrides.json), buffered 30 km (0.269° lat,
     * 0.358° lng at 41.1°N). Raw extent −112.710…−111.656, 40.214…41.965. Both the Snowville site
     * and the Salt Lake City cluster are inside. The workbook's other Utah markets (Orem, Santaquin,
     * Delta, Cedar City, St. George) are not this metro and are left out.
     */
    bbox: [-113.07, 39.94, -111.3, 42.23],
  },
];

/**
 * Metros named in the launch spec whose footprint is not yet confirmed.
 * No bbox, no clip, no pin — listed so the choice is visible and honest.
 * Empty since 2026-09-04 (Utah confirmed); kept so the picker can show a pending metro again.
 */
export type PendingMetro = { id: string; name: string; waitingOn: string };

export const PENDING_METROS: readonly PendingMetro[] = [];

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
