/**
 * One-time clip of public USGS layers to the Summit metros.
 * Writes GeoJSON under public/match/data/. Do not call these services at demo time.
 *
 * Sources:
 *   WBD — https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer
 *   Principal aquifers — USGS ScienceBase shapefile doi:10.5066/P9Y2HOUJ
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { METROS, type BBox } from "../lib/match/metros";
import type { GeoJsonFeature, GeoJsonFeatureCollection } from "../lib/match/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "match", "data");

const WBD = "https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer";

const LAYERS = [
  { id: 6, file: "wbd-huc12.geojson", codeKeys: ["huc12", "HUC12"] },
  { id: 5, file: "wbd-huc10.geojson", codeKeys: ["huc10", "HUC10"] },
  { id: 4, file: "wbd-huc8.geojson", codeKeys: ["huc8", "HUC8"] },
  { id: 3, file: "wbd-huc6.geojson", codeKeys: ["huc6", "HUC6"] },
] as const;

/** USGS principal aquifers shapefile (ScienceBase doi:10.5066/P9Y2HOUJ). */
const AQUIFER_ZIP =
  "https://www.sciencebase.gov/catalog/file/get/63140610d34e36012efa385d?f=__disk__38%2F75%2F7d%2F38757d8db3921426b941b8efe3599b5c03c56917";

const EMPTY: GeoJsonFeatureCollection = { type: "FeatureCollection", features: [] };

function codeOf(feature: GeoJsonFeature, keys: readonly string[]): string | null {
  const props = feature.properties ?? {};
  const lookup = new Map(Object.keys(props).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = lookup.get(key.toLowerCase());
    if (!actual) continue;
    const value = props[actual];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

function mergeUnique(
  collections: GeoJsonFeatureCollection[],
  keys: readonly string[]
): GeoJsonFeatureCollection {
  const seen = new Set<string>();
  const features: GeoJsonFeature[] = [];
  let fallback = 0;
  for (const col of collections) {
    for (const feature of col.features) {
      const code = codeOf(feature, keys) ?? `anon-${fallback++}`;
      if (seen.has(code)) continue;
      seen.add(code);
      features.push(feature);
    }
  }
  return { type: "FeatureCollection", features };
}

async function queryEnvelope(
  layerUrl: string,
  bbox: BBox,
  offsetDeg: number
): Promise<GeoJsonFeatureCollection> {
  const [xmin, ymin, xmax, ymax] = bbox;
  const body = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    geometry: JSON.stringify({
      xmin,
      ymin,
      xmax,
      ymax,
      spatialReference: { wkid: 4326 },
    }),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    maxAllowableOffset: String(offsetDeg),
    resultRecordCount: "2000",
  });

  const res = await fetch(`${layerUrl}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`${layerUrl} ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as GeoJsonFeatureCollection & { error?: { message?: string } };
  if (data.error) throw new Error(`${layerUrl}: ${data.error.message ?? "query error"}`);
  if (data.type !== "FeatureCollection") {
    throw new Error(`${layerUrl}: unexpected payload`);
  }
  return data;
}

function clipTargets() {
  const only = process.argv.find((a) => a.startsWith("--metro="))?.slice("--metro=".length);
  if (!only) return [...METROS];
  const hit = METROS.filter((m) => m.id === only);
  if (!hit.length) throw new Error(`unknown metro: ${only}`);
  return hit;
}

async function queryAllMetros(
  layerUrl: string,
  offsetDeg: number,
  metros: typeof METROS
): Promise<GeoJsonFeatureCollection[]> {
  const out: GeoJsonFeatureCollection[] = [];
  for (const metro of metros) {
    process.stdout.write(`  ${metro.id} … `);
    const col = await queryEnvelope(layerUrl, metro.bbox, offsetDeg);
    console.log(`${col.features.length} features`);
    out.push(col);
  }
  return out;
}

async function writeJson(file: string, data: unknown) {
  const path = join(OUT, file);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data));
  const bytes = Buffer.byteLength(JSON.stringify(data));
  console.log(`wrote ${file} (${(bytes / 1024).toFixed(0)} KB)`);
}

async function clipAquifers(metros: typeof METROS): Promise<void> {
  const { mkdtemp, readdir, rm, writeFile: write } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { execFileSync } = await import("node:child_process");
  const bboxClip = (await import("@turf/bbox-clip")).default;
  const shapefile = await import("shapefile");

  const dir = await mkdtemp(join(tmpdir(), "summit-aq-"));
  const zipPath = join(dir, "aquifers_us.zip");
  console.log("aquifers via USGS ScienceBase shapefile");
  const res = await fetch(AQUIFER_ZIP);
  if (!res.ok) throw new Error(`ScienceBase ${res.status}`);
  await write(zipPath, Buffer.from(await res.arrayBuffer()));

  if (process.platform === "win32") {
    execFileSync("tar", ["-xf", zipPath, "-C", dir]);
  } else {
    execFileSync("unzip", ["-o", zipPath, "-d", dir]);
  }

  const names = await readdir(dir);
  const shp = names.find((n) => n.toLowerCase().endsWith(".shp"));
  if (!shp) throw new Error(`no .shp in aquifer zip (${names.join(", ")})`);

  const collection = (await shapefile.read(join(dir, shp))) as GeoJsonFeatureCollection;
  console.log(`  national polygons: ${collection.features.length}`);

  const clipped: GeoJsonFeature[] = [];
  const seen = new Set<string>();
  for (const metro of metros) {
    for (const feature of collection.features) {
      if (!feature.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
        continue;
      }
      try {
        const cut = bboxClip(feature as never, metro.bbox) as GeoJsonFeature;
        const coords = cut.geometry?.coordinates as unknown[] | undefined;
        if (!coords || !coords.length) continue;
        const name =
          (cut.properties &&
            (String(cut.properties.AQ_NAME ?? cut.properties.ROCK_NAME ?? cut.properties.AQ_NAME ?? ""))) ||
          "unnamed";
        const key = `${metro.id}:${name}:${JSON.stringify(cut.geometry).length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        cut.properties = {
          ...(cut.properties ?? {}),
          metro: metro.id,
          AQ_NAME: name,
        };
        clipped.push(cut);
      } catch {
        // skip degenerate clips
      }
    }
  }

  await rm(dir, { recursive: true, force: true });
  if (!clipped.length) throw new Error("aquifer clip produced no polygons");
  for (const metro of metros) {
    const features = clipped.filter((f) => f.properties?.metro === metro.id);
    await writeJson(`${metro.id}/aquifers.geojson`, { type: "FeatureCollection", features });
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const metros = clipTargets();
  const aquifersOnly = process.argv.includes("--aquifers-only");
  const wbdOnly = process.argv.includes("--wbd-only");
  const single = metros.length !== METROS.length;

  if (aquifersOnly) {
    await clipAquifers(metros);
    console.log("done");
    return;
  }

  for (const layer of LAYERS) {
    const short = layer.file.replace("wbd-", "");
    console.log(`WBD layer ${layer.id} → */${short}`);
    const offset = layer.id === 6 ? 0.0008 : 0.0015;
    const parts = await queryAllMetros(`${WBD}/${layer.id}`, offset, metros);
    for (let i = 0; i < metros.length; i++) {
      await writeJson(`${metros[i].id}/${short}`, mergeUnique([parts[i]], layer.codeKeys));
    }
  }

  if (wbdOnly) {
    for (const metro of metros) {
      await writeJson(`${metro.id}/aquifers.geojson`, EMPTY);
    }
  } else {
    await clipAquifers(metros);
  }
  if (!single) {
    await writeJson("facilities.geojson", EMPTY);
    await writeJson("candidates.geojson", EMPTY);
  }
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
