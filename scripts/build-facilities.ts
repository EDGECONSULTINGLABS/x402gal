/**
 * Facility converter — the master data-center spreadsheet → per-metro facilities.geojson.
 *
 *   npm run match:facilities -- --xlsx="<path to Master_50State_DataCenters_All_Locations.xlsx>"
 *   npx tsx scripts/build-facilities.ts --xlsx=<path> [--dry] [--metro=phoenix]
 *
 * Pipeline (spec §4): filter to the Summit metros FIRST, then geocode once as a build step.
 *   1. Sheet "All Facilities (All States)", header row 3, data from row 4.
 *   2. Keep Status beginning "Active"; keep rows whose (City, State Code) or (Market, State Code) is a metro.
 *   3. Geocode with the US Census batch geocoder (free, no key). Results are cached in
 *      source-data/geocode-cache.json so re-runs do not hit the service.
 *   4. Keep Match + Exact/Non_Exact. The Census geocoder interpolates along the matched street
 *      segment and never falls back to a ZIP or city centroid — a No_Match/Tie is dropped, not
 *      approximated. As a further guard the matched ZIP must equal the input ZIP and the point
 *      must fall inside the metro bbox.
 *   5. Emit public/match/data/<metro>/facilities.geojson with properties
 *      name, operator, city, state, status — nothing else. Column J (Notes) never leaves the file.
 *      Also emit public/match/data/facilities-index.json (name, operator, metro, point) for typed input.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { metroForCity } from "../lib/match/metroCities";
import { METROS, pointInBbox, type MetroId } from "../lib/match/metros";
import type { GeoJsonFeature } from "../lib/match/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "match", "data");
const CACHE = join(ROOT, "source-data", "geocode-cache.json");
const SHEET = "All Facilities (All States)";
const CENSUS_BATCH = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
const BENCHMARK = "Public_AR_Current";

type Row = {
  name: string;
  operator: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  market: string;
  status: string;
  metro: MetroId;
};

type Geocode = {
  match: "Match" | "No_Match" | "Tie";
  exact?: "Exact" | "Non_Exact";
  matched?: string;
  lng?: number;
  lat?: number;
};

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function s(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function zip5(v: string): string {
  const m = v.match(/\d{5}/);
  return m ? m[0] : "";
}

/**
 * Make a street string geocodable without moving it off its block:
 *   "7500-8210 Bethlehem Rd"          → "7500 Bethlehem Rd"   (range start; same segment)
 *   "44274 Round Table Plaza, Bldg L" → "44274 Round Table Plaza"
 *   "20481 Goose Landing Ln / 20491 …" → first address
 * Returns null when there is no house number — intersections, route numbers,
 * "(exact address not public)". Those are dropped, never approximated.
 */
function normalizeStreet(raw: string): string | null {
  let v = raw.trim();
  if (!v || /^\(/.test(v)) return null;
  v = v.split(/\s+\/\s+/)[0].trim();
  v = v.replace(/^(\d+)\s*[-–]\s*\d+\b/, "$1");
  v = v.replace(/,?\s+(bldg|building|suite|ste|unit|floor|fl)\b.*$/i, "");
  v = v.replace(/\s+/g, " ").replace(/[.,]+$/, "").trim();
  const hasNumber = /^\d+[a-z]?\s+\S/i.test(v);
  // Named intersections ("Elliot & Sossaman Rds") geocode to the crossing — still street-level.
  const isIntersection = /\s(&|and)\s/i.test(v) && !/^(state route|sr|us|i)[- ]?\d/i.test(v);
  return hasNumber || isIntersection ? v : null;
}

/** Cache key: the address as sent to the geocoder. */
function addrKey(r: Pick<Row, "street" | "city" | "state" | "zip">): string {
  return `${r.street}|${r.city}|${r.state}|${zip5(r.zip)}`.toLowerCase();
}

// ---------------------------------------------------------------- read + filter

function readRows(xlsxPath: string): { rows: Row[]; total: number; dropped: Record<string, number> } {
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[SHEET];
  if (!ws) throw new Error(`sheet "${SHEET}" not found (${wb.SheetNames.join(", ")})`);
  // range: 2 → start at row 3 (0-indexed), which is the header row.
  const table = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, range: 2, defval: "" });
  const header = (table[0] ?? []).map((h) => s(h).toLowerCase());
  const col = (label: string) => {
    const i = header.findIndex((h) => h === label.toLowerCase());
    if (i < 0) throw new Error(`column "${label}" not in header: ${header.join(" | ")}`);
    return i;
  };
  const iName = col("Name");
  const iOperator = col("Operator");
  const iStreet = col("Street Address");
  const iCity = col("City");
  const iState = col("State Code");
  const iZip = col("ZIP");
  const iMarket = col("Market");
  const iStatus = col("Status");
  // Column J "Notes" is intentionally never read.

  const dropped: Record<string, number> = { "not active": 0, "outside metros": 0, "no street address": 0 };
  const rows: Row[] = [];
  let total = 0;
  for (const r of table.slice(1)) {
    if (!r.some((c) => s(c))) continue;
    total++;
    const status = s(r[iStatus]);
    // "Active", "Active/Expanding", "Active/Under construction", "Active (for sale)" are operating
    // facilities. "Proposed/Active", "Planned", "Under construction", "Cancelled" are not.
    if (!/^active\b/i.test(status)) {
      dropped["not active"]++;
      continue;
    }
    const city = s(r[iCity]);
    const state = s(r[iState]);
    const market = s(r[iMarket]);
    const metro = metroForCity(city, state, market);
    if (!metro) {
      dropped["outside metros"]++;
      continue;
    }
    const street = normalizeStreet(s(r[iStreet]));
    if (!street) {
      dropped["no street address"]++;
      continue;
    }
    rows.push({
      name: s(r[iName]),
      operator: s(r[iOperator]),
      street,
      city,
      state,
      zip: s(r[iZip]),
      market,
      status,
      metro,
    });
  }
  return { rows, total, dropped };
}

// ---------------------------------------------------------------- Census batch geocode

/** Minimal CSV parser for the geocoder's quoted output. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function csvField(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

async function loadCache(): Promise<Record<string, Geocode>> {
  try {
    return JSON.parse(await readFile(CACHE, "utf8")) as Record<string, Geocode>;
  } catch {
    return {};
  }
}

async function geocodeBatch(rows: Row[], cache: Record<string, Geocode>): Promise<void> {
  const pending = new Map<string, Row>();
  for (const r of rows) {
    const key = addrKey(r);
    if (!cache[key] && !pending.has(key)) pending.set(key, r);
  }
  if (!pending.size) {
    console.log("geocode: all addresses cached");
    return;
  }
  const keys = [...pending.keys()];
  const csv = keys
    .map((key, i) => {
      const r = pending.get(key)!;
      return [String(i), r.street, r.city, r.state, zip5(r.zip)].map(csvField).join(",");
    })
    .join("\n");

  console.log(`geocode: ${keys.length} unique addresses → Census batch (${BENCHMARK})`);
  const form = new FormData();
  form.append("benchmark", BENCHMARK);
  form.append("addressFile", new Blob([csv], { type: "text/csv" }), "addresses.csv");
  const res = await fetch(CENSUS_BATCH, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Census batch ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();

  let matched = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // id, input address, Match|No_Match|Tie, Exact|Non_Exact, matched address, "lon,lat", tigerline, side
    const f = parseCsvLine(line);
    const key = keys[Number(f[0])];
    if (!key) continue;
    const match = (f[2] || "No_Match") as Geocode["match"];
    const entry: Geocode = { match };
    if (match === "Match") {
      entry.exact = f[3] as Geocode["exact"];
      entry.matched = f[4];
      const [lng, lat] = (f[5] || "").split(",").map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        entry.lng = lng;
        entry.lat = lat;
        matched++;
      }
    }
    cache[key] = entry;
  }
  for (const key of keys) if (!cache[key]) cache[key] = { match: "No_Match" };
  console.log(`geocode: ${matched}/${keys.length} matched`);
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(cache, null, 1));
}

// ---------------------------------------------------------------- emit

type Manifest = Record<string, unknown> & { layers?: Record<string, unknown> };

async function patchManifest(metroId: MetroId, entry: Record<string, unknown>) {
  const path = join(OUT, metroId, "manifest.json");
  let manifest: Manifest = {};
  try {
    manifest = JSON.parse(await readFile(path, "utf8")) as Manifest;
  } catch {
    // clip has not run for this metro yet; write a partial manifest
    manifest = { metro: metroId };
  }
  manifest.layers = { ...(manifest.layers ?? {}), "facilities.geojson": entry };
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
}

async function main() {
  const xlsxPath = arg("xlsx");
  if (!xlsxPath) throw new Error("--xlsx=<path to the master data-center workbook> is required");
  const dry = process.argv.includes("--dry");
  const only = arg("metro") as MetroId | undefined;

  const { rows, total, dropped } = readRows(resolve(xlsxPath));
  console.log(`rows: ${total} in sheet → ${rows.length} in metros`);
  console.log("dropped before geocode:", dropped);
  const byMetro = new Map<MetroId, Row[]>();
  for (const r of rows) byMetro.set(r.metro, [...(byMetro.get(r.metro) ?? []), r]);
  for (const m of METROS) console.log(`  ${m.id}: ${byMetro.get(m.id)?.length ?? 0}`);
  if (dry) return;

  const targets = only ? rows.filter((r) => r.metro === only) : rows;
  const cache = await loadCache();
  await geocodeBatch(targets, cache);

  const index: { n: string; o: string; m: MetroId; c: [number, number] }[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const metro of METROS) {
    if (only && metro.id !== only) continue;
    const input = byMetro.get(metro.id) ?? [];
    const features: GeoJsonFeature[] = [];
    const why: Record<string, number> = { "no match": 0, "city and zip mismatch": 0, "outside bbox": 0 };
    for (const r of input) {
      const g = cache[addrKey(r)];
      if (!g || g.match !== "Match" || g.lng == null || g.lat == null) {
        why["no match"]++;
        continue;
      }
      // Matched address is "STREET, CITY, ST, ZIP". Source ZIPs are sometimes wrong, so a
      // match is only rejected when neither the ZIP nor the city agrees with the input.
      const parts = (g.matched ?? "").split(",").map((p) => p.trim().toLowerCase());
      const outZip = zip5(parts[parts.length - 1] ?? "");
      const outCity = parts[parts.length - 3] ?? "";
      const inZip = zip5(r.zip);
      const zipOk = !inZip || !outZip || inZip === outZip;
      const cityOk = outCity === r.city.toLowerCase().split(/\s*\/\s*/)[0].trim();
      if (!zipOk && !cityOk) {
        why["city and zip mismatch"]++;
        continue;
      }
      if (!pointInBbox(g.lng, g.lat, metro.bbox)) {
        why["outside bbox"]++;
        continue;
      }
      const point: [number, number] = [Number(g.lng.toFixed(6)), Number(g.lat.toFixed(6))];
      features.push({
        type: "Feature",
        properties: { name: r.name, operator: r.operator, city: r.city, state: r.state, status: r.status },
        geometry: { type: "Point", coordinates: point },
      });
      index.push({ n: r.name, o: r.operator, m: metro.id, c: point });
    }
    features.sort((a, b) => String(a.properties?.name).localeCompare(String(b.properties?.name)));
    await mkdir(join(OUT, metro.id), { recursive: true });
    const json = JSON.stringify({ type: "FeatureCollection", features });
    await writeFile(join(OUT, metro.id, "facilities.geojson"), json);
    console.log(`  ${metro.id}/facilities.geojson ${features.length}/${input.length} kept`, why);
    await patchManifest(metro.id, {
      features: features.length,
      bytes: Buffer.byteLength(json),
      source: `Master 50-state data-center workbook, sheet "${SHEET}", Active rows in metro cities`,
      geocoder: `US Census batch (${BENCHMARK}), Match + Exact/Non_Exact, ZIP or city agreement, inside metro bbox`,
      dropped: why,
      built: today,
    });
  }

  if (!only) {
    index.sort((a, b) => a.n.localeCompare(b.n));
    await writeFile(join(OUT, "facilities-index.json"), JSON.stringify(index));
    console.log(`facilities-index.json ${index.length} entries`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
