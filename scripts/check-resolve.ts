import { readFileSync } from "node:fs";
import { facilitiesFrom, nearbyFacilities } from "../lib/match/facilities";
import { findContainingFeature } from "../lib/match/geo";
import { METROS } from "../lib/match/metros";
import { resolveAquifer, resolveWatershed } from "../lib/match/watershed";
import type { GeoJsonFeatureCollection } from "../lib/match/types";

function load(metroId: string, name: string): GeoJsonFeatureCollection {
  return JSON.parse(readFileSync(`public/match/data/${metroId}/${name}.geojson`, "utf8"));
}

for (const m of METROS) {
  const layers = {
    huc12: load(m.id, "huc12"),
    huc10: load(m.id, "huc10"),
    huc8: load(m.id, "huc8"),
  };
  const aq = load(m.id, "aquifers");
  const facilities = facilitiesFrom(load(m.id, "facilities"));
  const [lng, lat] = m.center;
  const w = resolveWatershed(lng, lat, layers);
  const a = resolveAquifer(lng, lat, aq);
  const near = nearbyFacilities(facilities, lng, lat, 25, findContainingFeature(layers.huc12, lng, lat));
  console.log(m.name);
  console.log("  subwatershed", w?.huc12.name, w?.huc12.code);
  console.log("  watershed   ", w?.huc10?.name, w?.huc10?.code);
  console.log("  subbasin    ", w?.huc8?.name, w?.huc8?.code);
  console.log("  aquifer     ", a?.name, a?.rockType ?? "");
  console.log(
    `  facilities   ${facilities.length} in metro, ${near.length} within 25 km, ${near.filter((n) => n.sameSubwatershed).length} same subwatershed`
  );
}
