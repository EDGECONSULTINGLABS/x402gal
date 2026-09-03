import { findContainingFeature, findContainingFeatures, propString } from "./geo";
import type {
  AquiferHit,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  HucLevel,
  HucUnit,
  WatershedHit,
} from "./types";

function unitFromFeature(feature: GeoJsonFeature, level: HucLevel): HucUnit | null {
  const code = propString(feature.properties, [`huc${level}`, "huc12", "huc10", "huc8", "huc6"]);
  const name = propString(feature.properties, ["name", "hu_name", "huname"]);
  if (!code) return null;
  return { code, name: name ?? code, level };
}

function unitFromCode(
  collection: GeoJsonFeatureCollection | null,
  code: string,
  level: HucLevel
): HucUnit | null {
  if (!collection) return { code, name: code, level };
  const key = `huc${level}`;
  const feature = collection.features.find((f) => propString(f.properties, [key]) === code);
  if (!feature) return { code, name: code, level };
  return unitFromFeature(feature, level);
}

export function resolveWatershed(
  lng: number,
  lat: number,
  layers: {
    huc12: GeoJsonFeatureCollection | null;
    huc10: GeoJsonFeatureCollection | null;
    huc8: GeoJsonFeatureCollection | null;
    huc6: GeoJsonFeatureCollection | null;
  }
): WatershedHit | null {
  const feature = findContainingFeature(layers.huc12, lng, lat);
  if (!feature) return null;
  const huc12 = unitFromFeature(feature, 12);
  if (!huc12) return null;
  const code = huc12.code;
  return {
    huc12,
    huc10: code.length >= 10 ? unitFromCode(layers.huc10, code.slice(0, 10), 10) : null,
    huc8: code.length >= 8 ? unitFromCode(layers.huc8, code.slice(0, 8), 8) : null,
    huc6: code.length >= 6 ? unitFromCode(layers.huc6, code.slice(0, 6), 6) : null,
  };
}

export function resolveAquifer(
  lng: number,
  lat: number,
  aquifers: GeoJsonFeatureCollection | null
): AquiferHit | null {
  const hits = findContainingFeatures(aquifers, lng, lat);
  if (!hits.length) return null;
  const named = hits.find((f) => {
    const n = propString(f.properties, ["AQ_NAME", "AQNAME"]);
    return n && n.toLowerCase() !== "other rocks";
  });
  const feature = named ?? hits[0];
  const name = propString(feature.properties, [
    "AQ_NAME",
    "AQ_NAME_1",
    "ROCK_NAME",
    "PRINCIPAL",
    "NAME",
    "Aquifer",
    "AQNAME",
  ]);
  if (!name) return null;
  const rockName = propString(feature.properties, ["ROCK_NAME"]);
  const rockTypeRaw = propString(feature.properties, ["ROCK_TYPE", "ROCKTYPE"]);
  const rockType =
    rockName && rockName !== name
      ? rockName
      : rockTypeRaw && /[A-Za-z]/.test(rockTypeRaw)
        ? rockTypeRaw
        : null;
  return { name, rockType };
}
