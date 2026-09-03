import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { METROS, type BBox } from "../lib/match/metros";
import type { GeoJsonFeature, GeoJsonFeatureCollection } from "../lib/match/types";

const OUT = join(process.cwd(), "public", "match", "data");

function walkCoords(coords: unknown, fn: (lng: number, lat: number) => void) {
  if (!Array.isArray(coords) || coords.length === 0) return;
  if (typeof coords[0] === "number") {
    fn(coords[0] as number, coords[1] as number);
    return;
  }
  for (const c of coords) walkCoords(c, fn);
}

function featureBbox(feature: GeoJsonFeature): BBox | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  walkCoords(feature.geometry?.coordinates, (lng, lat) => {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  });
  if (!Number.isFinite(west)) return null;
  return [west, south, east, north];
}

function bboxOverlap(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

async function load(name: string): Promise<GeoJsonFeatureCollection> {
  return JSON.parse(await readFile(join(OUT, name), "utf8"));
}

async function write(metroId: string, name: string, features: GeoJsonFeature[]) {
  const dir = join(OUT, metroId);
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  const json = JSON.stringify({ type: "FeatureCollection", features });
  await writeFile(path, json);
  console.log(`  ${metroId}/${name} ${features.length} feats ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`);
}

async function main() {
  const layers = [
    "wbd-huc12.geojson",
    "wbd-huc10.geojson",
    "wbd-huc8.geojson",
    "wbd-huc6.geojson",
    "aquifers.geojson",
  ] as const;

  const loaded: Record<string, GeoJsonFeatureCollection> = {};
  for (const name of layers) loaded[name] = await load(name);

  for (const metro of METROS) {
    for (const name of layers) {
      const features = loaded[name].features.filter((f) => {
        if (f.properties && String(f.properties.metro ?? "") === metro.id) return true;
        const fb = featureBbox(f);
        return fb ? bboxOverlap(fb, metro.bbox) : false;
      });
      const outName = name.startsWith("wbd-") ? name.slice(4) : name;
      await write(metro.id, outName, features);
    }
  }

  for (const name of layers) {
    await unlink(join(OUT, name));
    console.log(`removed combined ${name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
