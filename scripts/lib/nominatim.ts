/**
 * OpenStreetMap Nominatim, used only as a fallback after the Census geocoder for the national
 * ESG layer. Two tiers, both cached in source-data/place-cache.json:
 *   placeAddress()  a building / campus / office match for a street address. Road interpolations
 *                   (osm_type=way, class=place, type=house) are REJECTED — they can be a km off.
 *   placeCity()     the city/town centroid, for rows whose street address the workbook marks N/A.
 * Usage policy: ≤1 request/second, identifying User-Agent. https://operations.osmfoundation.org/policies/nominatim/
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ROOT } from "./geocode";

const CACHE = join(ROOT, "source-data", "place-cache.json");
const BASE = "https://nominatim.openstreetmap.org/search";
const UA = "x402gal-build/1.0 (Summit ESG layer; EDGECONSULTINGLABS/x402gal)";

export type Placed = {
  lng: number;
  lat: number;
  osmType: string;
  osmId: number;
  category: string;
  type: string;
  display: string;
};
type CacheEntry = Placed | { miss: true };
type Cache = Record<string, CacheEntry>;

type Result = {
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category?: string;
  class?: string;
  type: string;
  display_name: string;
  address?: Record<string, string>;
};

let cache: Cache | null = null;
let last = 0;

async function load(): Promise<Cache> {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(CACHE, "utf8")) as Cache;
  } catch {
    cache = {};
  }
  return cache;
}

async function save() {
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(cache, null, 1));
}

async function query(params: Record<string, string>): Promise<Result[]> {
  const wait = 1100 - (Date.now() - last);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const url = `${BASE}?${new URLSearchParams({ ...params, format: "jsonv2", addressdetails: "1", countrycodes: "us", limit: "3" })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  return (await res.json()) as Result[];
}

function inState(r: Result, st: string): boolean {
  const iso = r.address?.["ISO3166-2-lvl4"] ?? "";
  return iso.toUpperCase() === `US-${st.toUpperCase()}`;
}

function toPlaced(r: Result): Placed {
  return {
    lng: Number(r.lon),
    lat: Number(r.lat),
    osmType: r.osm_type,
    osmId: r.osm_id,
    category: r.category ?? r.class ?? "",
    type: r.type,
    display: r.display_name,
  };
}

/**
 * Linear or areal features that mean "somewhere along/inside this" rather than "at this address".
 * When Nominatim cannot find the house number it falls back to the road; that is not a placement.
 */
const NOT_A_PLACE = new Set(["highway", "railway", "waterway", "natural", "boundary", "landuse", "leisure"]);

/** Building/campus-level only. Interpolated house positions and bare roads are a miss. */
export async function placeAddress(street: string, city: string, st: string, zip: string): Promise<Placed | null> {
  const c = await load();
  const key = `addr2|${street}|${city}|${st}|${zip}`.toLowerCase();
  if (c[key]) return "miss" in c[key] ? null : c[key];
  let hit: Placed | null = null;
  try {
    const results = await query({ street, city, state: st, ...(zip ? { postalcode: zip } : {}) });
    for (const r of results) {
      if (!inState(r, st)) continue;
      const cat = r.category ?? r.class ?? "";
      if (NOT_A_PLACE.has(cat)) continue;
      const interpolated = r.osm_type === "way" && cat === "place" && r.type === "house";
      if (interpolated) continue;
      // Real objects at the address: buildings, offices, works, POIs inside them, or a tagged address node.
      if (cat !== "place" || r.osm_type === "node") {
        hit = toPlaced(r);
        break;
      }
    }
  } catch (err) {
    console.warn(`  nominatim address lookup failed for "${street}, ${city} ${st}": ${(err as Error).message}`);
    return null; // not cached: transient
  }
  c[key] = hit ?? { miss: true };
  await save();
  return hit;
}

/** City / town / village centroid. */
export async function placeCity(city: string, st: string): Promise<Placed | null> {
  const c = await load();
  // Workbook cities can carry qualifiers: "Kotzebue (DeLong Mountains)", "Bakersfield / Kern County".
  const clean = city.split(/\s*[\/(]/)[0].replace(/\s+area$/i, "").trim();
  const key = `city|${clean}|${st}`.toLowerCase();
  if (c[key]) return "miss" in c[key] ? null : c[key];
  let hit: Placed | null = null;
  try {
    const results = await query({ city: clean, state: st });
    for (const r of results) {
      if (!inState(r, st)) continue;
      const cat = r.category ?? r.class ?? "";
      if (cat === "place" || cat === "boundary") {
        hit = toPlaced(r);
        break;
      }
    }
  } catch (err) {
    console.warn(`  nominatim city lookup failed for "${clean}, ${st}": ${(err as Error).message}`);
    return null;
  }
  c[key] = hit ?? { miss: true };
  await save();
  return hit;
}
