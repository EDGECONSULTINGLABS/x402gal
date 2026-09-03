/**
 * Clip the Summit metro geodata. One clipping path, two sources.
 *
 *   npm run match:clip                                  # interim: USGS WBD MapServer + ScienceBase aquifers
 *   npm run match:clip -- --source=source-data          # Zina's "Watershed Boundary" layers (controlling)
 *   npm run match:clip -- --source=source-data --metro=phoenix --layer=huc12
 *
 * Source-mode layout (gitignored, downloaded once):
 *   source-data/HUC12/*.shp        HUC12  — USGS "subwatershed"
 *   source-data/WBDHU10/*.shp      HUC10  — USGS "watershed"
 *   source-data/huc8_conus/*.shp   HUC8   — USGS "subbasin"
 *   source-data/aquifers_us/*.shp  principal aquifers
 *
 * Output per metro under public/match/data/<metro>/:
 *   huc12.geojson huc10.geojson huc8.geojson aquifers.geojson manifest.json
 *
 * manifest.json records the source and the sha256 of each source .shp so the
 * polygons on the demo map can be tied to the polygons engineering works from.
 * Never call the USGS services at demo time.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { METROS, type BBox, type Metro } from "../lib/match/metros";
import type { GeoJsonFeature, GeoJsonFeatureCollection } from "../lib/match/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "match", "data");

const WBD = "https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer";
/** USGS principal aquifers shapefile (ScienceBase doi:10.5066/P9Y2HOUJ). */
const AQUIFER_ZIP =
  "https://www.sciencebase.gov/catalog/file/get/63140610d34e36012efa385d?f=__disk__38%2F75%2F7d%2F38757d8db3921426b941b8efe3599b5c03c56917";

const SOURCE_DRIVE = "Watershed Boundary (Drive, parjanad)";
const SOURCE_SERVICE =
  "USGS WBD MapServer (hydro.nationalmap.gov) + USGS Principal Aquifers (ScienceBase doi:10.5066/P9Y2HOUJ)";

type HucLayer = {
  /** Key in manifest.files — matches the Drive folder name. */
  key: "HUC12" | "WBDHU10" | "huc8_conus";
  out: "huc12.geojson" | "huc10.geojson" | "huc8.geojson";
  code: "huc12" | "huc10" | "huc8";
  /** WBD MapServer layer id (service mode). */
  serviceId: 6 | 5 | 4;
  /** Service-mode generalisation, degrees. */
  serviceOffsetDeg: number;
  /** mapshaper simplify interval in metres. Visually lossless at metro zoom. */
  simplifyM: number;
};

const HUC_LAYERS: readonly HucLayer[] = [
  { key: "HUC12", out: "huc12.geojson", code: "huc12", serviceId: 6, serviceOffsetDeg: 0.0008, simplifyM: 20 },
  { key: "WBDHU10", out: "huc10.geojson", code: "huc10", serviceId: 5, serviceOffsetDeg: 0.0015, simplifyM: 30 },
  { key: "huc8_conus", out: "huc8.geojson", code: "huc8", serviceId: 4, serviceOffsetDeg: 0.0015, simplifyM: 40 },
];
const AQUIFER_KEY = "aquifers_us";
const AQUIFER_OUT = "aquifers.geojson";

type Manifest = {
  metro: string;
  source: string;
  files: Record<string, string> | null;
  clipped: string;
  bbox: BBox;
  layers: Record<string, { features: number; bytes: number; simplify?: string }>;
  note?: string;
};

const EMPTY: GeoJsonFeatureCollection = { type: "FeatureCollection", features: [] };

// ---------------------------------------------------------------- args

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function clipTargets(): Metro[] {
  const only = arg("metro");
  if (!only) return [...METROS];
  const hit = METROS.filter((m) => m.id === only);
  if (!hit.length) throw new Error(`unknown metro: ${only}`);
  return hit;
}

function layerTargets(): { huc: HucLayer[]; aquifers: boolean } {
  const only = arg("layer");
  if (!only) return { huc: [...HUC_LAYERS], aquifers: true };
  if (only === "aquifers") return { huc: [], aquifers: true };
  const hit = HUC_LAYERS.filter((l) => l.code === only);
  if (!hit.length) throw new Error(`unknown layer: ${only} (huc12 | huc10 | huc8 | aquifers)`);
  return { huc: hit, aquifers: false };
}

// ---------------------------------------------------------------- geometry helpers

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
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

function bboxOverlap(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function propString(props: Record<string, unknown> | null, keys: readonly string[]): string | null {
  if (!props) return null;
  const lookup = new Map(Object.keys(props).map((k) => [k.toLowerCase(), k]));
  for (const key of keys) {
    const actual = lookup.get(key.toLowerCase());
    if (!actual) continue;
    const value = props[actual];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return null;
}

/** Keep only what the app reads. Shrinks output and drops nothing the UI shows. */
function slimHuc(feature: GeoJsonFeature, code: HucLayer["code"]): GeoJsonFeature | null {
  const value = propString(feature.properties, [code]);
  if (!value) return null;
  const name = propString(feature.properties, ["name", "hu_name", "huname"]) ?? value;
  return { type: "Feature", properties: { [code]: value, name }, geometry: feature.geometry };
}

function slimAquifer(feature: GeoJsonFeature, metroId: string): GeoJsonFeature {
  const p = feature.properties ?? {};
  const name = propString(p, ["AQ_NAME", "AQNAME", "ROCK_NAME"]) ?? "unnamed";
  const rockName = propString(p, ["ROCK_NAME"]);
  const rockType = propString(p, ["ROCK_TYPE", "ROCKTYPE"]);
  return {
    type: "Feature",
    properties: {
      metro: metroId,
      AQ_NAME: name,
      ...(rockName ? { ROCK_NAME: rockName } : {}),
      ...(rockType ? { ROCK_TYPE: rockType } : {}),
    },
    geometry: feature.geometry,
  };
}

function dedupe(features: GeoJsonFeature[], code: string): GeoJsonFeature[] {
  const seen = new Set<string>();
  return features.filter((f) => {
    const key = String(f.properties?.[code] ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------- output + manifest

async function writeLayer(metro: Metro, out: string, features: GeoJsonFeature[]) {
  const dir = join(OUT, metro.id);
  await mkdir(dir, { recursive: true });
  const json = JSON.stringify({ type: "FeatureCollection", features });
  await writeFile(join(dir, out), json);
  const bytes = Buffer.byteLength(json);
  console.log(`  ${metro.id}/${out} ${features.length} features ${(bytes / 1024).toFixed(0)} KB`);
  return { features: features.length, bytes };
}

async function readManifest(metro: Metro): Promise<Manifest | null> {
  try {
    return JSON.parse(await readFile(join(OUT, metro.id, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return null;
  }
}

async function updateManifest(
  metro: Metro,
  patch: {
    source: string;
    files: Record<string, string> | null;
    layers: Manifest["layers"];
    note?: string;
  }
) {
  const prev = await readManifest(metro);
  const sameSource = prev?.source === patch.source;
  const next: Manifest = {
    metro: metro.id,
    source: patch.source,
    files:
      patch.files === null
        ? null
        : { ...(sameSource ? prev?.files ?? {} : {}), ...patch.files },
    clipped: new Date().toISOString().slice(0, 10),
    bbox: metro.bbox,
    layers: { ...(sameSource ? prev?.layers ?? {} : {}), ...patch.layers },
    ...(patch.note ? { note: patch.note } : {}),
  };
  await writeFile(join(OUT, metro.id, "manifest.json"), JSON.stringify(next, null, 2) + "\n");
}

async function ensureCandidates(metro: Metro) {
  const path = join(OUT, metro.id, "candidates.geojson");
  try {
    await stat(path);
  } catch {
    await writeFile(path, JSON.stringify(EMPTY));
  }
}

// ---------------------------------------------------------------- simplify (mapshaper)

async function simplify(
  features: GeoJsonFeature[],
  intervalM: number
): Promise<{ features: GeoJsonFeature[]; label: string }> {
  const mapshaper = await import("mapshaper");
  const input = { "in.json": JSON.stringify({ type: "FeatureCollection", features }) };
  const label = `mapshaper -simplify interval=${intervalM} keep-shapes, precision=0.00001`;
  const cmd =
    `-i in.json -simplify interval=${intervalM} keep-shapes ` +
    `-o out.json format=geojson precision=0.00001`;
  const result = await mapshaper.applyCommands(cmd, input);
  const raw = result["out.json"];
  if (!raw) throw new Error("mapshaper produced no output");
  const parsed = JSON.parse(typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8")) as GeoJsonFeatureCollection;
  return { features: parsed.features, label };
}

// ---------------------------------------------------------------- source mode (Zina's layers)

async function findShp(dir: string): Promise<string> {
  const walk = async (d: string, depth: number): Promise<string | null> => {
    const names = await readdir(d, { withFileTypes: true });
    for (const n of names) {
      if (n.isFile() && n.name.toLowerCase().endsWith(".shp")) return join(d, n.name);
    }
    if (depth === 0) return null;
    for (const n of names) {
      if (n.isDirectory()) {
        const hit = await walk(join(d, n.name), depth - 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  const shp = await walk(dir, 2);
  if (!shp) throw new Error(`no .shp under ${dir}`);
  return shp;
}

async function requireSidecars(shp: string) {
  const base = shp.slice(0, -4);
  const missing: string[] = [];
  for (const ext of [".dbf", ".shx"]) {
    try {
      await stat(base + ext);
    } catch {
      missing.push(base + ext);
    }
  }
  if (missing.length) {
    throw new Error(
      `${shp} is missing ${missing.map((m) => m.slice(m.lastIndexOf("."))).join(" and ")}. ` +
        `A .shp alone has geometry but no HUC codes or names. Download the full folder from Drive.`
    );
  }
  try {
    const prj = await readFile(base + ".prj", "utf8");
    if (/^PROJCS/i.test(prj.trim())) {
      throw new Error(`${shp} is projected (${prj.slice(0, 60)}…). Reproject to EPSG:4326 first.`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.warn(`  warn: ${shp} has no .prj — assuming geographic degrees (NAD83/WGS84)`);
  }
}

function sha256(path: string): Promise<string> {
  return new Promise((res, rej) => {
    const hash = createHash("sha256");
    createReadStream(path)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => res(hash.digest("hex")))
      .on("error", rej);
  });
}

/** Stream a national shapefile once, bucketing features by metro bbox overlap. */
async function streamByMetro(
  shp: string,
  metros: Metro[],
  keep: (f: GeoJsonFeature) => GeoJsonFeature | null
): Promise<Map<string, GeoJsonFeature[]>> {
  const shapefile = await import("shapefile");
  const buckets = new Map<string, GeoJsonFeature[]>(metros.map((m) => [m.id, []]));
  const source = await shapefile.open(shp);
  let n = 0;
  for (;;) {
    const { done, value } = await source.read();
    if (done) break;
    n++;
    if (n % 20000 === 0) process.stdout.write(`    …${n} read\r`);
    const feature = value as GeoJsonFeature;
    if (!feature.geometry) continue;
    const fb = featureBbox(feature);
    if (!fb) continue;
    for (const metro of metros) {
      if (!bboxOverlap(fb, metro.bbox)) continue;
      const slim = keep(feature);
      if (slim) buckets.get(metro.id)!.push(slim);
    }
  }
  console.log(`    ${n} national features read`);
  return buckets;
}

async function clipFromSource(sourceDir: string, metros: Metro[]) {
  const { huc, aquifers } = layerTargets();
  const files: Record<string, string> = {};
  const perMetro = new Map<string, Manifest["layers"]>(metros.map((m) => [m.id, {}]));

  for (const layer of huc) {
    const shp = await findShp(join(sourceDir, layer.key));
    await requireSidecars(shp);
    console.log(`${layer.key} ← ${shp}`);
    process.stdout.write("  hashing … ");
    files[layer.key] = await sha256(shp);
    console.log(files[layer.key].slice(0, 12));
    const buckets = await streamByMetro(shp, metros, (f) => slimHuc(f, layer.code));
    for (const metro of metros) {
      const raw = dedupe(buckets.get(metro.id) ?? [], layer.code);
      const { features, label } = await simplify(raw, layer.simplifyM);
      const stats = await writeLayer(metro, layer.out, features);
      perMetro.get(metro.id)![layer.out] = { ...stats, simplify: label };
    }
  }

  if (aquifers) {
    const shp = await findShp(join(sourceDir, AQUIFER_KEY));
    await requireSidecars(shp);
    console.log(`${AQUIFER_KEY} ← ${shp}`);
    process.stdout.write("  hashing … ");
    files[AQUIFER_KEY] = await sha256(shp);
    console.log(files[AQUIFER_KEY].slice(0, 12));
    const bboxClip = (await import("@turf/bbox-clip")).default;
    const buckets = await streamByMetro(shp, metros, (f) =>
      f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon" ? f : null
    );
    for (const metro of metros) {
      const clipped: GeoJsonFeature[] = [];
      for (const feature of buckets.get(metro.id) ?? []) {
        try {
          const cut = bboxClip(feature as never, metro.bbox) as GeoJsonFeature;
          const coords = cut.geometry?.coordinates as unknown[] | undefined;
          if (!coords || !coords.length) continue;
          clipped.push(slimAquifer({ ...cut, properties: feature.properties }, metro.id));
        } catch {
          // degenerate clip
        }
      }
      const stats = await writeLayer(metro, AQUIFER_OUT, clipped);
      perMetro.get(metro.id)![AQUIFER_OUT] = stats;
    }
  }

  for (const metro of metros) {
    await ensureCandidates(metro);
    await updateManifest(metro, { source: SOURCE_DRIVE, files, layers: perMetro.get(metro.id)! });
  }
}

// ---------------------------------------------------------------- service mode (interim)

async function queryEnvelope(layerUrl: string, bbox: BBox, offsetDeg: number): Promise<GeoJsonFeatureCollection> {
  const [xmin, ymin, xmax, ymax] = bbox;
  const body = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    geometry: JSON.stringify({ xmin, ymin, xmax, ymax, spatialReference: { wkid: 4326 } }),
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
  if (!res.ok) throw new Error(`${layerUrl} ${res.status} ${await res.text()}`);
  const data = (await res.json()) as GeoJsonFeatureCollection & { error?: { message?: string } };
  if (data.error) throw new Error(`${layerUrl}: ${data.error.message ?? "query error"}`);
  if (data.type !== "FeatureCollection") throw new Error(`${layerUrl}: unexpected payload`);
  return data;
}

async function clipAquifersFromService(metros: Metro[]): Promise<Map<string, GeoJsonFeature[]>> {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { execFileSync } = await import("node:child_process");
  const bboxClip = (await import("@turf/bbox-clip")).default;
  const shapefile = await import("shapefile");

  const dir = await mkdtemp(join(tmpdir(), "summit-aq-"));
  const zipPath = join(dir, "aquifers_us.zip");
  console.log("aquifers via USGS ScienceBase shapefile");
  const res = await fetch(AQUIFER_ZIP);
  if (!res.ok) throw new Error(`ScienceBase ${res.status}`);
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  if (process.platform === "win32") execFileSync("tar", ["-xf", zipPath, "-C", dir]);
  else execFileSync("unzip", ["-o", zipPath, "-d", dir]);

  const shp = await findShp(dir);
  const collection = (await shapefile.read(shp)) as GeoJsonFeatureCollection;
  console.log(`  national polygons: ${collection.features.length}`);

  const out = new Map<string, GeoJsonFeature[]>(metros.map((m) => [m.id, []]));
  for (const metro of metros) {
    for (const feature of collection.features) {
      if (!feature.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) continue;
      const fb = featureBbox(feature);
      if (!fb || !bboxOverlap(fb, metro.bbox)) continue;
      try {
        const cut = bboxClip(feature as never, metro.bbox) as GeoJsonFeature;
        const coords = cut.geometry?.coordinates as unknown[] | undefined;
        if (!coords || !coords.length) continue;
        out.get(metro.id)!.push(slimAquifer({ ...cut, properties: feature.properties }, metro.id));
      } catch {
        // degenerate clip
      }
    }
  }
  await rm(dir, { recursive: true, force: true });
  return out;
}

async function clipFromService(metros: Metro[]) {
  const { huc, aquifers } = layerTargets();
  const perMetro = new Map<string, Manifest["layers"]>(metros.map((m) => [m.id, {}]));

  for (const layer of huc) {
    console.log(`WBD layer ${layer.serviceId} → */${layer.out}`);
    for (const metro of metros) {
      process.stdout.write(`  ${metro.id} … `);
      const col = await queryEnvelope(`${WBD}/${layer.serviceId}`, metro.bbox, layer.serviceOffsetDeg);
      const features = dedupe(
        col.features.map((f) => slimHuc(f, layer.code)).filter((f): f is GeoJsonFeature => f !== null),
        layer.code
      );
      const stats = await writeLayer(metro, layer.out, features);
      perMetro.get(metro.id)![layer.out] = { ...stats, simplify: `maxAllowableOffset=${layer.serviceOffsetDeg}deg` };
    }
  }

  if (aquifers) {
    const buckets = await clipAquifersFromService(metros);
    for (const metro of metros) {
      const stats = await writeLayer(metro, AQUIFER_OUT, buckets.get(metro.id) ?? []);
      perMetro.get(metro.id)![AQUIFER_OUT] = stats;
    }
  }

  for (const metro of metros) {
    await ensureCandidates(metro);
    await updateManifest(metro, {
      source: SOURCE_SERVICE,
      files: null,
      layers: perMetro.get(metro.id)!,
      note: "Interim. Rebuild with --source=source-data once all four Watershed Boundary layers are on disk.",
    });
  }
}

// ---------------------------------------------------------------- main

async function main() {
  await mkdir(OUT, { recursive: true });
  const metros = clipTargets();
  const source = arg("source");
  if (source) {
    const dir = resolve(ROOT, source);
    await stat(dir);
    console.log(`source: ${dir}`);
    await clipFromSource(dir, metros);
  } else {
    console.log("source: USGS services (interim)");
    await clipFromService(metros);
  }
  console.log("done");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
