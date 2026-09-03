/** USGS hydrologic unit levels shown in the app. 12 → 10 → 8 on tap. */
export type HucLevel = 8 | 10 | 12;

export type HucUnit = {
  code: string;
  name: string;
  level: HucLevel;
};

/** USGS names for each level. The app and the engineers say the same words. */
export const HUC_LEVEL_NAME: Record<HucLevel, string> = {
  12: "Subwatershed",
  10: "Watershed",
  8: "Subbasin",
};

export type WatershedHit = {
  huc12: HucUnit;
  huc10: HucUnit | null;
  huc8: HucUnit | null;
};

export type AquiferHit = {
  name: string;
  rockType: string | null;
};

export type Facility = {
  name: string;
  operator: string;
  city: string;
  state: string;
  status: string;
  lng: number;
  lat: number;
};

export type FacilityHit = {
  facility: Facility;
  distanceKm: number;
  /** Inside the same HUC12 as the pin. */
  sameSubwatershed: boolean;
};

export type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties: Record<string, unknown> | null;
  geometry: {
    type: "Point" | "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type SelectedLocation = {
  lng: number;
  lat: number;
  label: string;
  source: "metro" | "geocode" | "list" | "map";
};
