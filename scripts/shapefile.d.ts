declare module "shapefile" {
  export function read(shp: string, dbf?: string): Promise<{
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: Record<string, unknown> | null;
      geometry: { type: string; coordinates: unknown } | null;
    }>;
  }>;
}
