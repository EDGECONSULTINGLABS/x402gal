/**
 * Build the 50-state ESG company layer from Master_50State_ESG_Companies_All_Locations.xlsx.
 *
 *   npm run match:esg -- --xlsx="<path to workbook>"
 *
 * Reads three tabs:
 *   "All Companies (All States)"  one row per facility → one point, coloured by Fit Category
 *   "Summary by State"            per-state counts (shipped as the state filter)
 *   "Summary by Company"          per-company facilities / states / fit (shipped as the company list)
 *
 * Every row is attempted, in tiers (recorded per point as `placement`):
 *   1. census    US Census street-level match
 *   2. osm       OpenStreetMap building/campus object for the street address (no road interpolation)
 *   3. override  cited authoritative record in data/summit/esg-overrides.json
 *   4. city      city centre, when the workbook has no usable street address — drawn hollow,
 *                captioned approximate, and listed in esg-summary.json → approximate for follow-up.
 * Rows with no city match either go to esg-summary.json → unplaced.
 *
 * Never shipped: column J (fit rationale prose), column M (Notes).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as XLSX from "xlsx";
import {
  FIT_CATEGORIES,
  PLACEMENTS,
  fitCategory,
  type EsgProps,
  type EsgSummary,
  type FitCategory,
  type Placement,
} from "../lib/match/esg";
import { placeAddress, placeCity } from "./lib/nominatim";
import type { GeoJsonFeature } from "../lib/match/types";
import {
  BENCHMARK,
  OUT,
  ROOT,
  addrKey,
  arg,
  geocodeBatch,
  loadCache,
  matchAgrees,
  normalizeStreet,
  s,
  zip5,
} from "./lib/geocode";

const SHEET_ALL = "All Companies (All States)";
const SHEET_STATE = "Summary by State";
const SHEET_COMPANY = "Summary by Company";
const OVERRIDES = join(ROOT, "data", "summit", "esg-overrides.json");
const OUT_DIR = join(OUT, "us");

type Override = {
  address: string;
  lng: number;
  lat: number;
  method: string;
  source: Record<string, unknown>;
  why: string;
};

type Row = {
  id: string;
  company: string;
  facility: string;
  sector: string;
  goal: string;
  fit: FitCategory;
  state: string;
  st: string;
  city: string;
  zip: string;
  source: string;
  rawStreet: string;
  street: string | null;
};

function sheetTable(wb: XLSX.WorkBook, name: string, headerRow: number): unknown[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`sheet "${name}" not found (${wb.SheetNames.join(", ")})`);
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, range: headerRow, defval: "" });
}

function columns(header: unknown[]) {
  const h = header.map((x) => s(x).toLowerCase());
  return (label: string) => {
    const i = h.findIndex((x) => x === label.toLowerCase());
    if (i < 0) throw new Error(`column "${label}" not in header: ${h.join(" | ")}`);
    return i;
  };
}

function readAll(wb: XLSX.WorkBook): Row[] {
  const table = sheetTable(wb, SHEET_ALL, 2);
  const col = columns(table[0] ?? []);
  const i = {
    state: col("State"),
    company: col("Company"),
    facility: col("Facility/Site Name"),
    street: col("Street Address"),
    city: col("City"),
    st: col("State Code"),
    zip: col("ZIP"),
    sector: col("Sector"),
    goal: col("Sustainability/ESG Goal"),
    fit: col("Fit Category"),
    source: col("Source"),
    // "Parjana Product Fit" (J) and "Notes" (M) are deliberately not read.
  };
  const rows: Row[] = [];
  for (const r of table.slice(1)) {
    if (!r.some((c) => s(c))) continue;
    const company = s(r[i.company]);
    const facility = s(r[i.facility]);
    const st = s(r[i.st]).toUpperCase();
    const id = createHash("sha1").update(`${company}|${facility}|${st}`).digest("hex").slice(0, 10);
    const rawStreet = s(r[i.street]);
    rows.push({
      id,
      company,
      facility,
      sector: s(r[i.sector]),
      goal: s(r[i.goal]),
      fit: fitCategory(s(r[i.fit])),
      state: s(r[i.state]),
      st,
      city: s(r[i.city]),
      zip: s(r[i.zip]),
      source: s(r[i.source]),
      rawStreet,
      street: normalizeStreet(rawStreet),
    });
  }
  return rows;
}

function readStates(wb: XLSX.WorkBook) {
  const table = sheetTable(wb, SHEET_STATE, 0);
  const col = columns(table[0] ?? []);
  const iState = col("State"), iSt = col("State Code"), iFac = col("Facilities Listed"), iCo = col("Distinct Companies");
  return table
    .slice(1)
    .filter((r) => s(r[iSt]).length === 2)
    .map((r) => ({ state: s(r[iState]), st: s(r[iSt]).toUpperCase(), listed: Number(r[iFac]) || 0, companies: Number(r[iCo]) || 0 }));
}

function readCompanies(wb: XLSX.WorkBook) {
  const table = sheetTable(wb, SHEET_COMPANY, 0);
  const col = columns(table[0] ?? []);
  const iCo = col("Company"), iFac = col("Facilities Nationwide"), iStates = col("States Present"), iFit = col("Fit Category");
  return table
    .slice(1)
    .filter((r) => s(r[iCo]))
    .map((r) => ({ company: s(r[iCo]), facilities: Number(r[iFac]) || 0, states: s(r[iStates]), fit: fitCategory(s(r[iFit])) }));
}

async function loadOverrides(): Promise<Record<string, Override>> {
  try {
    const parsed = JSON.parse(await readFile(OVERRIDES, "utf8")) as Record<string, unknown>;
    const out: Record<string, Override> = {};
    for (const [k, v] of Object.entries(parsed)) if (!k.startsWith("_")) out[k] = v as Override;
    return out;
  } catch {
    return {};
  }
}

async function main() {
  const xlsx = arg("xlsx");
  if (!xlsx) throw new Error("--xlsx=<path to Master_50State_ESG_Companies_All_Locations.xlsx> is required");
  const wb = XLSX.read(await readFile(xlsx), { type: "buffer" });
  const rows = readAll(wb);
  const states = readStates(wb);
  const companies = readCompanies(wb);
  const overrides = await loadOverrides();
  console.log(`rows: ${rows.length} · states tab: ${states.length} · companies tab: ${companies.length}`);

  const geocodable = rows.filter((r): r is Row & { street: string } => r.street !== null);
  const cache = await loadCache();
  await geocodeBatch(
    geocodable.map((r) => ({ street: r.street, city: r.city, state: r.st, zip: r.zip })),
    cache
  );

  const features: GeoJsonFeature[] = [];
  const unplaced: EsgSummary["unplaced"] = [];
  const approximate: EsgSummary["approximate"] = [];
  const placedByState = new Map<string, number>();
  const placedByCompany = new Map<string, number>();
  const byFit = Object.fromEntries(FIT_CATEGORIES.map((f) => [f, 0])) as Record<FitCategory, number>;
  const byPlacement = Object.fromEntries(PLACEMENTS.map((p) => [p, 0])) as Record<Placement, number>;
  const usedOverrides: Record<string, unknown>[] = [];
  const osmPlaced: Record<string, unknown>[] = [];
  const hasStreetText = (raw: string) => Boolean(raw) && !/^n\/?a\b/i.test(raw) && !/^\(/.test(raw);

  for (const r of rows) {
    const key = `${r.company}|${r.facility}`;
    let lng: number | undefined, lat: number | undefined;
    let placement: Placement = "census";
    let reason = "";

    // 1. Census street-level.
    if (r.street) {
      const addr = { street: r.street, city: r.city, state: r.st, zip: r.zip };
      const g = cache[addrKey(addr)];
      if (g && g.match === "Match" && g.lng != null && g.lat != null) {
        if (matchAgrees(g, addr)) {
          lng = g.lng;
          lat = g.lat;
        } else reason = "geocode disagrees on city and ZIP";
      } else reason = "no Census street match";
    } else reason = r.rawStreet ? `no house number: "${r.rawStreet}"` : "no street address";

    // 2. OSM building / campus for the address as written (handles "One Apple Park Way").
    if (lng == null && hasStreetText(r.rawStreet)) {
      const hit = await placeAddress(r.rawStreet.split(/\s+\/\s+/)[0], r.city.split(/\s*[\/(]/)[0], r.st, zip5(r.zip));
      if (hit) {
        lng = hit.lng;
        lat = hit.lat;
        placement = "osm";
        osmPlaced.push({ key, osm: `${hit.osmType}/${hit.osmId}`, object: `${hit.category}/${hit.type}`, display: hit.display });
      }
    }

    // 3. Cited override.
    if (lng == null && overrides[key]) {
      const o = overrides[key];
      const want = `${r.rawStreet}|${r.city}|${r.st}|${zip5(r.zip)}`.toLowerCase();
      if (o.address.toLowerCase() !== want) throw new Error(`${key}: override address "${o.address}" ≠ sheet "${want}"`);
      lng = o.lng;
      lat = o.lat;
      placement = "override";
      usedOverrides.push({ key, ...o });
      console.log(`  override ${key}: ${o.method}`);
    }

    // 4. City centre, flagged.
    if (lng == null) {
      const hit = await placeCity(r.city, r.st);
      if (hit) {
        lng = hit.lng;
        lat = hit.lat;
        placement = "city";
        approximate.push({ company: r.company, facility: r.facility, city: r.city, st: r.st, reason });
      }
    }

    if (lng == null || lat == null) {
      unplaced.push({ company: r.company, facility: r.facility, city: r.city, st: r.st, reason: `${reason}; no city match` });
      continue;
    }
    byPlacement[placement]++;

    const props: EsgProps = {
      id: r.id,
      company: r.company,
      facility: r.facility,
      sector: r.sector,
      goal: r.goal,
      fit: r.fit,
      state: r.state,
      st: r.st,
      city: r.city,
      source: r.source,
      placement,
    };
    features.push({
      type: "Feature",
      properties: props,
      geometry: { type: "Point", coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))] },
    });
    byFit[r.fit]++;
    placedByState.set(r.st, (placedByState.get(r.st) ?? 0) + 1);
    placedByCompany.set(r.company, (placedByCompany.get(r.company) ?? 0) + 1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const summary: EsgSummary = {
    built: today,
    facilities: features.length,
    companies: placedByCompany.size,
    states: placedByState.size,
    byState: states.map((x) => ({ ...x, placed: placedByState.get(x.st) ?? 0 })),
    byCompany: companies
      .map((c) => ({ ...c, placed: placedByCompany.get(c.company) ?? 0 }))
      .sort((a, b) => a.company.localeCompare(b.company)),
    byFit,
    byPlacement,
    approximate,
    unplaced,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, "esg.geojson"), JSON.stringify({ type: "FeatureCollection", features }));
  await writeFile(join(OUT_DIR, "esg-summary.json"), JSON.stringify(summary, null, 1));
  const workbook = await readFile(xlsx);
  await writeFile(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        scope: "us",
        layers: {
          "esg.geojson": {
            source: "Master_50State_ESG_Companies_All_Locations.xlsx",
            sourceSha256: createHash("sha256").update(workbook).digest("hex"),
            sheets: [SHEET_ALL, SHEET_STATE, SHEET_COMPANY, "Legend"],
            columnsShipped: ["Company", "Facility/Site Name", "City", "State", "State Code", "Sector", "Sustainability/ESG Goal", "Fit Category", "Source"],
            columnsNeverShipped: ["Street Address (used for geocoding only)", "Parjana Product Fit", "Notes"],
            placement: {
              census: `US Census batch (${BENCHMARK}), street-level Match, ZIP or city agreement`,
              osm: "OpenStreetMap Nominatim building/campus object for the written address; road interpolations rejected. © OpenStreetMap contributors, ODbL",
              override: "cited authoritative record (data/summit/esg-overrides.json)",
              city: "OpenStreetMap Nominatim city/town centroid; drawn hollow and captioned approximate",
              counts: byPlacement,
            },
            osmPlaced,
            coordinateOverrides: usedOverrides,
            rows: rows.length,
            placed: features.length,
            approximate: approximate.length,
            unplaced: unplaced.length,
            built: today,
          },
        },
      },
      null,
      2
    ) + "\n"
  );

  console.log(`placed ${features.length}/${rows.length} · ${placedByCompany.size} companies · ${placedByState.size} states`);
  console.log("by fit:", byFit);
  console.log("by placement:", byPlacement);
  if (approximate.length) {
    console.log(`approximate (city centre) ${approximate.length}:`);
    for (const u of approximate) console.log(`  ${u.st} ${u.company} — ${u.facility} (${u.city}): ${u.reason}`);
  }
  if (unplaced.length) {
    console.log(`unplaced ${unplaced.length}:`);
    for (const u of unplaced) console.log(`  ${u.st} ${u.company} — ${u.facility} (${u.city}): ${u.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
