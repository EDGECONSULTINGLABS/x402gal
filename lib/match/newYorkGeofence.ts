import { pointInBbox, type BBox } from "./metros";

/** Manhattan, including Chelsea. Used only for the watershed second panel. */
export const NEW_YORK_GEOFENCE: BBox = [-74.05, 40.68, -73.9, 40.88];

export function isNewYorkGeofencePoint(lng: number, lat: number): boolean {
  return pointInBbox(lng, lat, NEW_YORK_GEOFENCE);
}

/** Rehearsal and Summit preview. Physical GPS is optional. */
export function newYorkGeofenceFromEnv(): boolean {
  if (typeof window !== "undefined") {
    const at = new URLSearchParams(window.location.search).get("at");
    if (at === "nyc" || at === "new-york") return true;
  }
  return process.env.NEXT_PUBLIC_SUMMIT_GEOFENCE === "nyc";
}
