export type HucLevel = 6 | 8 | 10 | 12;

export type HucUnit = {
  code: string;
  name: string;
  level: HucLevel;
};

export type WatershedHit = {
  huc12: HucUnit;
  huc10: HucUnit | null;
  huc8: HucUnit | null;
  huc6: HucUnit | null;
};

export type AquiferHit = {
  name: string;
  rockType: string | null;
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
