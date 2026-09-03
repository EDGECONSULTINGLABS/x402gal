import { readFileSync } from "node:fs";
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
    huc6: load(m.id, "huc6"),
  };
  const aq = load(m.id, "aquifers");
  const [lng, lat] = m.center;
  const w = resolveWatershed(lng, lat, layers);
  const a = resolveAquifer(lng, lat, aq);
  console.log(m.name);
  console.log("  huc12", w?.huc12.name, w?.huc12.code);
  console.log("  huc10", w?.huc10?.name, w?.huc10?.code);
  console.log("  huc8", w?.huc8?.name, w?.huc8?.code);
  console.log("  huc6", w?.huc6?.name, w?.huc6?.code);
  console.log("  aquifer", a?.name, a?.rockType ?? "");
}
