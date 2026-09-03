declare module "shapefile" {
  type Feature = {
    type: "Feature";
    properties: Record<string, unknown> | null;
    geometry: { type: string; coordinates: unknown } | null;
  };
  export function read(shp: string, dbf?: string): Promise<{
    type: "FeatureCollection";
    features: Feature[];
  }>;
  /** Streaming reader. A missing .dbf yields features with empty properties. */
  export function open(
    shp: string,
    dbf?: string,
    options?: { encoding?: string }
  ): Promise<{
    bbox: [number, number, number, number];
    read(): Promise<{ done: boolean; value: Feature }>;
    cancel(): Promise<void>;
  }>;
}

declare module "mapshaper" {
  export function applyCommands(
    commands: string,
    input?: Record<string, string | Uint8Array | object>
  ): Promise<Record<string, string | Uint8Array>>;
}
