/**
 * Shared build-time geocoding for the Summit layers (facilities, stewardship).
 * US Census batch geocoder: free, no key, street-level only. Results are cached in
 * source-data/geocode-cache.json so re-runs do not hit the service.
 * A No_Match/Tie is dropped by callers, never approximated to a ZIP or city centroid.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MetroId } from "../../lib/match/metros";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OUT = join(ROOT, "public", "match", "data");
const CACHE = join(ROOT, "source-data", "geocode-cache.json");
const CENSUS_BATCH = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch";
export const BENCHMARK = "Public_AR_Current";

export type Address = { street: string; city: string; state: string; zip: string };

export type Geocode = {
  match: "Match" | "No_Match" | "Tie";
  exact?: "Exact" | "Non_Exact";
  matched?: string;
  lng?: number;
  lat?: number;
};

export function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export function s(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function zip5(v: string): string {
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
export function normalizeStreet(raw: string): string | null {
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
export function addrKey(r: Address): string {
  return `${r.street}|${r.city}|${r.state}|${zip5(r.zip)}`.toLowerCase();
}

/** Minimal CSV parser for the geocoder's quoted output. */
export function parseCsvLine(line: string): string[] {
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

export function csvField(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

export async function loadCache(): Promise<Record<string, Geocode>> {
  try {
    return JSON.parse(await readFile(CACHE, "utf8")) as Record<string, Geocode>;
  } catch {
    return {};
  }
}

export async function geocodeBatch(rows: Address[], cache: Record<string, Geocode>): Promise<void> {
  const pending = new Map<string, Address>();
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

/**
 * Matched address is "STREET, CITY, ST, ZIP". Source ZIPs are sometimes wrong, so a match is
 * only rejected when neither the ZIP nor the city agrees with the input.
 */
export function matchAgrees(g: Geocode, r: Address): boolean {
  const parts = (g.matched ?? "").split(",").map((p) => p.trim().toLowerCase());
  const outZip = zip5(parts[parts.length - 1] ?? "");
  const outCity = parts[parts.length - 3] ?? "";
  const inZip = zip5(r.zip);
  const zipOk = !inZip || !outZip || inZip === outZip;
  const cityOk = outCity === r.city.toLowerCase().split(/\s*\/\s*/)[0].trim();
  return zipOk || cityOk;
}

type Manifest = Record<string, unknown> & { layers?: Record<string, unknown> };

/** Record a layer's provenance in the metro manifest written by the clip script. */
export async function patchManifest(metroId: MetroId, layer: string, entry: Record<string, unknown>) {
  const path = join(OUT, metroId, "manifest.json");
  let manifest: Manifest = {};
  try {
    manifest = JSON.parse(await readFile(path, "utf8")) as Manifest;
  } catch {
    manifest = { metro: metroId };
  }
  manifest.layers = { ...(manifest.layers ?? {}), [layer]: entry };
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
}
